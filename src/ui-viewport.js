/* ==========================================================================
   [모듈] 지도 화면 렌더링 최적화 (ui-viewport.js)
   [역할]
   - 줌 레벨과 화면 범위에 따라 벡터 레이어 표시 부담을 줄이는 최적화를 수행합니다.
   - 보이는 영역 중심으로 레이어 렌더링을 예약하고 지도 성능을 관리합니다.
   [참고]
   - 기록이 많을 때 지도 성능이나 표시 누락 문제가 생기면 확인합니다.
   ========================================================================== */
import { drawnItems } from './draw.js';
import { map } from './map.js';
import { AppState } from './state.js';

// 줌아웃일수록 선/면을 더 단순화해 렌더링 부담을 줄임
/**
 * [함수] getSmoothFactorForZoom
 * [역할] 현재 조건에 맞는 값을 조회해 반환한다.
 * [원리] 현재 활성 탭/상태를 기준으로 조회 키를 계산하고,
 *        해당 키에 대응하는 값을 읽어 호출자에 반환한다.
 */
function getSmoothFactorForZoom(zoom) {
    if (zoom >= 15) return 1; // 15레벨 이상은 원본에 가깝게 유지
    if (zoom === 14) return 2;
    if (zoom === 13) return 4;
    if (zoom <= 11) return 10;
    return 7; // zoom 12
}

/**
 * [함수] isLineOrPolygonLayer
 * [역할] 입력 대상이 조건을 만족하는지 불리언으로 판별한다.
 * [원리] 입력 객체의 타입과 필수 필드를 순서대로 검사해,
 *        후속 로직 분기에서 재사용할 불리언 판정 결과를 반환한다.
 */
function isLineOrPolygonLayer(layer) {
    return layer instanceof L.Polyline && !(layer instanceof L.Marker);
}

/**
 * [함수] optimizeVectorLayerForViewport
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function optimizeVectorLayerForViewport(layer, viewBounds, zoom) {
    if (!isLineOrPolygonLayer(layer)) return;

    const smoothFactor = AppState.isViewportSimplifyEnabled ? getSmoothFactorForZoom(zoom) : 1;
    if (layer.options.smoothFactor !== smoothFactor) {
        layer.options.smoothFactor = smoothFactor;
        if (typeof layer.redraw === 'function') layer.redraw();
    }

    const isHidden = layer.feature?.properties?.isHidden === true;
    const layerBounds = typeof layer.getBounds === 'function' ? layer.getBounds() : null;
    const isInView = !!(layerBounds && layerBounds.isValid() && viewBounds.intersects(layerBounds));
    const path = layer._path;
    if (!path) return;

    // 화면 밖/숨김 상태 도형은 path 자체를 숨겨서 렌더링 비용을 낮춤
    if (isHidden || !isInView) {
        path.style.display = 'none';
        path.style.pointerEvents = 'none';
    } else {
        path.style.display = '';
        path.style.pointerEvents = 'visiblePainted';
    }
}

/**
 * [함수] optimizeViewportVectorRendering
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function optimizeViewportVectorRendering() {
    const viewBounds = map.getBounds();
    const zoom = map.getZoom();
    drawnItems.getLayers().forEach(layer => optimizeVectorLayerForViewport(layer, viewBounds, zoom));
}

let isViewportOptimizationScheduled = false;
let viewportOptimizationDelayTimer = null;
/**
 * [함수] scheduleViewportVectorOptimization
 * [역할] 비용이 큰 작업을 지연 예약해 호출 빈도를 제어한다.
 * [원리] requestAnimationFrame 예약 플래그를 사용해 연속 호출을 하나로 합치고,
 *        고비용 렌더 작업을 프레임 단위로 지연 실행해 성능 부담을 줄인다.
 */
export function scheduleViewportVectorOptimization(options = {}) {
    const shouldDelay = options.delay === true && AppState.isVectorRenderDelayEnabled;
    if (shouldDelay) {
        clearTimeout(viewportOptimizationDelayTimer);
        viewportOptimizationDelayTimer = setTimeout(() => {
            viewportOptimizationDelayTimer = null;
            scheduleViewportVectorOptimization();
        }, 500);
        return;
    }

    if (isViewportOptimizationScheduled) return;
    isViewportOptimizationScheduled = true;
    requestAnimationFrame(() => {
        isViewportOptimizationScheduled = false;
        optimizeViewportVectorRendering();
    });
}
