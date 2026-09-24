/* ==========================================================================
   [모듈] 앱 시작 진입점 (script.js)
   [역할]
   - 앱 로딩 시 필요한 모달 템플릿, 전역 함수, 지도, 데이터, UI 초기화를 순서대로 실행합니다.
   - 분리된 기능 모듈들을 조립해 실제 앱을 시작하는 파일입니다.
   [참고]
   - 새 기능을 시작 시점에 연결하거나 초기화 순서 문제가 생기면 확인합니다.
   ========================================================================== */
import './vendor-globals.js';
import { Capacitor } from '@capacitor/core';
import { installGlobalAppDialogs } from './app-dialog.js';
import { initAndroidBackButtonExit } from './app/android-back.js';
import { checkAppVersion } from './app/version-update.js';
import { registerGlobals } from './app/globals.js';
import { injectAppModals } from './templates/app-modals.js';
import { injectAuthAdminModals } from './templates/auth-admin-modals.js';
import {
    closeSettingsChoiceModal,
    reopenSettingsAfterDocumentReturn,
    syncSettingsChoiceValues
} from './app/settings-choice.js';
import { setupMapFileDropImport } from './features/drag-import.js';
import { handleDeepLink } from './features/deep-link.js';
import { initMapInteractions } from './features/map-interactions.js';
import {
    initializeTrackRecordingRecovery,
    onTrackSuccess
} from './features/tracking.js';

/* ==========================================================================
   [모듈] 엔트리/오케스트레이션 모듈 (script.js)
   [역할]
   - 앱 시작 시 필요한 모듈을 조립하고 초기화 순서를 관리합니다.
   - 지도 이벤트, 위치 추적, 트랙 기록, 버전 체크 같은 상위 흐름을 연결합니다.
   - HTML 인라인 이벤트에서 사용할 window 브리지 함수를 등록합니다.
   [동작 원리 요약]
   - 실제 기능은 각 모듈(map/draw/data/ui/utils)에 두고, 이 파일은 연결과 순서 제어를 담당합니다.
   - 상태는 AppState를 기준으로 공유하며, 저장/렌더링은 중요한 상태 전환 직후 즉시 호출합니다.
   - DOMContentLoaded 시점에 초기화를 일괄 수행해 UI/데이터/지도 상태를 동기화합니다.
   ========================================================================== */

import {
    map,
    updateLayerOrder
} from './map.js';
import {
    configureDrawRuntime,
    drawnItems,
    getUniqueRecordName,
    recordSvgRenderer,
    syncSnapToggleButtons
} from './draw.js';



import {
    configureProjectDataRuntime,
    loadFromStorage,
    handleFileSelect,
    closeExportFormatModal,
    saveToStorage
} from './data.js';

import {
    initUserMaps
} from './user-maps.js';
import { configureBottomSheetRuntime } from './ui-bottomsheet.js';
import { deleteLayerById } from './ui-layer-actions.js';
import { configurePhotoRuntime } from './ui-photo.js';
import { configureProjectRuntime } from './ui-project.js';

import {
    closeBottomSheet, closeLocationActionModal, closeSettingsModal,
    closeNavModal, closeStyleModal, closeMoveProjectModal, closeSortModal,
    closeProjectSortModal, closeAddRecordToGroupModal, closeCreateRecordGroupModal, closePhotoSelectMenu,
    closePhotoModal, closeMemoModal,
    closeSearchModal,
    initUiEventListeners, syncSidebarUI,
    openSettingsModal,

    renderSurveyList as uiRenderSurveyList,
    updateLayerInfo as uiUpdateLayerInfo,
    renderProjectSelector,
    openSidebar,
    switchSidebarTab,
    highlightButton,
    resetButtonStyles,
    syncFillPatternOverlays,
    syncSolidDotOverlays,
    currentBottomSheetLayerId,
    setCurrentBottomSheetLayerId
} from './ui.js';

configureProjectDataRuntime({
    drawnItems,
    getUniqueRecordName,
    recordSvgRenderer,
    renderSurveyList: uiRenderSurveyList,
    updateLayerInfo: uiUpdateLayerInfo,
    renderProjectSelector,
    openSidebar,
    switchSidebarTab
});

