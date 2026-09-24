/* ==========================================================================
   [모듈] 기록 사진 UI (ui-photo.js)
   [역할]
   - 기록에 사진을 추가/삭제/확대보기하고, 사진 파일을 압축하거나 저장합니다.
   - 사진 모달, 사진 선택 메뉴, 네이티브 저장 연동을 담당합니다.
   [참고]
   - 기록 사진 표시나 사진 추가/삭제가 이상할 때 확인합니다.
   ========================================================================== */
import { AppState } from './state.js';
import { drawnItems } from './draw.js';
import { getRecordName, resizeImage } from './utils.js';
import { saveToStorage } from './data.js';
import { renderSurveyList } from './ui-project.js';
import { isNativeApp, pickNativePhotos, saveBase64FileNative } from './native-bridge.js';
import { showAppConfirm } from './app-dialog.js';
import { validateRuntimeDependencies } from './runtime-dependencies.js';

export let currentPhotoList = [];
export let currentPhotoIndex = 0;
export let currentPhotoLayerId = null;
let currentPhotoEntries = [];
let updateLayerInfo;

export function configurePhotoRuntime(dependencies) {
    const validatedDependencies = validateRuntimeDependencies('photo', dependencies, {
        updateLayerInfo: 'function'
    });
    ({ updateLayerInfo } = validatedDependencies);
}

const PHOTO_SWIPE_MIN_DISTANCE = 50;
const PHOTO_SWIPE_DIRECTION_RATIO = 1.2;
const PHOTO_SWIPE_ANIMATION_MS = 180;

function ensurePhotoSwipeHandlers() {
    const content = document.querySelector('.photo-modal-content');
    if (!content || content.dataset.swipeBound === 'true') return;

    let startX = null;
    let startY = null;
    let isAnimating = false;

    const getPhotoImage = () => document.getElementById('photo-modal-img');

    const animateToRest = () => {
        const image = getPhotoImage();
        if (!image) return;
        image.style.transition = `transform ${PHOTO_SWIPE_ANIMATION_MS}ms ease-out, opacity ${PHOTO_SWIPE_ANIMATION_MS}ms ease-out`;
        image.style.transform = 'translate3d(0, 0, 0)';
        image.style.opacity = '1';
    };

    const resetSwipe = () => {
        startX = null;
        startY = null;
    };

    const completeSwipe = direction => {
        const image = getPhotoImage();
        if (!image || isAnimating) return;
        isAnimating = true;

        const exitX = direction === 'next' ? '-110%' : '110%';
        const enterX = direction === 'next' ? '35%' : '-35%';
        image.style.transition = `transform ${PHOTO_SWIPE_ANIMATION_MS}ms ease-in, opacity ${PHOTO_SWIPE_ANIMATION_MS}ms ease-in`;
        image.style.transform = `translate3d(${exitX}, 0, 0)`;
        image.style.opacity = '0';

        setTimeout(() => {
            if (direction === 'next') nextPhoto();
            else prevPhoto();

            image.style.transition = 'none';
            image.style.transform = `translate3d(${enterX}, 0, 0)`;
            image.style.opacity = '0';

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    animateToRest();
                    setTimeout(() => { isAnimating = false; }, PHOTO_SWIPE_ANIMATION_MS);
                });
            });
        }, PHOTO_SWIPE_ANIMATION_MS);
    };

    content.addEventListener('touchstart', event => {
        if (isAnimating || event.touches.length !== 1) {
            resetSwipe();
            return;
        }
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
    }, { passive: true });

    content.addEventListener('touchmove', event => {
        if (startX === null || startY === null || event.touches.length !== 1) return;

        const deltaX = event.touches[0].clientX - startX;
        const deltaY = event.touches[0].clientY - startY;
        if (Math.abs(deltaX) <= Math.abs(deltaY)) return;

        event.preventDefault();
        const image = getPhotoImage();
        if (!image) return;
        const fadeAmount = Math.min(Math.abs(deltaX) / Math.max(content.clientWidth, 1) * 0.35, 0.35);
        image.style.transition = 'none';
        image.style.transform = `translate3d(${deltaX}px, 0, 0)`;
        image.style.opacity = String(1 - fadeAmount);
    }, { passive: false });

    content.addEventListener('touchend', event => {
        if (startX === null || startY === null || event.changedTouches.length === 0) return;

        const deltaX = event.changedTouches[0].clientX - startX;
        const deltaY = event.changedTouches[0].clientY - startY;
        resetSwipe();

        const horizontalDistance = Math.abs(deltaX);
        const verticalDistance = Math.abs(deltaY);
        if (currentPhotoList.length <= 1
            || horizontalDistance < PHOTO_SWIPE_MIN_DISTANCE
            || horizontalDistance < verticalDistance * PHOTO_SWIPE_DIRECTION_RATIO) {
            animateToRest();
            return;
        }

        completeSwipe(deltaX < 0 ? 'next' : 'prev');
    }, { passive: true });

    content.addEventListener('touchcancel', () => {
        resetSwipe();
        animateToRest();
    }, { passive: true });
    content.dataset.swipeBound = 'true';
}

