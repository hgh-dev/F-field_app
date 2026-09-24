/* ==========================================================================
   [모듈] 데이터 입출력 연결부 (data-transfer.js)
   [역할]
   - 프로젝트 저장소(data.js)와 가져오기/내보내기 모듈을 연결합니다.
   - 저장·복원 구현은 복제하지 않고 data.js의 단일 구현을 사용합니다.
   ========================================================================== */
import {
    saveToStorage,
    loadCurrentProjectFeatures,
    restoreFeatures
} from './data.js';
import { renderProjectSelector } from './ui-project.js';
import { configureDataTransferExport } from './data-transfer-export.js';
import { configureDataTransferImport } from './data-transfer-import.js';

configureDataTransferExport({ saveToStorage });
configureDataTransferImport({
    saveToStorage,
    loadCurrentProjectFeatures,
    restoreFeatures,
    renderProjectSelector
});

// 기존에 data-transfer.js에서 가져오던 코드와의 호환성을 유지합니다.
export {
    clearAllData,
    fitCurrentProjectToMap,
    getAddressFromCoords,
    loadCurrentProjectFeatures,
    loadFromStorage,
    restoreFeatures,
    saveCurrentBoundary,
    saveCurrentPoint,
    saveToStorage
} from './data.js';

export {
    backupAllProjects,
    closeExportFormatModal,
    exportCurrentProject,
    exportLayerWithFormat,
    exportSingleLayer
} from './data-transfer-export.js';

export { handleFileSelect } from './data-transfer-import.js';
