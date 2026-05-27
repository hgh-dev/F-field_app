/* ==========================================================================
   [모듈] 전역 함수 연결부 (app/globals.js)
   [역할]
   - HTML inline handler와 기존 window.* 호출이 계속 동작하도록 전역 함수를 등록합니다.
   - 분리된 기능 모듈들을 앱의 오래된 호출 방식과 이어주는 호환 레이어입니다.
   [참고]
   - 새 기능 로직을 여기에 길게 넣지 말고, 실제 구현은 기능 파일에 둔 뒤 연결만 합니다.
   ========================================================================== */
import { closeSettingsChoiceModal, openSettingsChoiceModal, openSettingsDocument, setCoordMode, setTrackInterval } from './settings-choice.js';
import { checkAppVersion, forceAppUpdate } from './version-update.js';
import {
    closeAdminMenuModal,
    ensureFeatureAccess
} from '../features/auth-admin-ui.js';
import { processPendingPhotoFiles as processPendingPhotoFilesFeature, startPhotoPoint as startPhotoPointFeature } from '../features/photo-recording.js';
import {
    addTrackPhotoPoint as addTrackPhotoPointFeature,
    cancelTrackRecording,
    completeTrackRecording,
    findMe,
    startTrackRecording as startTrackRecordingFeature,
    toggleTracking
} from '../features/tracking.js';
import {
    bringRecordLayersToFront,
    closeImportWarningModal,
    copyCurrentAddress,
    copyCurrentCoords,
    deleteSelectedLayers,
    exportSelectedLayers,
    openMapTileOpacitySettings,
    openUserMapTileOpacitySettings,
    proceedWithImport,
    setVectorRenderDelayEnabled,
    setViewportSimplifyEnabled,
    shareMyLocation,
    switchProject,
    toggleAllLayers,
    triggerFileInput
} from '../features/project-actions.js';
import {
    backupAllProjects,
    clearAllData,
    closeExportFormatModal,
    exportCurrentProject,
    handleFileSelect,
    saveCurrentBoundary,
    saveCurrentPoint
} from '../data.js';
import {
    addGpsVertex,
    cancelDrawing,
    cancelSingleEdit,
    clearSelectedEditVertexSelection,
    completeDrawing,
    completeSingleEdit,
    deleteLastVertex,
    deleteSelectedEditVertex,
    moveSelectedEditVertexToGps,
    revertSingleEdit,
    setSnapEnabled,
    startDraw
} from '../draw.js';
import {
    changeBaseMap,
    changeCadastralMap,
    toggleBaseLayer,
    toggleOverlay
} from '../map.js';
import {
    addUserMapFromUrl,
    deleteUserMap,
    editUserMap,
    fitUserMapToBounds,
    getUserMapSnapLayers,
    hasActiveUserBaseMap,
    moveUserMapLayer,
    openUserMapCategoryStyleSettings,
    openUserMapStyleSettings,
    removeActiveUserBaseMap,
    reorderUserMapLayers,
    selectUserMap,
    toggleUserMapCategoryRows,
    toggleUserMapCategoryValue,
    toggleUserMapLayer
} from '../user-maps.js';
import {
    closeSearchModal,
    executeMapSearch,
    openSearchModal,
    updateCoordDisplay
} from '../ui.js';