const PHOTO_INPUT_PERMISSION_GRACE_MS = 5 * 60 * 1000;
let pendingPhotoInputPermission = null;

function sanitizePhotoFileNamePart(value) {
    const sanitized = String(value || '기록')
        .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/g, '')
        .trim();
    return sanitized || '기록';
}

function getPhotoMimeType(photo) {
    const match = String(photo || '').match(/^data:([^;,]+)/i);
    return match?.[1]?.toLowerCase() || 'image/jpeg';
}

function getPhotoFileExtension(photo) {
    const mimeType = getPhotoMimeType(photo);
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    if (mimeType === 'image/gif') return 'gif';
    return 'jpg';
}

function createPhotoFileName(entry) {
    const recordName = sanitizePhotoFileNamePart(entry?.recordName || '기록');
    const photoNumber = Number(entry?.photoIndex) + 1;
    const extension = getPhotoFileExtension(entry?.photo);
    return `photo_${recordName}_${Number.isFinite(photoNumber) ? photoNumber : 1}.${extension}`;
}

function getProjectPhotoEntries() {
    const entries = [];
    drawnItems.getLayers().forEach(layer => {
        const props = layer.feature?.properties || {};
        const photos = Array.isArray(props.photos) ? props.photos : [];
        const recordName = getRecordName(props, '기록') || '기록';
        photos.forEach((photo, photoIndex) => {
            entries.push({
                photo,
                photoIndex,
                layerId: props.id,
                recordName
            });
        });
    });
    return entries;
}

function getCurrentProjectName() {
    const project = AppState.projects.find(item => String(item.id) === String(AppState.currentProjectId));
    return project?.name || '프로젝트';
}

function renderProjectPhotoThumbnails() {
    const container = document.getElementById('photo-modal-thumbnails');
    if (!container) return;
    container.innerHTML = '';
    currentPhotoEntries.forEach((entry, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'photo-modal-thumbnail-btn';
        button.dataset.photoIndex = String(index);
        button.title = `${entry.recordName} · ${createPhotoFileName(entry)}`;
        button.setAttribute('aria-label', `${entry.recordName} ${entry.photoIndex + 1}번째 사진`);

        const image = document.createElement('img');
        image.src = entry.photo;
        image.alt = '';
        button.appendChild(image);
        button.onclick = () => {
            currentPhotoIndex = index;
            updateModalImage();
        };
        container.appendChild(button);
    });
}

function getPhotoDownloadEntries(scope) {
    const currentEntry = currentPhotoEntries[currentPhotoIndex];
    if (!currentEntry) return [];
    if (scope === 'current') return [currentEntry];
    if (scope === 'record') {
        return currentPhotoEntries.filter(entry => entry.layerId === currentEntry.layerId);
    }
    if (scope === 'project') return [...currentPhotoEntries];
    return [];
}

