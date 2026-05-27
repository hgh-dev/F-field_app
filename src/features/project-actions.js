/* ==========================================================================
   [모듈] 프로젝트/레이어 액션 연결부 (features/project-actions.js)
   [역할]
   - 프로젝트 전환/삭제/공유, 레이어 이동, 지도 투명도, 사용자지도 투명도 같은 버튼 동작을 연결합니다.
   - HTML에서 호출하는 프로젝트 관련 전역 액션의 실제 실행 지점입니다.
   [참고]
   - 프로젝트 메뉴나 레이어 메뉴 버튼 동작이 이상할 때 확인합니다.
   ========================================================================== */
import { showAppConfirm } from '../app-dialog.js';
import { SHARE_BASE_URL } from '../config.js';
import { closeExportFormatModal, exportLayerWithFormat, fitCurrentProjectToMap, loadCurrentProjectFeatures, saveToStorage } from '../data.js';
import { drawnItems } from '../draw.js';
import { getMapLayerOpacity, map, setMapLayerOpacity } from '../map.js';
import { shareTextUrl } from '../native-bridge.js';
import { AppState } from '../state.js';
import { copyText } from '../utils.js';
import { getUserMapTileOpacity, setUserMapTileOpacity } from '../user-maps.js';
import { applyLayerVisibilityState, openStyleModalForExternalLayer, renderProjectSelector, renderSurveyList, scheduleViewportVectorOptimization } from '../ui.js';

// 프로젝트 전환 시 현재 프로젝트를 먼저 저장한 뒤 새 프로젝트를 로드합니다.
export function switchProject(id) {
    saveToStorage();
    AppState.currentProjectId = parseInt(id);
    loadCurrentProjectFeatures();
    fitCurrentProjectToMap();
    renderProjectSelector();
}

// 가져오기 경고 모달을 거쳐 파일 입력을 열어줍니다.
export function triggerFileInput() {
    const overlay = document.getElementById('import-warning-modal-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('visible'), 10);
    } else {
        document.getElementById('geoJsonInput').click();
    }
}

