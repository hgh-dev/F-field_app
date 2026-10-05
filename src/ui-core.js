/* ==========================================================================
   [모듈] UI 공통 조립부 (ui-core.js)
   [역할]
   - 여러 UI 모듈을 연결하고, 기존 외부 호출과 호환되는 공통 UI 함수를 제공합니다.
   - 사이드바, 바텀시트, 스타일, 검색, 레이어 액션 등으로 분리된 UI 기능을 묶습니다.
   [참고]
   - 새 UI 로직을 길게 추가하기보다 가능하면 전용 ui-*.js 파일에 두고 여기서는 연결합니다.
   ========================================================================== */
import { map } from './map.js';
import { drawnItems } from './draw.js';
import { copyText } from './utils.js';
import { exportSingleLayer } from './data.js';
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
    openBulkStyleModal,
    openStyleModalForExternalLayer,
    resetTileStyleSettings,
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
    toggleTileInvert,
    updateTileColorAdjust,
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
    syncRecordSortOrderLabels,
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
    closeCreateRecordGroupModal,
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
    openPhotoDownloadMenu,
    closePhotoDownloadMenu,
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
    refreshRecordLayerDisplayMode,
    refreshLayerAddress,
    toggleLayerVisibility,
    updateLayerInfo
} from './ui-layer-detail.js';
import {
    closeLocationActionModal,
    closeNavModal,
    closeSettingsModal,
    executeNavigation,
    openLocationActionModal,
    openNavModal,
    openSettingsModal
} from './ui-app-modals.js';
import {
    closeMemoModal,
    editLayerDescription,
    editLayerMemo,
    saveMemoAction
} from './ui-memo.js';
export {
    applyLayerVisibilityState,
    refreshRecordLayerDisplayMode,
    refreshLayerAddress,
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
    openBulkStyleModal,
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

export * from './ui-app-modals.js';
export * from './ui-memo.js';
export * from './ui-sleep.js';
let isUiRuntimeInitialized = false;

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
    document.addEventListener('record-display-range-changed', () => {
        scheduleViewportVectorOptimization();
        syncSolidDotOverlays();
        syncFillPatternOverlays();
    });

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
        openPhotoDownloadMenu,
        closePhotoDownloadMenu,
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
        openBulkStyleModal,
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
        toggleTileInvert,
        updateTileColorAdjust,
        resetTileStyleSettings,
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
        syncRecordSortOrderLabels,
        openProjectSortModal,
        closeProjectSortModal,
        applyProjectSortSetting,
        groupSelectedLayers,
        toggleRecordGroup,
        toggleRecordGroupVisibility,
        openRecordGroupMenu,
        handleRecordGroupMenuAction,
        closeAddRecordToGroupModal,
        closeCreateRecordGroupModal,
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