function ensurePhotoDownloadMenu() {
    let overlay = document.getElementById('photo-download-modal-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'photo-download-modal-overlay';
    overlay.className = 'nav-modal-overlay';
    overlay.style.zIndex = '10030';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.innerHTML = `
        <div onclick="event.stopPropagation()" style="width:min(380px, calc(100vw - 32px)); background:#fff; border-radius:12px; padding:18px; box-sizing:border-box;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px;">
                <div style="font-size:17px; font-weight:800; color:#111827;">사진 저장</div>
                <button type="button" id="photo-download-menu-close" style="width:34px; height:34px; border:0; background:#f3f4f6; border-radius:50%; color:#6b7280; font-size:20px; line-height:1;">&times;</button>
            </div>
            <div style="font-size:12px; color:#6b7280; line-height:1.45; margin-bottom:12px;">저장할 사진 범위를 선택하세요.</div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                <button type="button" class="photo-download-scope-btn" data-scope="current" style="width:100%; min-height:48px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; padding:10px 12px; text-align:center; font-size:14px; font-weight:700; color:#111827; cursor:pointer;">현재 사진 저장</button>
                <button type="button" class="photo-download-scope-btn" data-scope="record" style="width:100%; min-height:48px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; padding:10px 12px; text-align:center; font-size:14px; font-weight:700; color:#111827; cursor:pointer;">기록 내 모든 사진 저장<span data-photo-count="record" style="margin-left:2px; color:#2563eb; font-size:12px;"></span></button>
                <button type="button" class="photo-download-scope-btn" data-scope="project" style="width:100%; min-height:48px; border:1px solid #e5e7eb; border-radius:8px; background:#fff; padding:10px 12px; text-align:center; font-size:14px; font-weight:700; color:#111827; cursor:pointer;">프로젝트 내 모든 사진 저장<span data-photo-count="project" style="margin-left:2px; color:#2563eb; font-size:12px;"></span></button>
            </div>
        </div>`;
    overlay.onclick = closePhotoDownloadMenu;
    overlay.querySelector('#photo-download-menu-close').onclick = closePhotoDownloadMenu;
    overlay.querySelectorAll('.photo-download-scope-btn').forEach(button => {
        button.onclick = () => savePhotoEntries(getPhotoDownloadEntries(button.dataset.scope));
    });
    document.body.appendChild(overlay);
    return overlay;
}

export function openPhotoDownloadMenu() {
    if (currentPhotoEntries.length === 0) return;
    const overlay = ensurePhotoDownloadMenu();
    ['record', 'project'].forEach(scope => {
        const count = getPhotoDownloadEntries(scope).length;
        const countLabel = overlay.querySelector(`[data-photo-count="${scope}"]`);
        if (countLabel) countLabel.textContent = `(${count}장)`;
    });
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('visible'));
}

export function closePhotoDownloadMenu() {
    const overlay = document.getElementById('photo-download-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => {
        if (!overlay.classList.contains('visible')) overlay.style.display = 'none';
    }, 200);
}

