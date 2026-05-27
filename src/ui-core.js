/* ==========================================================================
   [모듈] UI 공통 조립부 (ui-core.js)
   [역할]
   - 여러 UI 모듈을 연결하고, 기존 외부 호출과 호환되는 공통 UI 함수를 제공합니다.
   - 사이드바, 바텀시트, 스타일, 검색, 레이어 액션 등으로 분리된 UI 기능을 묶습니다.
   [참고]
   - 새 UI 로직을 길게 추가하기보다 가능하면 전용 ui-*.js 파일에 두고 여기서는 연결합니다.
   ========================================================================== */
import { SVG_ICONS } from './config.js';
import { AppState } from './state.js';
import { map } from './map.js';
import { drawnItems, currentEditLayerId } from './draw.js';
import { copyText, getTmCoords, convertToDms, getRecordName, setRecordName, ensureRecordNameAlias, calculateProjectedLengthMeters, calculateProjectedAreaM2 } from './utils.js';
import { saveToStorage, exportSingleLayer } from './data.js';
import { showAppPrompt } from './app-dialog.js';
import {
    closeSidebar,
    isDockedSidebarViewport,
    openSidebar,
    refreshMapAfterSidebarLayout,
    switchSidebarTab,
    syncSidebarUI
} from './ui-sidebar.js';
import { closeRecordFab, highlightButton, resetButtonStyles, toggleRecordFab } from './ui-record-fab.js';
import { closeAllDropdowns, toggleAccordion, toggleMoreMenu, toggleProjectMenu } from './ui-dropdown.js';
import { scheduleViewportVectorOptimization } from './ui-viewport.js';
import { deleteLayerById, shareLocationText, updateLayerColor, zoomToLayer } from './ui-layer-actions.js';
import { deleteOfflineMapPackage, downloadOfflineMap, moveToOfflineMapPackage, renderOfflineMapPackageList, updateOfflineButton } from './ui-offline-map.js';
import {
    applyStyleSettings,
    closeStyleModal,
    getLayerFillOpacity,
    openStyleColorPicker,
    openStyleModal,
    openStyleModalForExternalLayer,
    selectFillOpacity,
    selectFillPattern,
    selectLineColorMode,
    selectLineStyle,
    selectLineStyleColor,
    selectLineWeight,
    selectMarkerSize,
    selectMarkerStyle,
    selectStyleColor,
    selectStyleTab,
    selectTileOpacity,
    syncFillPatternOverlays,
    syncSolidDotOverlays,
    toggleFillPatternOptions,
    toggleLineStyleOptions,
    toggleMarkerEmojiOptions,
    toggleStylePalette,
    updateFillOpacityLabel,
    updateLineWeightLabel,
    updateMarkerSizeLabel,
    updateTileOpacityLabel
} from './ui-style-modal.js';