configureDrawRuntime({
    updateLayerInfo: uiUpdateLayerInfo,
    renderSurveyList: uiRenderSurveyList,
    switchSidebarTab,
    highlightButton,
    resetButtonStyles,
    closeBottomSheet,
    syncFillPatternOverlays,
    syncSolidDotOverlays,
    saveToStorage
});

configureBottomSheetRuntime({
    updateLayerInfo: uiUpdateLayerInfo,
    deleteLayerById
});
configurePhotoRuntime({ updateLayerInfo: uiUpdateLayerInfo });
configureProjectRuntime({ switchSidebarTab });

installGlobalAppDialogs();
injectAuthAdminModals();
injectAppModals();

/* ==========================================================================
   1) UI 브리지 래퍼
   ========================================================================== */
/**
 * UI 모듈의 목록 렌더 함수를 엔트리에서 재노출합니다.
 * 동작 원리: 호출 경로를 script.js로 통일해도 실제 구현은 ui.js 단일 소스를 유지합니다.
 */
export function renderSurveyList() {
    uiRenderSurveyList();
}

/**
 * 레이어 메타 정보 갱신 함수를 엔트리에서 재노출합니다.
 */
export function updateLayerInfo(layer) {
    uiUpdateLayerInfo(layer);
}

// 바텀시트 현재 선택 레이어 상태를 공용으로 노출합니다.
export { currentBottomSheetLayerId, setCurrentBottomSheetLayerId };

/* ==========================================================================
   7) 앱 부트스트랩 (DOMContentLoaded)
   ========================================================================== */
/**
 * 앱 시작 초기화 루틴입니다.
 * 동작 원리: 이벤트 바인딩 -> 저장 데이터 로드 -> 지도/UI 동기화 순으로 진행합니다.
 */
async function initializeApp() {
    if (Capacitor.isNativePlatform()) {
        document.body.classList.add('is-native-app');
    }

    const [{ initAuth }, authUi] = await Promise.all([
        import('./auth.js'),
        import('./features/auth-admin-ui.js')
    ]);
    const {
        closeAccountActionsModal,
        closeApiKeySettingsModal,
        closeAdminMenuModal,
        closeAdminUsersModal,
        closeAuthInfoModal,
        closeAuthModal,
        closeDeleteAccountModal,
        closeNoticeBadgeSettingsModal,
        closeVerificationCodeCreateModal,
        initAuthResumeRefresh,
        initAuthUiEventListeners,
        refreshNoticeBadgeSettings,
        updateAuthUI
    } = authUi;

    initAndroidBackButtonExit({
        closeDeleteAccountModal,
        closeVerificationCodeCreateModal,
        closeApiKeySettingsModal,
        closeNoticeBadgeSettingsModal,
        closeAuthInfoModal,
        closeAdminUsersModal,
        closeAdminMenuModal,
        closeAccountActionsModal,
        closeAuthModal,
        closeExportFormatModal,
        closeAddRecordToGroupModal,
        closeCreateRecordGroupModal,
        closeMoveProjectModal,
        closeProjectSortModal,
        closeSortModal,
        closeStyleModal,
        closeLocationActionModal,
        closeSettingsModal,
        closeSearchModal,
        closeNavModal,
        closePhotoModal,
        closePhotoSelectMenu,
        closeMemoModal,
        closeBottomSheet
    });
    initAuthUiEventListeners();
    initAuthResumeRefresh();
    updateAuthUI();
    syncSettingsChoiceValues();
    initUiEventListeners();
    setupMapFileDropImport({ map, handleFileSelect });
    await initAuth(updateAuthUI);
    await loadFromStorage();
    await initializeTrackRecordingRecovery();
    await handleDeepLink();
    updateLayerOrder();
    syncSidebarUI();
    checkAppVersion();
    refreshNoticeBadgeSettings();
    reopenSettingsAfterDocumentReturn(openSettingsModal);

    // 위치 추적 시작: 실시간 마커 갱신 + (딥링크가 없을 때만) 초기 중심 이동
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(onTrackSuccess, null, { enableHighAccuracy: true });
        const params = new URLSearchParams(window.location.search);
        if (!params.has('lat')) {
            navigator.geolocation.getCurrentPosition(pos => {
                map.setView([pos.coords.latitude, pos.coords.longitude], 19);
            }, null, { enableHighAccuracy: true });
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
} else {
    void initializeApp();
}



initMapInteractions();
registerGlobals();
initUserMaps();
syncSnapToggleButtons();