export function registerGlobals() {
    // HTML onclick 등에서 직접 호출할 수 있도록 핵심 함수를 window에 연결합니다.
    window.findMe = findMe;
    window.toggleTracking = toggleTracking;
    window.switchProject = switchProject;
    window.startTrackRecording = () => startTrackRecordingFeature({ ensureFeatureAccess });
    window.completeTrackRecording = completeTrackRecording;
    window.cancelTrackRecording = cancelTrackRecording;
    window.addTrackPhotoPoint = (event) => addTrackPhotoPointFeature(event, { ensureFeatureAccess });
    window.startPhotoPoint = () => startPhotoPointFeature({ ensureFeatureAccess });
    window.processPendingPhotoFiles = (input) => processPendingPhotoFilesFeature(input, { ensureFeatureAccess });
    window.saveCurrentPoint = saveCurrentPoint;
    window.saveCurrentBoundary = saveCurrentBoundary;
    window.openSearchModal = openSearchModal;
    window.closeSearchModal = closeSearchModal;
    window.closeAdminMenuModal = closeAdminMenuModal;
    window.executeMapSearch = executeMapSearch;
    window.triggerFileInput = triggerFileInput;
    window.closeImportWarningModal = closeImportWarningModal;
    window.proceedWithImport = proceedWithImport;
    window.openSettingsDocument = openSettingsDocument;
    window.openMapTileOpacitySettings = openMapTileOpacitySettings;
    window.openUserMapTileOpacitySettings = openUserMapTileOpacitySettings;
    window.openSettingsChoiceModal = openSettingsChoiceModal;
    window.closeSettingsChoiceModal = closeSettingsChoiceModal;
    window.clearAllData = clearAllData;
    window.setCoordMode = (mode) => {
        setCoordMode(mode, updateCoordDisplay);
    };
    window.setTrackInterval = (value) => {
        setTrackInterval(value);
    };
    window.setSnapEnabled = (value) => {
        setSnapEnabled(value);
    };
    window.setViewportSimplifyEnabled = setViewportSimplifyEnabled;
    window.setVectorRenderDelayEnabled = setVectorRenderDelayEnabled;
    window.copyCurrentAddress = copyCurrentAddress;
    window.copyCurrentCoords = copyCurrentCoords;
    window.shareMyLocation = shareMyLocation;
    window.toggleAllLayers = toggleAllLayers;
    window.deleteSelectedLayers = deleteSelectedLayers;
    window.exportSelectedLayers = exportSelectedLayers;
    window.exportCurrentProject = exportCurrentProject;
    window.backupAllProjects = backupAllProjects;
    window.toggleOverlay = toggleOverlay;
    window.toggleBaseLayer = toggleBaseLayer;
    window.changeCadastralMap = changeCadastralMap;
    window.changeBaseMap = changeBaseMap;
    window.bringRecordLayersToFront = bringRecordLayersToFront;
    window.addUserMapFromUrl = addUserMapFromUrl;
    window.selectUserMap = selectUserMap;
    window.toggleUserMapLayer = toggleUserMapLayer;
    window.openUserMapStyleSettings = openUserMapStyleSettings;
    window.openUserMapCategoryStyleSettings = openUserMapCategoryStyleSettings;
    window.toggleUserMapCategoryValue = toggleUserMapCategoryValue;
    window.toggleUserMapCategoryRows = toggleUserMapCategoryRows;
    window.fitUserMapToBounds = fitUserMapToBounds;
    window.moveUserMapLayer = moveUserMapLayer;
    window.reorderUserMapLayers = reorderUserMapLayers;
    window.editUserMap = editUserMap;
    window.deleteUserMap = deleteUserMap;
    window.removeActiveUserBaseMap = removeActiveUserBaseMap;
    window.hasActiveUserBaseMap = hasActiveUserBaseMap;
    window.getUserMapSnapLayers = getUserMapSnapLayers;
    window.startDraw = startDraw;
    window.completeDrawing = completeDrawing;
    window.cancelDrawing = cancelDrawing;
    window.addGpsVertex = addGpsVertex;
    window.deleteLastVertex = deleteLastVertex;
    window.completeSingleEdit = completeSingleEdit;
    window.revertSingleEdit = revertSingleEdit;
    window.cancelSingleEdit = cancelSingleEdit;
    window.moveSelectedEditVertexToGps = moveSelectedEditVertexToGps;
    window.deleteSelectedEditVertex = deleteSelectedEditVertex;
    window.clearSelectedEditVertexSelection = clearSelectedEditVertexSelection;
    window.handleFileSelect = handleFileSelect;
    window.forceAppUpdate = forceAppUpdate;
    window.checkAppVersion = checkAppVersion;
    window.closeExportFormatModal = closeExportFormatModal;
}