async function savePhotoEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return;
    closePhotoDownloadMenu();

    if (isNativeApp()) {
        for (const entry of entries) {
            try {
                await saveBase64FileNative({
                    dataUrl: entry.photo,
                    fileName: createPhotoFileName(entry),
                    mimeType: getPhotoMimeType(entry.photo)
                });
            } catch (err) {
                if (err?.message !== 'Save canceled') alert('사진 저장 실패: ' + (err?.message || err));
                return;
            }
        }
        return;
    }

    entries.forEach(entry => {
        const link = document.createElement('a');
        link.download = createPhotoFileName(entry);
        link.href = entry.photo;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

function authorizePendingPhotoInput(layerId) {
    pendingPhotoInputPermission = {
        layerId,
        expiresAt: Date.now() + PHOTO_INPUT_PERMISSION_GRACE_MS
    };
}

function consumePendingPhotoInputPermission(layerId) {
    if (!pendingPhotoInputPermission) return false;
    const isValid = pendingPhotoInputPermission.layerId === layerId && pendingPhotoInputPermission.expiresAt >= Date.now();
    pendingPhotoInputPermission = null;
    return isValid;
}

/**
 * [함수] createPhotoThumbnailItem
 * [역할] 사진 썸네일 한 줄 항목 DOM을 생성한다.
 * [원리] 이미지와 삭제 버튼을 묶은 wrapper를 만들고 기존 인라인 이벤트를 그대로 연결한다.
 */
function createPhotoThumbnailItem(layerId, photo, index) {
    const wrapper = document.createElement('div');
    wrapper.className = 'photo-thumbnail-wrapper';
    wrapper.style.cssText = 'width:85px; height:85px;';

    const image = document.createElement('img');
    image.src = photo;
    image.className = 'photo-thumbnail';
    image.style.borderRadius = '4px';
    image.setAttribute('onclick', `openPhotoModal(${layerId}, ${index})`);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'btn-delete-photo';
    deleteButton.setAttribute('onclick', `deletePhoto(${layerId}, ${index})`);
    deleteButton.textContent = '✕';

    wrapper.appendChild(image);
    wrapper.appendChild(deleteButton);
    return wrapper;
}

/**
 * [함수] createPhotoThumbnailSection
 * [역할] 사진 썸네일 영역 HTML을 생성한다.
 * [원리] 사진 배열을 순회하며 썸네일 항목 DOM을 만들고 컨테이너 outerHTML로 반환한다.
 */
function createPhotoThumbnailSection(layerId, photos) {
    if (!photos.length) return '';

    const container = document.createElement('div');
    container.className = 'photo-container';
    container.style.cssText = 'margin-top:10px; margin-bottom:10px;';

    photos.forEach((photo, index) => {
        container.appendChild(createPhotoThumbnailItem(layerId, photo, index));
    });

    return container.outerHTML;
}

/**
 * [함수] createPhotoInputElement
 * [역할] 숨김 파일 입력 DOM을 생성한다.
 * [원리] 공통 속성과 추가 속성을 함께 주입해 카메라/갤러리 입력 요소를 재사용 가능하게 만든다.
 */
function createPhotoInputElement(id, layerId, accept, extraAttributes) {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = id;
    input.accept = accept;
    input.style.display = 'none';
    input.setAttribute('onchange', `processPhotoFiles(this, ${layerId})`);

    Object.entries(extraAttributes).forEach(([key, value]) => {
        if (value === true) input.setAttribute(key, key);
        else input.setAttribute(key, value);
    });

    return input;
}

/**
 * [함수] createPhotoActionButton
 * [역할] 사진 선택 메뉴 호출 버튼 DOM을 생성한다.
 * [원리] 기존 인라인 이벤트와 아이콘 구조를 유지한 버튼 요소를 구성해 반환한다.
 */
function createPhotoActionButton(layerId) {
    const button = document.createElement('button');
    button.className = 'popup-btn';
    button.style.cssText = 'background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;';
    button.setAttribute('onclick', `openPhotoSelectMenu(event, ${layerId})`);
    button.innerHTML = `
        <svg viewBox="0 0 24 24" style="width:14px; height:14px; fill:#555;"><path d="M19 7v2.99s-1.99.01-2 0V7h-3s.01-1.99 0-2h3V2h2v3h3v2h-3zm-3 4V8h-3V5H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8h-3zM5 19l3-4 2 3 3-4 4 5H5z"/></svg>사진
    `;
    return button;
}

/**
 * [함수] createPhotoActionGridSection
 * [역할] 사진 액션 영역 조립에 필요한 HTML 조각을 생성한다.
 * [원리] 카메라/갤러리 입력과 사진 버튼을 만들고 바텀시트에서 재사용할 문자열 조합으로 반환한다.
 */
function createPhotoActionGridSection(layerId) {
    const section = document.createElement('div');
    section.style.cssText = 'margin-top:10px; display:grid; grid-template-columns:1fr 1fr; gap:5px;';

    const cameraInput = createPhotoInputElement(`input-cam-${layerId}`, layerId, 'image/*', { capture: 'environment' });
    const galleryInput = createPhotoInputElement(`input-gal-${layerId}`, layerId, 'image/*', { multiple: true });
    const photoButton = createPhotoActionButton(layerId);

    return {
        inputElementsHtml: cameraInput.outerHTML + galleryInput.outerHTML,
        actionButtonHtml: photoButton.outerHTML,
        gridStyle: section.style.cssText
    };
}

/**
 * [함수] createLayerPhotoSection
 * [역할] 레이어 상세의 사진 영역 HTML 조각을 생성한다.
 * [원리] 썸네일 영역과 액션 그리드 구성을 한 번에 묶어 호출부가 구조만 조합하도록 만든다.
 */
export function createLayerPhotoSection(layerId, photos) {
    const actionGrid = createPhotoActionGridSection(layerId);

    return {
        thumbnailsHtml: createPhotoThumbnailSection(layerId, photos),
        inputElementsHtml: actionGrid.inputElementsHtml,
        actionButtonHtml: actionGrid.actionButtonHtml,
        gridStyle: actionGrid.gridStyle
    };
}

/**
 * [함수] openPhotoSelectMenu
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openPhotoSelectMenu(e, id) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    currentPhotoLayerId = id;
    const overlay = document.getElementById('photo-modal-overlay');
    const container = document.getElementById('photo-modal-container');
    if (overlay && container) {
        overlay.style.display = 'flex';
        container.style.display = 'flex';
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
            container.classList.add('visible');
        });
    }
}

/**
 * [함수] closePhotoSelectMenu
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closePhotoSelectMenu() {
    const overlay = document.getElementById('photo-modal-overlay');
    const container = document.getElementById('photo-modal-container');
    if (overlay && container) {
        overlay.classList.remove('visible');
        container.classList.remove('visible');
        setTimeout(() => {
            if (!overlay.classList.contains('visible')) {
                overlay.style.display = 'none';
                container.style.display = 'none';
            }
        }, 200);
    }
    currentPhotoLayerId = null;
}

/**
 * [함수] handlePhotoMenuAction
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 이벤트 컨텍스트를 해석해 예외/가드 조건을 먼저 처리하고,
 *        조건에 맞는 작업 함수로 분기해 사용자 의도에 맞는 동작을 실행한다.
 */
export async function handlePhotoMenuAction(type) {
    if (!currentPhotoLayerId) return;
    const targetId = currentPhotoLayerId;
    authorizePendingPhotoInput(targetId);
    closePhotoSelectMenu();
    if (type === 'gallery' && isNativeApp() && targetId === 'new-photo-point' && typeof window.processNativePendingPhotoItems === 'function') {
        try {
            const result = await pickNativePhotos({ maxCount: 5 });
            const items = Array.isArray(result?.items) ? result.items : [];
            if (items.length > 0) await window.processNativePendingPhotoItems(items);
        } catch (error) {
            if (error?.message !== 'Photo selection canceled') {
                console.error(error);
                alert(`사진을 선택하지 못했습니다.\n${error.message || error}`);
            }
        }
        return;
    }
    setTimeout(() => {
        if (type === 'camera') {
            const input = document.getElementById(`input-cam-${targetId}`);
            if (input) input.click();
        } else if (type === 'gallery') {
            const input = document.getElementById(`input-gal-${targetId}`);
            if (input) input.click();
        }
    }, 100);
}

/**
 * [함수] processPhotoFiles
 * [역할] 입력 데이터를 후처리한 뒤 저장/표시에 반영한다.
 * [원리] 입력 데이터(파일/값)를 비동기로 변환·검증한 뒤,
 *        대상 속성에 반영하고 저장 및 화면 갱신을 연쇄 실행한다.
 */
export function processPhotoFiles(input, layerId) {
    consumePendingPhotoInputPermission(layerId);
    pendingPhotoInputPermission = null;
    const files = input.files;
    if (!files || files.length === 0) return;
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === layerId);
    if (!layer) return;
    if (!layer.feature.properties.photos) {
        layer.feature.properties.photos = [];
    }
    const currentCount = layer.feature.properties.photos.length;
    const newCount = files.length;
    if (currentCount + newCount > 5) {
        alert('사진은 최대 5장까지만 저장할 수 있습니다.');
        input.value = '';
        return;
    }
    const promises = Array.from(files).map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                resizeImage(e.target.result, 800, 0.8).then(resizedBase64 => {
                    resolve(resizedBase64);
                });
            };
            reader.readAsDataURL(file);
        });
    });
    Promise.all(promises).then(results => {
        results.forEach(base64 => {
            layer.feature.properties.photos.push(base64);
        });
        saveToStorage();
        updateLayerInfo(layer);
        if (AppState.currentDrawer !== 'track') {
            layer.fire('click');
        } else {
            renderSurveyList();
        }
        input.value = '';
        const tempContainer = document.getElementById(`temp-inputs-${layerId}`);
        if (tempContainer) {
            tempContainer.remove();
        }
    });
}