import {
    initSearchSettings,
    toggleSearchBox,
    switchSearchTab,
    renderCoordSearchInputs,
    executeSearch,
    closeSearchResult,
    toggleHistorySave,
    clearHistoryAll,
    deleteHistoryItem,
    showHistoryPanel,
} from './ui-search.js';
import {
    setCurrentBottomSheetLayerId,
    openBottomSheet,
    closeBottomSheet,
    toggleBottomSheetState,
    toggleBottomSheetMoreMenu,
    syncBottomSheetHoleMenuForLayer,
    handleBottomSheetEdit,
    handleBottomSheetStyle,
    handleBottomSheetBringToFront,
    handleBottomSheetBringForward,
    handleBottomSheetSendToBack,
    handleBottomSheetSendBackward,
    moveLayerById,
    handleBottomSheetDelete,
    handleBottomSheetHole,
    handleBottomSheetHoleFill,
    showInfoPopup,
    fetchAndHighlightBoundary,
} from './ui-bottomsheet.js';
import {
    createNewProject,
    editProjectName,
    deleteCurrentProject,
    renderProjectList,
    openMoveProjectModal,
    createNewProjectAndMove,
    openMoveSelectionModal,
    closeMoveProjectModal,
    renderSurveyList,
    openSortModal,
    closeSortModal,
    applySortSetting,
    openProjectSortModal,
    closeProjectSortModal,
    applyProjectSortSetting,
    groupSelectedLayers,
    toggleRecordGroup,
    toggleRecordGroupVisibility,
    openRecordGroupMenu,
    handleRecordGroupMenuAction,
    hasRecordGroups,
    isLayerInRecordGroup,
    openAddRecordToGroupModal,
    closeAddRecordToGroupModal,
    removeRecordFromGroup
} from './ui-project.js';
import {
    createLayerPhotoSection,
    openPhotoSelectMenu,
    closePhotoSelectMenu,
    handlePhotoMenuAction,
    processPhotoFiles,
    deletePhoto,
    openPhotoModal,
    nextPhoto,
    prevPhoto,
    downloadCurrentPhoto,
    closePhotoModal
} from './ui-photo.js';
import {
    closeContextMenu,
    configureContextMenuActions,
    handleMenuAction,
    initContextMenu,
    openContextMenu
} from './ui-context-menu.js';
import {
    applyLayerVisibilityState,
    toggleLayerVisibility,
    updateLayerInfo
} from './ui-layer-detail.js';
export {
    applyLayerVisibilityState,
    toggleLayerVisibility,
    updateLayerInfo
} from './ui-layer-detail.js';

// --- 전역 UI 상태 ---
export {
    closeSidebar,
    isDockedSidebarViewport,
    openSidebar,
    refreshMapAfterSidebarLayout,
    switchSidebarTab,
    syncSidebarUI
} from './ui-sidebar.js';
export { closeRecordFab, highlightButton, resetButtonStyles, toggleRecordFab } from './ui-record-fab.js';
export { closeAllDropdowns, toggleAccordion, toggleMoreMenu, toggleProjectMenu } from './ui-dropdown.js';
export { scheduleViewportVectorOptimization } from './ui-viewport.js';
export { deleteLayerById, shareLocationText, updateLayerColor, zoomToLayer } from './ui-layer-actions.js';
export { deleteOfflineMapPackage, downloadOfflineMap, moveToOfflineMapPackage, renderOfflineMapPackageList, updateOfflineButton } from './ui-offline-map.js';
export {
    applyStyleSettings,
    closeStyleModal,
    getLayerFillOpacity,
    openStyleColorPicker,
    openStyleModal,
    openStyleModalForExternalLayer,
    selectFillOpacity,
    selectFillPattern,
    selectLineColorMode,
    selectLineStyle,
    selectLineStyleColor,
    selectLineWeight,
    selectMarkerSize,
    selectMarkerStyle,
    selectStyleColor,
    selectStyleTab,
    selectTileOpacity,
    syncFillPatternOverlays,
    syncSolidDotOverlays,
    toggleFillPatternOptions,
    toggleLineStyleOptions,
    toggleMarkerEmojiOptions,
    toggleStylePalette,
    updateFillOpacityLabel,
    updateLineWeightLabel,
    updateMarkerSizeLabel,
    updateTileOpacityLabel
} from './ui-style-modal.js';

export let currentMemoLayerId = null;
export let navTarget = { name: '', lat: 0, lng: 0 };
let isUiRuntimeInitialized = false;

/* --------------------------------------------------------------------------
   2. 접근 제어 UI (Access Control)
   -------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------
   3. 모달 및 팝업 제어 (Modal & Popup)
   -------------------------------------------------------------------------- */
/* 3-1. 메모/위치/설정/내비게이션 모달 */

/**
 * [함수] editLayerDescription
 * [역할] 기존 데이터 편집 흐름을 시작하거나 변경값을 반영한다.
 * [원리] 대상 엔티티를 조회해 기존 값을 입력 UI에 채운 뒤,
 *        사용자 확정값을 속성에 반영하고 저장/리렌더 흐름으로 후처리한다.
 */
