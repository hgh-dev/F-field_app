/* ==========================================================================
   [모듈] 기록 레이어 액션 (ui-layer-actions.js)
   [역할]
   - 기록 삭제, 색상 변경, 위치 공유, 특정 기록으로 지도 이동 같은 레이어 단위 동작을 처리합니다.
   - 기록 목록/상세 화면에서 누르는 버튼의 실제 실행 로직입니다.
   [참고]
   - 개별 기록 버튼 동작이나 공유 문구가 이상할 때 확인합니다.
   ========================================================================== */
import { SHARE_BASE_URL } from './config.js';
import { drawnItems } from './draw.js';
import { map } from './map.js';
import { saveToStorage } from './data.js';
import { shareTextUrl } from './native-bridge.js';
import { showAppConfirm } from './app-dialog.js';
import { AppState } from './state.js';
import { createColoredMarkerIcon, copyText, convertToDms, getTmCoords } from './utils.js';
import { closeBottomSheet } from './ui-bottomsheet.js';
import { renderSurveyList } from './ui-project.js';
import { closeSidebar } from './ui-sidebar.js';
import { scheduleViewportVectorOptimization } from './ui-viewport.js';

/**
 * [함수] shareLocationText
 * [역할] 공유용 텍스트/링크를 구성해 전달한다.
 * [원리] 현재 좌표 표시 모드에 맞는 공유 문구를 조합하고,
 *        Web Share 지원 여부에 따라 시스템 공유 또는 클립보드 복사로 분기한다.
 */
export function shareLocationText(address, lat, lng) {
    let coordText = `${lat}, ${lng}`;
    if (AppState.coordMode === 2) {
        const tm = getTmCoords(lat, lng);
        coordText = `X: ${tm.x}, Y: ${tm.y}`;
    } else if (AppState.coordMode === 1) {
        coordText = `N ${parseFloat(lat).toFixed(4)}° , E ${parseFloat(lng).toFixed(4)}°`;
    } else {
        coordText = `${convertToDms(lat, 'lat')}, ${convertToDms(lng, 'lng')}`;
    }

    const shareUrl = new URL(`?lat=${lat}&lng=${lng}`, SHARE_BASE_URL).toString();
    const shareData = {
        title: '[F-Field] 위치 공유',
        text: `\n주소: ${address}\n좌표: ${coordText}\n\n링크를 클릭하면 공유된 위치로 이동합니다.`,
        url: shareUrl
    };

    shareTextUrl(shareData).catch(() => copyText(`${shareData.text}\n${shareUrl}`));
}

/**
 * [함수] deleteLayerById
 * [역할] 대상을 삭제하고 후속 UI/저장 상태를 정리한다.
 * [원리] 삭제 대상 존재와 사용자 확인을 먼저 검증한 뒤,
 *        컬렉션에서 제거하고 저장·리스트 갱신·선택 상태 정리를 순서대로 수행한다.
 */
export async function deleteLayerById(id) {

    if (!await showAppConfirm("정말로 이 기록을 삭제하시겠습니까?", { title: '기록 삭제' })) return;
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (layer) drawnItems.removeLayer(layer);
    saveToStorage();
    renderSurveyList();
    scheduleViewportVectorOptimization();
    closeBottomSheet();
}

/**
 * [함수] zoomToLayer
 * [역할] 지도 화면을 대상 위치/범위로 이동·확대한다.
 * [원리] 대상 레이어 타입에 맞춰 flyTo/fitBounds 중 적절한 이동 방식을 선택하고,
 *        이동 완료 타이밍에 맞춰 상세 정보 UI를 열어 탐색 흐름을 이어준다.
 */
export function zoomToLayer(id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;
    closeSidebar();
    if (layer instanceof L.Marker) {
        map.flyTo(layer.getLatLng(), 19);
        layer.openPopup();
    } else {
        map.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 19 });
        setTimeout(() => layer.openPopup(), 1500);
    }
}

/**
 * [함수] updateLayerColor
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
export function updateLayerColor(id, newColor) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;
    const emoji = layer.feature.properties.customEmoji || null;
    const size = layer.feature.properties.customMarkerSize || 3;
    if (layer instanceof L.Marker) layer.setIcon(createColoredMarkerIcon(newColor, emoji, size));
    else layer.setStyle({ color: newColor, fillColor: newColor });
    layer.feature.properties.customColor = newColor;
    saveToStorage();
}