/**
 * [함수] deletePhoto
 * [역할] 대상을 삭제하고 후속 UI/저장 상태를 정리한다.
 * [원리] 삭제 대상 존재와 사용자 확인을 먼저 검증한 뒤,
 *        컬렉션에서 제거하고 저장·리스트 갱신·선택 상태 정리를 순서대로 수행한다.
 */
export async function deletePhoto(layerId, index) {
    if (!await showAppConfirm('이 사진을 삭제하시겠습니까?', { title: '사진 삭제' })) return;
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === layerId);
    if (layer && layer.feature.properties.photos) {
        layer.feature.properties.photos.splice(index, 1);
        saveToStorage();
        updateLayerInfo(layer);
        layer.fire('click');
    }
}

/**
 * [함수] openPhotoModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openPhotoModal(layerId, index) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === layerId);
    if (!layer || !layer.feature.properties.photos) return;
    currentPhotoEntries = getProjectPhotoEntries();
    currentPhotoList = currentPhotoEntries.map(entry => entry.photo);
    const selectedIndex = currentPhotoEntries.findIndex(entry => entry.layerId === layerId && entry.photoIndex === index);
    currentPhotoIndex = selectedIndex >= 0 ? selectedIndex : 0;
    ensurePhotoSwipeHandlers();
    renderProjectPhotoThumbnails();
    updateModalImage();
    const modal = document.getElementById('photo-modal');
    modal.style.display = 'flex';
    setTimeout(() => { modal.classList.add('visible'); }, 10);
}

/**
 * [함수] updateModalImage
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
export function updateModalImage() {
    const img = document.getElementById('photo-modal-img');
    const counter = document.getElementById('photo-counter');
    const fileName = document.getElementById('photo-modal-filename');
    const projectName = document.getElementById('photo-modal-project-name');
    const recordName = document.getElementById('photo-modal-record-name');
    const currentEntry = currentPhotoEntries[currentPhotoIndex];
    if (currentPhotoList.length > 0) {
        img.src = currentPhotoList[currentPhotoIndex];
    }
    counter.innerText = `${currentPhotoIndex + 1} / ${currentPhotoList.length}`;
    if (fileName) {
        fileName.textContent = createPhotoFileName(currentEntry);
        fileName.title = fileName.textContent;
    }
    if (projectName) projectName.textContent = getCurrentProjectName();
    if (recordName) recordName.textContent = currentEntry?.recordName || '기록';

    const thumbnails = document.querySelectorAll('#photo-modal-thumbnails .photo-modal-thumbnail-btn');
    thumbnails.forEach((thumbnail, index) => thumbnail.classList.toggle('active', index === currentPhotoIndex));
    const activeThumbnail = document.querySelector('#photo-modal-thumbnails .photo-modal-thumbnail-btn.active');
    activeThumbnail?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

/**
 * [함수] nextPhoto
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function nextPhoto() {
    if (currentPhotoList.length <= 1) return;
    currentPhotoIndex = (currentPhotoIndex + 1) % currentPhotoList.length;
    updateModalImage();
}

/**
 * [함수] prevPhoto
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function prevPhoto() {
    if (currentPhotoList.length <= 1) return;
    currentPhotoIndex = (currentPhotoIndex - 1 + currentPhotoList.length) % currentPhotoList.length;
    updateModalImage();
}

/**
 * [함수] downloadCurrentPhoto
 * [역할] 현재 데이터를 파일 형태로 내려받게 한다.
 * [원리] 현재 선택 대상에서 파일/리소스 정보를 구성해 내려받기를 시작하고,
 *        진행 상태와 완료 후 UI 복구를 함께 처리해 사용자 피드백을 유지한다.
 */
export async function downloadCurrentPhoto() {
    if (currentPhotoList.length === 0) return;
    const currentEntry = currentPhotoEntries[currentPhotoIndex];
    await savePhotoEntries(currentEntry ? [currentEntry] : []);
}

/**
 * [함수] closePhotoModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closePhotoModal() {
    closePhotoDownloadMenu();
    const modal = document.getElementById('photo-modal');
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => {
        if (modal.classList.contains('visible')) return;
        modal.style.display = 'none';
        document.getElementById('photo-modal-img').src = '';
        const fileName = document.getElementById('photo-modal-filename');
        if (fileName) fileName.textContent = '';
        const thumbnails = document.getElementById('photo-modal-thumbnails');
        if (thumbnails) thumbnails.innerHTML = '';
        const projectName = document.getElementById('photo-modal-project-name');
        const recordName = document.getElementById('photo-modal-record-name');
        if (projectName) projectName.textContent = '';
        if (recordName) recordName.textContent = '';
        currentPhotoEntries = [];
        currentPhotoList = [];
        currentPhotoIndex = 0;
    }, 300);
}