export function editLayerDescription(id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;
    currentMemoLayerId = id;
    const existing = layer.feature.properties.description || "";
    document.getElementById('memo-input-textarea').value = existing;
    const overlay = document.getElementById('memo-modal-overlay');
    const container = document.getElementById('memo-modal-container');
    overlay.style.display = 'flex';
    container.style.display = 'flex';
    setTimeout(() => {
        overlay.classList.add('visible');
        container.classList.add('visible');
        document.getElementById('memo-input-textarea').focus();
    }, 10);
}

/**
 * [함수] closeMemoModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeMemoModal() {
    const overlay = document.getElementById('memo-modal-overlay');
    const container = document.getElementById('memo-modal-container');
    overlay.classList.remove('visible');
    container.classList.remove('visible');
    setTimeout(() => {
        overlay.style.display = 'none';
        container.style.display = 'none';
    }, 200);
    currentMemoLayerId = null;
}

/**
 * [함수] saveMemoAction
 * [역할] 변경된 내용을 저장소 또는 상태에 기록한다.
 * [원리] 현재 편집 대상과 입력값 유효성을 확인한 뒤,
 *        속성 반영 후 저장소 업데이트와 관련 UI 리렌더를 함께 실행한다.
 */
export function saveMemoAction() {
    if (currentMemoLayerId === null) return;
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === currentMemoLayerId);
    if (!layer) { closeMemoModal(); return; }
    const input = document.getElementById('memo-input-textarea').value;
    layer.feature.properties.description = input;
    updateLayerInfo(layer);
    saveToStorage();
    renderSurveyList();
    layer.fire('click');
    closeMemoModal();
}

/**
 * [함수] editLayerMemo
 * [역할] 기존 데이터 편집 흐름을 시작하거나 변경값을 반영한다.
 * [원리] 대상 엔티티를 조회해 기존 값을 입력 UI에 채운 뒤,
 *        사용자 확정값을 속성에 반영하고 저장/리렌더 흐름으로 후처리한다.
 */
export async function editLayerMemo(id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;
    const existing = getRecordName(layer.feature.properties, "");
    const input = await showAppPrompt("기록명을 입력하세요:", existing);
    if (input === null || input.trim() === "") return;
    setRecordName(layer.feature.properties, input.trim());
    updateLayerInfo(layer);
    saveToStorage();
    renderSurveyList();
    layer.fire('click');
}


/**
 * [함수] openLocationActionModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openLocationActionModal() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    const overlay = document.getElementById('location-action-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

/**
 * [함수] closeLocationActionModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeLocationActionModal() {
    const overlay = document.getElementById('location-action-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/**
 * [함수] openSettingsModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openSettingsModal() {
    closeSidebar();
    window.checkAppVersion?.();
    document.getElementsByName('coord-mode-select').forEach(r => { if (parseInt(r.value) === AppState.coordMode) r.checked = true; });
    document.getElementsByName('track-interval-select').forEach(r => { if (parseInt(r.value) === AppState.trackInterval) r.checked = true; });
    document.getElementsByName('snap-enabled-select').forEach(r => { if ((r.value === 'true') === AppState.isSnapEnabled) r.checked = true; });
    document.getElementsByName('viewport-simplify-select').forEach(r => { if ((r.value === 'true') === AppState.isViewportSimplifyEnabled) r.checked = true; });
    document.getElementsByName('vector-render-delay-select').forEach(r => { if ((r.value === 'true') === AppState.isVectorRenderDelayEnabled) r.checked = true; });
    const overlay = document.getElementById('settings-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

/**
 * [함수] closeSettingsModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeSettingsModal() {
    const overlay = document.getElementById('settings-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/**
 * [함수] openNavModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openNavModal(name, lat, lng) {
    navTarget = { name: name || "목적지", lat: lat, lng: lng };
    const overlay = document.getElementById('nav-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

/**
 * [함수] closeNavModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeNavModal() {
    const overlay = document.getElementById('nav-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/**
 * [함수] executeNavigation
 * [역할] 사용자 선택에 따라 실제 동작(이동/저장/연결)을 수행한다.
 * [원리] 사용자 선택값을 실제 실행 경로(URL/이동/저장 작업)로 변환하고,
 *        완료 후 모달 닫기·화면 갱신 등 후속 UI 정리까지 한 흐름으로 처리한다.
 */
