/* ==========================================================================
   [모듈] 지도 클릭/터치 상호작용 (features/map-interactions.js)
   [역할]
   - 지도 클릭, 우클릭, 롱프레스 이벤트를 해석해 지점 선택 메뉴와 정리 동작을 실행합니다.
   - 그리기/편집 중에는 조회가 끼어들지 않도록 클릭 처리를 제어합니다.
   [참고]
   - 지도 터치, 우클릭, 롱프레스 메뉴 반응이 이상할 때 확인합니다.
   ========================================================================== */
import { currentEditLayerId } from '../draw.js';
import { map } from '../map.js';
import { AppState } from '../state.js';
import { closeBottomSheet, closeBottomSheetOnExternalMapMove } from '../ui.js';
import { closeMapPointMenu, openMapPointMenu, runLocationLookup } from '../map-point-menu.js';

let suppressMapClickUntil = 0;
let longPressTimer = null;
let longPressStart = null;

const MAP_LONG_PRESS_MS = 620;
const MAP_LONG_PRESS_MAX_MOVE_PX = 12;

function canOpenMapPointMenu() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    return true;
}

function isMapTouchTarget(target) {
    if (!target || typeof target.closest !== 'function') return true;
    return !target.closest('.leaflet-control, .map-control-btn, .record-fab, .bottom-sheet, .sidebar-overlay, .nav-modal-overlay, .action-toolbar, button, input, select, textarea, a');
}

function clearLongPressTimer() {
    if (!longPressTimer) return;
    clearTimeout(longPressTimer);
    longPressTimer = null;
    longPressStart = null;
}

function clearLookupState() {
    if (AppState.currentBoundaryLayer) {
        map.removeLayer(AppState.currentBoundaryLayer);
        AppState.currentBoundaryLayer = null;
    }
    if (AppState.currentSearchMarker) {
        map.removeLayer(AppState.currentSearchMarker);
        AppState.currentSearchMarker = null;
    }
    closeMapPointMenu({ removeMarker: true });
    closeBottomSheet({ recenter: false });
}

export function initMapInteractions() {
    map.on('movestart', closeBottomSheetOnExternalMapMove);

    // 지도 단일 클릭: 임시 경계/검색 마커/바텀시트를 정리합니다.
    map.on('click', function (e) {
        if (Date.now() < suppressMapClickUntil) return;
        if (AppState.currentDrawer || currentEditLayerId !== null) return;
        if (AppState.isLayerClicked) return;

        clearLookupState();
    });

    // PC 우클릭: 해당 지점에서 위치/사용자지도/기록 선택 메뉴를 엽니다.
    map.on('contextmenu', function (e) {
        if (!canOpenMapPointMenu()) return;
        suppressMapClickUntil = Date.now() + 300;
        clearLookupState();
        openMapPointMenu(e, e.latlng);
    });

    // 지도 더블클릭: 우클릭 메뉴의 "위치 조회"와 같은 지적 경계/위치 바텀시트를 엽니다.
    map.on('dblclick', function (e) {
        if (AppState.currentDrawer || currentEditLayerId !== null) return;
        suppressMapClickUntil = Date.now() + 700;
        closeMapPointMenu({ removeMarker: true });
        runLocationLookup(e.latlng);
    });

    const container = map.getContainer();

    // 모바일 롱프레스: 드래그가 아닌 꾸욱 누르기일 때 같은 메뉴를 엽니다.
    container.addEventListener('touchstart', function (event) {
        if (!canOpenMapPointMenu()) return;
        if (!event.touches || event.touches.length !== 1) return;
        if (!isMapTouchTarget(event.target)) return;

        const touch = event.touches[0];
        clearLongPressTimer();
        longPressStart = {
            x: touch.clientX,
            y: touch.clientY,
            target: event.target
        };
        longPressTimer = setTimeout(() => {
            if (!longPressStart || !canOpenMapPointMenu()) return;
            const latlng = map.containerPointToLatLng(map.mouseEventToContainerPoint({
                clientX: longPressStart.x,
                clientY: longPressStart.y
            }));
            suppressMapClickUntil = Date.now() + 700;
            clearLookupState();
            openMapPointMenu({ clientX: longPressStart.x, clientY: longPressStart.y }, latlng);
            longPressTimer = null;
            longPressStart = null;
        }, MAP_LONG_PRESS_MS);
    }, { passive: true });

    container.addEventListener('touchmove', function (event) {
        if (!longPressStart || !event.touches || event.touches.length !== 1) {
            clearLongPressTimer();
            return;
        }
        const touch = event.touches[0];
        if (Math.hypot(touch.clientX - longPressStart.x, touch.clientY - longPressStart.y) > MAP_LONG_PRESS_MAX_MOVE_PX) {
            clearLongPressTimer();
        }
    }, { passive: true });

    container.addEventListener('touchend', clearLongPressTimer, { passive: true });
    container.addEventListener('touchcancel', clearLongPressTimer, { passive: true });
}