// 가져오기 경고 모달 닫기
export function closeImportWarningModal() {
    const overlay = document.getElementById('import-warning-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

// 경고 확인 후 파일 선택창을 엽니다.
export function proceedWithImport() {
    closeImportWarningModal();
    document.getElementById('geoJsonInput').click();
}

export function openMapTileOpacitySettings(id, event) {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    openStyleModalForExternalLayer({
        id,
        type: 'tile',
        style: { opacity: getMapLayerOpacity(id) },
        onApply: ({ opacity }) => setMapLayerOpacity(id, opacity)
    });
}

export function openUserMapTileOpacitySettings(id, event) {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    openStyleModalForExternalLayer({
        id,
        type: 'tile',
        style: { opacity: getUserMapTileOpacity(id) },
        onApply: ({ opacity }) => setUserMapTileOpacity(id, opacity)
    });
}

export function setViewportSimplifyEnabled(value) {
    const isEnabled = (value === 'true' || value === true);
    AppState.isViewportSimplifyEnabled = isEnabled;
    localStorage.setItem('setting_viewport_simplify', isEnabled.toString());
    scheduleViewportVectorOptimization();
}

export function setVectorRenderDelayEnabled(value) {
    const isEnabled = (value === 'true' || value === true);
    AppState.isVectorRenderDelayEnabled = isEnabled;
    localStorage.setItem('setting_vector_render_delay', isEnabled.toString());
}

export function copyCurrentAddress() {
    const text = document.getElementById('address-display').innerText;
    if (text && text !== "주소 확인 중...") copyText(text, false, "주소");
}

export function copyCurrentCoords() {
    const text = document.getElementById('coord-display').innerText;
    copyText(text, false, "좌표");
}

export async function shareMyLocation() {
    const address = document.getElementById('address-display').innerText || "주소 정보 없음";
    const coordText = document.getElementById('coord-display').innerText || "0, 0";
    const lat = AppState.lastGpsLat;
    const lng = AppState.lastGpsLng;
    const shareUrl = new URL(`?lat=${lat}&lng=${lng}`, SHARE_BASE_URL).toString();
    const shareData = {
        title: '[F-Field] 내 위치 공유',
        text: `\n주소: ${address}\n좌표: ${coordText}\n\n링크: ${shareUrl}`,
        url: shareUrl
    };
    try {
        const shared = await shareTextUrl(shareData);
        if (!shared) copyText(`${shareData.text}\n${shareUrl}`);
    } catch {
        copyText(`${shareData.text}\n${shareUrl}`);
    }
}

// 목록 전체 선택/해제를 "isHidden + 레이어 스타일"로 동기화합니다.
export function toggleAllLayers(isChecked) {
    drawnItems.getLayers().forEach(layer => {
        applyLayerVisibilityState(layer, !isChecked);
    });
    saveToStorage();
    renderSurveyList();
}

// 현재 선택된(숨김 아님) 레이어를 일괄 삭제합니다.
export async function deleteSelectedLayers() {
    let deletedCount = 0;
    const layersToRemove = [];

    drawnItems.getLayers().forEach(layer => {
        if (layer.feature && layer.feature.properties && !layer.feature.properties.isHidden) {
            layersToRemove.push(layer);
        }
    });

    if (layersToRemove.length === 0) {
        alert("선택된 기록이 없습니다.");
        return;
    }

    if (!await showAppConfirm(`선택한 ${layersToRemove.length}개의 기록을 삭제하시겠습니까?\n(삭제 후 복구할 수 없습니다.)`, { title: '기록 삭제' })) return;

    layersToRemove.forEach(layer => {
        drawnItems.removeLayer(layer);
        if (layer._popup) layer.closePopup();
        deletedCount++;
    });

    if (deletedCount > 0) {
        saveToStorage();
        renderSurveyList();
    }
}

// 현재 선택된(숨김 아님) 레이어를 일괄 내보냅니다.
export async function exportSelectedLayers() {
    // 화면 표시 중(isHidden=false) 레이어를 내보내기 대상으로 수집
    const layers = drawnItems.getLayers().filter(
        l => l.feature && l.feature.properties && !l.feature.properties.isHidden
    );

    if (layers.length === 0) {
        alert("선택된 기록이 없습니다.");
        return;
    }

    // 포맷 선택 모달을 Promise로 열고 결과를 받습니다.
    let format;
    try {
        format = await new Promise((resolve, reject) => {
            const overlay = document.getElementById('export-format-modal-overlay');
            if (!overlay) { reject(); return; }
            window._resolveExportFormat = (f) => {
                closeExportFormatModal();
                resolve(f);
            };
            overlay.style.display = 'flex';
            setTimeout(() => overlay.classList.add('visible'), 10);
        });
    } catch {
        return;
    }

    // 선택된 포맷으로 일괄 저장
    await exportLayerWithFormat(layers, format);
    alert(`${layers.length}개의 기록을 ${format.toUpperCase()} 형식으로 저장합니다.`);
}

export function bringRecordLayersToFront() {
    if (map.hasLayer(drawnItems) && typeof drawnItems.bringToFront === 'function') {
        drawnItems.bringToFront();
    }
    const orderedLayers = [...drawnItems.getLayers()].sort((a, b) => {
        const orderA = Number(a.feature?.properties?.displayOrder);
        const orderB = Number(b.feature?.properties?.displayOrder);
        const hasOrderA = Number.isFinite(orderA);
        const hasOrderB = Number.isFinite(orderB);

        if (hasOrderA && hasOrderB && orderA !== orderB) return orderA - orderB;
        if (hasOrderA !== hasOrderB) return hasOrderA ? -1 : 1;
        return (a.feature?.properties?.id || 0) - (b.feature?.properties?.id || 0);
    });
    orderedLayers.forEach(layer => {
        if (typeof layer.bringToFront === 'function') layer.bringToFront();
    });
}