export function executeNavigation(type) {
    const { name, lat, lng } = navTarget;
    let url = "";
    if (type === 'tmap') url = `tmap://route?goalname=${encodeURIComponent(name)}&goalx=${lng}&goaly=${lat}`;
    else if (type === 'naver') url = `nmap://navigation?dlat=${lat}&dlng=${lng}&dname=${encodeURIComponent(name)}&appname=F-Field`;
    else if (type === 'kakao') url = `kakaomap://route?ep=${lat},${lng}&by=CAR`;
    window.location.href = url;
    setTimeout(closeNavModal, 500);
}

/* --------------------------------------------------------------------------
   4. 피드백 및 시각 요소 (Feedback & Visuals)
   -------------------------------------------------------------------------- */
/* 4-1. 버튼 스타일 제어 */

/* --------------------------------------------------------------------------
   5. 기타 UI 요소 (Utility UI)
   -------------------------------------------------------------------------- */
/* 5-1. 전체화면, 좌표 표시 및 절전 모드 */

/**
 * [함수] updateCoordDisplay
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
export function updateCoordDisplay() {
    let lat = AppState.lastGpsLat;
    let lng = AppState.lastGpsLng;
    let text = "";
    if (AppState.coordMode === 2) {
        const tm = getTmCoords(lat, lng);
        text = "X: " + tm.x + " | Y: " + tm.y;
    } else if (AppState.coordMode === 1) text = "N " + lat.toFixed(4) + "° | E " + lng.toFixed(4) + "°";
    else text = convertToDms(lat, 'lat') + " | " + convertToDms(lng, 'lng');
    const el = document.getElementById('coord-display');
    if (el) el.innerText = text;
}

/**
 * [함수] initSleepSlider
 * [역할] 초기 이벤트와 기본 상태를 설정한다.
 * [원리] 초기 1회 실행 구간에서 기본값과 이벤트 연결을 세팅하고,
 *        중복 등록/중복 실행을 방지하는 가드 조건으로 안정성을 확보한다.
 */
export function initSleepSlider() {
    const sliderThumb = document.getElementById('sleep-slider-thumb');
    if (!sliderThumb) return;
    sliderThumb.addEventListener('touchstart', onSleepSliderTouchStart, { passive: false });
    document.addEventListener('touchmove', onSleepSliderTouchMove, { passive: false });
    document.addEventListener('touchend', onSleepSliderTouchEnd);
}

