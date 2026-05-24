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
import { resizeImage } from './utils.js';
import { saveToStorage } from './data.js';
import { updateLayerInfo } from './ui-core.js';
import { renderSurveyList } from './ui-project.js';
import { isNativeApp, saveBase64FileNative } from './native-bridge.js';
import { showAppConfirm } from './app-dialog.js';
import { AUTH_FEATURES, canUseFeature, getAuthState } from './auth.js';

export let currentPhotoList = [];
export let currentPhotoIndex = 0;
export let currentPhotoLayerId = null;

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
    if (!canUseFeature(AUTH_FEATURES.PHOTO_RECORDING, getAuthState())) {
        return {
            thumbnailsHtml: createPhotoThumbnailSection(layerId, photos),
            inputElementsHtml: '',
            actionButtonHtml: '',
            gridStyle: 'display:none;'
        };
    }

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
    if (!canUseFeature(AUTH_FEATURES.PHOTO_RECORDING, getAuthState())) {
        alert('사진 추가는 인증된 회원과 관리자 계정만 사용할 수 있습니다.');
        return;
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
export function handlePhotoMenuAction(type) {
    if (!currentPhotoLayerId) return;
    if (!canUseFeature(AUTH_FEATURES.PHOTO_RECORDING, getAuthState())) {
        closePhotoSelectMenu();
        alert('사진 추가는 인증된 회원과 관리자 계정만 사용할 수 있습니다.');
        return;
    }
    const targetId = currentPhotoLayerId;
    closePhotoSelectMenu();
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
    if (!canUseFeature(AUTH_FEATURES.PHOTO_RECORDING, getAuthState())) {
        alert('사진 추가는 인증된 회원과 관리자 계정만 사용할 수 있습니다.');
        input.value = '';
        return;
    }
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
    currentPhotoList = layer.feature.properties.photos;
    currentPhotoIndex = index;
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
    const prevBtn = document.getElementById('photo-prev-btn');
    const nextBtn = document.getElementById('photo-next-btn');
    const counter = document.getElementById('photo-counter');
    if (currentPhotoList.length > 0) {
        img.src = currentPhotoList[currentPhotoIndex];
    }
    if (currentPhotoList.length > 1) {
        prevBtn.style.display = 'block';
        nextBtn.style.display = 'block';
    } else {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
    }
    counter.innerText = `${currentPhotoIndex + 1} / ${currentPhotoList.length}`;
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
    const base64Str = currentPhotoList[currentPhotoIndex];
    const now = new Date();
    const timestamp = now.getFullYear().toString().slice(2) +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
    const fileName = `photo_${timestamp}.jpg`;

    if (isNativeApp()) {
        try {
            await saveBase64FileNative({ dataUrl: base64Str, fileName, mimeType: 'image/jpeg' });
            return;
        } catch (err) {
            alert('사진 저장 실패: ' + (err?.message || err));
            return;
        }
    }

    const link = document.createElement('a');
    link.download = fileName;
    link.href = base64Str;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * [함수] closePhotoModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closePhotoModal() {
    const modal = document.getElementById('photo-modal');
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('photo-modal-img').src = '';
    }, 300);
}
