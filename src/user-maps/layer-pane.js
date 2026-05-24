/* ==========================================================================
   [모듈] 사용자지도 레이어 Pane 관리 (user-maps/layer-pane.js)
   [역할]
   - 사용자지도별 Leaflet pane을 만들고 z-index를 계산해 표시 순서를 맞춥니다.
   - 사용자지도 레이어가 기본 지도/기록과 올바른 높이로 겹치도록 관리합니다.
   [참고]
   - 사용자지도 표시 순서가 이상하거나 클릭을 막는 문제가 생기면 확인합니다.
   ========================================================================== */
import { map } from '../map.js';
import { USER_MAP_Z_INDEX_BASE } from './constants.js';

export function getUserMapLayerZIndex(index) {
    return USER_MAP_Z_INDEX_BASE + index;
}

function getUserMapPaneName(id) {
    return `userMapPane-${String(id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export function ensureUserMapPane(id, index) {
    const paneName = getUserMapPaneName(id);
    if (!map.getPane(paneName)) {
        map.createPane(paneName);
        map.getPane(paneName).style.pointerEvents = 'none';
    }
    map.getPane(paneName).style.zIndex = String(getUserMapLayerZIndex(index));
    return paneName;
}

export function applyUserMapLayerZIndex(layer, index) {
    const zIndex = getUserMapLayerZIndex(index);

    if (typeof layer.setZIndex === 'function') {
        layer.setZIndex(zIndex);
    }

    if (layer.options) {
        layer.options.zIndex = zIndex;
    }

    const renderer = layer.options?.renderer;
    if (renderer?._container?.style) {
        renderer._container.style.zIndex = String(zIndex);
    }

    if (typeof layer.eachLayer === 'function') {
        layer.eachLayer(childLayer => {
            if (childLayer.options) childLayer.options.zIndex = zIndex;
            const childRenderer = childLayer.options?.renderer || renderer;
            if (childRenderer?._container?.style) {
                childRenderer._container.style.zIndex = String(zIndex);
            }
            if (typeof childLayer.bringToFront === 'function') {
                childLayer.bringToFront();
            }
        });
    }
}