/**
 * [함수] onSleepSliderTouchStart
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function onSleepSliderTouchStart(e) {
    const overlay = document.getElementById('sleep-mode-overlay');
    if (!overlay || overlay.style.display === 'none') return;
    const sliderThumb = document.getElementById('sleep-slider-thumb');
    AppState.isDraggingSleepSlider = true;
    AppState.sleepStartX = e.touches[0].clientX;
    sliderThumb.classList.add('dragging');
    AppState.sleepMaxDragX = sliderThumb.parentElement.offsetWidth - 60;
}

/**
 * [함수] onSleepSliderTouchMove
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function onSleepSliderTouchMove(e) {
    if (!AppState.isDraggingSleepSlider) return;
    e.preventDefault();
    const sliderThumb = document.getElementById('sleep-slider-thumb');
    AppState.sleepCurrentX = e.touches[0].clientX - AppState.sleepStartX;
    if (AppState.sleepCurrentX < 0) AppState.sleepCurrentX = 0;
    if (AppState.sleepCurrentX > AppState.sleepMaxDragX) AppState.sleepCurrentX = AppState.sleepMaxDragX;
    sliderThumb.style.transform = `translateX(${AppState.sleepCurrentX}px)`;
}

/**
 * [함수] onSleepSliderTouchEnd
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function onSleepSliderTouchEnd(e) {
    if (!AppState.isDraggingSleepSlider) return;
    AppState.isDraggingSleepSlider = false;
    const sliderThumb = document.getElementById('sleep-slider-thumb');
    sliderThumb.classList.remove('dragging');
    if (AppState.sleepCurrentX >= AppState.sleepMaxDragX * 0.85) {
        unlockSleepMode();
    } else {
        sliderThumb.style.transform = `translateX(0px)`;
    }
}

/**
 * [함수] startSleepMode
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function startSleepMode() {
    const overlay = document.getElementById('sleep-mode-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        const sliderThumb = document.getElementById('sleep-slider-thumb');
        if (sliderThumb) sliderThumb.style.transform = `translateX(0px)`;
    }
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`전체화면 요청 실패: ${err.message}`);
        });
    }
}

/**
 * [함수] unlockSleepMode
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function unlockSleepMode() {
    const overlay = document.getElementById('sleep-mode-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        const sliderThumb = document.getElementById('sleep-slider-thumb');
        if (sliderThumb) sliderThumb.style.transform = `translateX(0px)`;
    }
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => {
            console.log(`전체화면 해제 실패: ${err.message}`);
        });
    }
}

/* 5-2. 컨텍스트 메뉴 및 드롭다운 */

/* --------------------------------------------------------------------------
   6. 이벤트 리스너 (DOM Events)
   -------------------------------------------------------------------------- */
/**
 * [함수] initUiEventListeners
 * [역할] 초기 이벤트와 기본 상태를 설정한다.
 * [원리] 문서/지도/레이어 이벤트를 한 번에 등록해 외부 클릭 닫기와 스와이프 동작을 처리하고,
 *        zoom/move 변화 시 오프라인 버튼 상태 및 벡터 렌더 최적화를 예약 호출한다.
 */
