/* ==========================================================================
   [모듈] 지도 클릭/터치 상호작용 (features/map-interactions.js)
   [역할]
   - 지도 클릭, 더블탭, 터치 이벤트를 해석해 지적 조회와 팝업 표시를 실행합니다.
   - 그리기/편집 중에는 조회가 끼어들지 않도록 클릭 처리를 제어합니다.
   [참고]
   - 지도 터치, 더블탭, 지적 조회 반응이 이상할 때 확인합니다.
   ========================================================================== */
import { currentEditLayerId } from '../draw.js';
import { map } from '../map.js';
import { AppState } from '../state.js';
import { closeBottomSheet, fetchAndHighlightBoundary, showInfoPopup } from '../ui.js';

let suppressMapClickUntil = 0;
let lastMapTouchTap = null;

const MAP_DOUBLE_TAP_MAX_MS = 360;
const MAP_DOUBLE_TAP_MAX_PX = 36;

function runCadastralLookup(latlng) {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    map.panTo(latlng, { animate: true, duration: 0.3 });
    showInfoPopup(latlng.lat, latlng.lng);
    fetchAndHighlightBoundary(latlng.lng, latlng.lat);
}

function isMapTouchTarget(target) {
    if (!target || typeof target.closest !== 'function') return true;
    return !target.closest('.leaflet-control, .map-control-btn, .record-fab, .bottom-sheet, .sidebar-overlay, .nav-modal-overlay, .action-toolbar, button, input, select, textarea, a');
}

export function initMapInteractions() {
    // 지도 단일 클릭: 임시 경계/검색 마커/바텀시트를 정리합니다.
    map.on('click', function (e) {
        if (Date.now() < suppressMapClickUntil) return;
        if (AppState.currentDrawer || currentEditLayerId !== null) return;
        if (AppState.isLayerClicked) return;


        if (AppState.currentBoundaryLayer) {
            map.removeLayer(AppState.currentBoundaryLayer);
            AppState.currentBoundaryLayer = null;
        }
        if (AppState.currentSearchMarker) {
            map.removeLayer(AppState.currentSearchMarker);
            AppState.currentSearchMarker = null;
        }
        closeBottomSheet();
    });

    // 지도 더블클릭: 해당 지점의 정보 팝업/경계 조회를 실행합니다.
    map.on('dblclick', function (e) {
        runCadastralLookup(e.latlng);
    });

    // iOS 브라우저는 터치 더블탭에서 Leaflet dblclick 이벤트가 안정적으로 발생하지 않아 별도로 처리합니다.
    map.getContainer().addEventListener('touchend', function (event) {
        if (AppState.currentDrawer || currentEditLayerId !== null) return;
        if (!event.changedTouches || event.changedTouches.length !== 1) return;
        if (!isMapTouchTarget(event.target)) return;

        const touch = event.changedTouches[0];
        const now = Date.now();
        const currentTap = { time: now, x: touch.clientX, y: touch.clientY };

        if (lastMapTouchTap && now - lastMapTouchTap.time <= MAP_DOUBLE_TAP_MAX_MS) {
            const dx = currentTap.x - lastMapTouchTap.x;
            const dy = currentTap.y - lastMapTouchTap.y;

            if (Math.hypot(dx, dy) <= MAP_DOUBLE_TAP_MAX_PX) {
                event.preventDefault();
                suppressMapClickUntil = now + 600;
                lastMapTouchTap = null;
                const latlng = map.containerPointToLatLng(map.mouseEventToContainerPoint({
                    clientX: touch.clientX,
                    clientY: touch.clientY
                }));
                runCadastralLookup(latlng);
                return;
            }
        }

        lastMapTouchTap = currentTap;
    }, { passive: false });
}