export function initUiEventListeners() {
    renderOfflineMapPackageList();

    // 검색창 외부 클릭 시 닫기
    document.addEventListener('mousedown', function (e) {
        const sc = document.getElementById('search-container');
        const btn = document.getElementById('btn-search-toggle');
        if (sc && sc.style.display === 'flex' && !sc.contains(e.target) && !btn.contains(e.target)) {
            sc.style.display = 'none';
        }
    });

    // 화면 터치 시 더보기 메뉴 닫기
    document.addEventListener('click', function (event) {
        const moreMenu = document.getElementById('bottom-sheet-more-menu');
        const moreBtn = document.getElementById('bottom-sheet-more-btn');
        if (moreMenu && moreMenu.classList.contains('visible')) {
            if (!moreMenu.contains(event.target) && (!moreBtn || !moreBtn.contains(event.target))) {
                moreMenu.classList.remove('visible');
                setTimeout(() => moreMenu.style.display = 'none', 100);
            }
        }
    });

    // 외부 클릭 시 모든 드롭다운 메뉴 닫기
    window.addEventListener('click', function (event) {
        closeAllDropdowns();

        const fab = document.getElementById('record-fab');
        if (fab?.classList.contains('expanded') && !fab.contains(event.target)) {
            closeRecordFab();
        }
    });

    // 우클릭(컨텍스트 메뉴) 방지
    document.addEventListener('contextmenu', function (e) {
        if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, { passive: false });

    window.addEventListener('resize', function () {
        const overlay = document.getElementById('sidebar-overlay');
        if (!overlay || !overlay.classList.contains('visible')) return;

        document.body.classList.toggle('sidebar-docked-open', isDockedSidebarViewport());
        refreshMapAfterSidebarLayout();
    });

    // 바텀시트 스와이프 드래그 닫기 기능
    const bs = document.getElementById('bottom-sheet');
    if (bs) {
        let startY = 0;
        let isDragging = false;
        let isScrollTop = true;

        const onDragStart = (e) => {
            if (!bs.classList.contains('open')) return;
            isScrollTop = bs.scrollTop <= 0;
            if (!isScrollTop) return;
            startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            isDragging = true;
            bs.style.transition = 'none';
        };

        const onDragMove = (e) => {
            if (!isDragging || !isScrollTop) return;
            let clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
            let deltaY = clientY - startY;
            if (deltaY > 0) {
                if (e.cancelable) e.preventDefault();
                bs.style.transform = `translate(-50%, ${deltaY}px)`;
            } else {
                bs.style.transform = `translate(-50%, 0px)`;
            }
        };

        const onDragEnd = (e) => {
            if (!isDragging) return;
            isDragging = false;
            bs.style.transition = '';
            let clientY = e.type.includes('mouse') ? e.clientY : (e.changedTouches ? e.changedTouches[0].clientY : startY);
            let deltaY = clientY - startY;
            const isFullOpen = bs.classList.contains('full-open');

            if (deltaY < -50) {
                if (!isFullOpen) bs.classList.add('full-open');
                bs.style.transform = '';
            } else if (deltaY > 50 && isFullOpen) {
                bs.classList.remove('full-open');
                bs.style.transform = '';
            } else if (deltaY > 100 && !isFullOpen) {
                closeBottomSheet();
                setTimeout(() => { bs.style.transform = ''; }, 300);
            } else {
                bs.style.transform = '';
            }
        };

        bs.addEventListener('touchstart', onDragStart, { passive: true });
        bs.addEventListener('touchmove', onDragMove, { passive: false });
        bs.addEventListener('touchend', onDragEnd);
        bs.addEventListener('touchcancel', onDragEnd);
        bs.addEventListener('mousedown', onDragStart);
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    }

    // 오프라인 지도 확대 레벨 체크 + 선/면 렌더링 최적화
    map.on('zoomend', updateOfflineButton);
    map.on('moveend', updateOfflineButton);
    map.on('zoomend moveend', () => scheduleViewportVectorOptimization({ delay: true }));
    map.on('zoomend moveend', syncSolidDotOverlays);
    map.on('zoomend moveend', syncFillPatternOverlays);
    drawnItems.on('layeradd layerremove', scheduleViewportVectorOptimization);
    drawnItems.on('layeradd layerremove', syncSolidDotOverlays);
    drawnItems.on('layeradd layerremove', syncFillPatternOverlays);

    setTimeout(updateOfflineButton, 100);
    setTimeout(scheduleViewportVectorOptimization, 120);
    setTimeout(syncSolidDotOverlays, 160);
    setTimeout(syncFillPatternOverlays, 180);
}

/* --------------------------------------------------------------------------
   9. 런타임 초기화 및 전역 바인딩 (Runtime Bootstrap)
   -------------------------------------------------------------------------- */

/**
 * [함수] bindUiActionsToWindow
 * [역할] 함수와 전역/이벤트 엔트리포인트를 연결한다.
 * [원리] HTML 인라인 이벤트에서 호출되는 함수를 Object.assign으로 한 번에 등록해,
 *        전역 바인딩 누락을 줄이고 UI 엔트리포인트를 단일 블록에서 관리한다.
 */
function bindUiActionsToWindow() {
    Object.assign(window, {
        openSidebar,
        closeSidebar,
        switchSearchTab,
        renderCoordSearchInputs,
        switchSidebarTab,
        toggleSearchBox,
        executeSearch,
        closeSearchResult,
        showHistoryPanel,
        toggleHistorySave,
        clearHistoryAll,
        deleteHistoryItem,
        closeBottomSheet,
        toggleBottomSheetState,
        toggleBottomSheetMoreMenu,
        handleBottomSheetEdit,
        handleBottomSheetStyle,
        handleBottomSheetBringToFront,
        handleBottomSheetBringForward,
        handleBottomSheetSendToBack,
        handleBottomSheetSendBackward,
        handleBottomSheetHole,
        handleBottomSheetHoleFill,
        handleBottomSheetDelete,
        editLayerDescription,
        closeMemoModal,
        saveMemoAction,
        editLayerMemo,
        createNewProject,
        createNewProjectAndMove,
        editProjectName,
        deleteCurrentProject,
        renderProjectList,
        openMoveProjectModal,
        openMoveSelectionModal,
        closeMoveProjectModal,
        startSleepMode,
        unlockSleepMode,
        toggleAccordion,
        toggleMoreMenu,
        toggleProjectMenu,
        openPhotoSelectMenu,
        closePhotoSelectMenu,
        handlePhotoMenuAction,
        processPhotoFiles,
        deletePhoto,
        openPhotoModal,
        nextPhoto,
        prevPhoto,
        downloadCurrentPhoto,
        closePhotoModal,
        openNavModal,
        closeNavModal,
        executeNavigation,
        showInfoPopup,
        fetchAndHighlightBoundary,
        copyText,
        deleteLayerById,
        toggleLayerVisibility,
        zoomToLayer,
        updateLayerColor,
        openLocationActionModal,
        closeLocationActionModal,
        openSettingsModal,
        closeSettingsModal,
        shareLocationText,
        openContextMenu,
        handleMenuAction,
        downloadOfflineMap,
        deleteOfflineMapPackage,
        moveToOfflineMapPackage,
        openStyleModal,
        closeStyleModal,
        selectStyleColor,
        selectStyleTab,
        toggleStylePalette,
        openStyleColorPicker,
        selectLineColorMode,
        selectLineStyleColor,
        selectLineStyle,
        toggleLineStyleOptions,
        updateLineWeightLabel,
        selectLineWeight,
        updateFillOpacityLabel,
        selectFillOpacity,
        updateTileOpacityLabel,
        selectTileOpacity,
        selectFillPattern,
        toggleFillPatternOptions,
        syncSolidDotOverlays,
        syncFillPatternOverlays,
        selectMarkerStyle,
        toggleMarkerEmojiOptions,
        updateMarkerSizeLabel,
        selectMarkerSize,
        applyStyleSettings,
        openStyleModalForExternalLayer,
        openSortModal,
        closeSortModal,
        applySortSetting,
        openProjectSortModal,
        closeProjectSortModal,
        applyProjectSortSetting,
        groupSelectedLayers,
        toggleRecordGroup,
        toggleRecordGroupVisibility,
        openRecordGroupMenu,
        handleRecordGroupMenuAction,
        closeAddRecordToGroupModal,
        toggleRecordFab,
        closeRecordFab,
    });
}

/**
 * [함수] initializeUiRuntime
 * [역할] 초기 이벤트와 기본 상태를 설정한다.
 * [원리] 초기화 가드 플래그로 중복 실행을 막고,
 *        검색 설정 로드 후 전역 액션 바인딩 순서로 런타임 시작 상태를 확정한다.
 */
function initializeUiRuntime() {
    if (isUiRuntimeInitialized) return;
    isUiRuntimeInitialized = true;

    initSearchSettings();
    configureContextMenuActions({
        closeAllDropdowns,
        deleteLayerById,
        editLayerMemo,
        exportSingleLayer,
        hasRecordGroups,
        isLayerInRecordGroup,
        moveLayerById,
        openAddRecordToGroupModal,
        openMoveProjectModal,
        removeRecordFromGroup
    });
    bindUiActionsToWindow();
}

initializeUiRuntime();
