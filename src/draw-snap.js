/* ==========================================================================
   [모듈] 그리기 스냅 기능 (draw-snap.js)
   [역할]
   - 점/선/면을 그리거나 편집할 때 기존 기록과 사용자지도에 붙는 스냅 계산을 담당합니다.
   - 스냅 후보 탐색, 스냅 가이드 표시, 스냅 토글 상태를 관리합니다.
   [참고]
   - 그리기 중 점이 붙는 위치나 스냅 표시가 이상할 때 확인합니다.
   ========================================================================== */
import { map } from './map.js';
import { AppState } from './state.js';

let drawnItems = null;

export function configureDrawSnap(options = {}) {
    drawnItems = options.drawnItems || drawnItems;
}

const SNAP_DISTANCE_PX = 14;
let snapGuideLayer = null;
let userMapSnapGeometryCache = {
    key: '',
    vertices: [],
    segments: []
};

export function normalizeLatLng(latlng) {
    return latlng ? L.latLng(latlng.lat, latlng.lng) : null;
}

function isSnapEnabled() {
    return AppState.isSnapEnabled === true;
}

function getPointDistance(pointA, pointB) {
    return pointA.distanceTo(pointB);
}

function getClosestPointOnSegment(targetPoint, startPoint, endPoint) {
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const lengthSquared = (dx * dx) + (dy * dy);
    if (lengthSquared === 0) return startPoint;

    const t = Math.max(0, Math.min(1, (((targetPoint.x - startPoint.x) * dx) + ((targetPoint.y - startPoint.y) * dy)) / lengthSquared));
    return L.point(startPoint.x + (dx * t), startPoint.y + (dy * t));
}

function collectLayerSnapGeometry(layer, snapBounds = null) {
    const vertices = [];
    const segments = [];

    if (typeof layer.eachLayer === 'function' && !(layer instanceof L.Marker)) {
        layer.eachLayer(childLayer => {
            if (snapBounds && !isLayerInSnapView(childLayer, snapBounds)) return;
            const childGeometry = collectLayerSnapGeometry(childLayer, snapBounds);
            vertices.push(...childGeometry.vertices);
            segments.push(...childGeometry.segments);
        });
        return { vertices, segments };
    }

    if (layer instanceof L.Marker) {
        vertices.push(normalizeLatLng(layer.getLatLng()));
        return { vertices, segments };
    }

    if (typeof layer.getLatLngs !== 'function') return { vertices, segments };

    const appendPath = (pathLatLngs, shouldClose) => {
        const path = pathLatLngs.map(normalizeLatLng).filter(Boolean);
        if (path.length === 0) return;

        path.forEach(vertex => vertices.push(vertex));
        for (let i = 1; i < path.length; i++) {
            segments.push([path[i - 1], path[i]]);
        }
        if (shouldClose && path.length > 2) {
            segments.push([path[path.length - 1], path[0]]);
        }
    };

    const traverseLatLngs = (latlngs, shouldClose) => {
        if (!Array.isArray(latlngs) || latlngs.length === 0) return;
        if (latlngs[0] && typeof latlngs[0].lat === 'number' && typeof latlngs[0].lng === 'number') {
            appendPath(latlngs, shouldClose);
            return;
        }
        latlngs.forEach(inner => traverseLatLngs(inner, shouldClose));
    };

    traverseLatLngs(layer.getLatLngs(), layer instanceof L.Polygon);
    return { vertices, segments };
}

function isLayerInSnapView(layer, snapBounds) {
    if (!layer || !snapBounds) return false;
    if (layer instanceof L.Marker) {
        const latlng = normalizeLatLng(layer.getLatLng());
        return latlng ? snapBounds.contains(latlng) : false;
    }
    if (typeof layer.getBounds === 'function') {
        const bounds = layer.getBounds();
        return bounds?.isValid?.() ? snapBounds.intersects(bounds) : false;
    }
    return true;
}

function getAdditionalSnapLayers() {
    if (typeof window === 'undefined' || typeof window.getUserMapSnapLayers !== 'function') return [];
    try {
        const layers = window.getUserMapSnapLayers();
        return Array.isArray(layers) ? layers : [];
    } catch (error) {
        console.warn('사용자 지도 스냅 후보를 가져오지 못했습니다.', error);
        return [];
    }
}

function getLayerSnapCacheId(layer) {
    return layer?._leaflet_id || layer?.feature?.properties?.id || 'unknown';
}

function getBoundsCachePart(bounds) {
    const west = bounds.getWest().toFixed(5);
    const south = bounds.getSouth().toFixed(5);
    const east = bounds.getEast().toFixed(5);
    const north = bounds.getNorth().toFixed(5);
    return `${west},${south},${east},${north}`;
}

function getAdditionalSnapGeometryCacheKey(layers, snapBounds) {
    const layerIds = layers.map(getLayerSnapCacheId).join('|');
    return `${map.getZoom()}|${getBoundsCachePart(snapBounds)}|${layerIds}`;
}

function clearUserMapSnapGeometryCache() {
    userMapSnapGeometryCache = {
        key: '',
        vertices: [],
        segments: []
    };
}

function getCachedAdditionalSnapGeometry(snapBounds) {
    const layers = getAdditionalSnapLayers()
        .filter(layer => isLayerInSnapView(layer, snapBounds));
    if (layers.length === 0) {
        clearUserMapSnapGeometryCache();
        return { vertices: [], segments: [] };
    }

    const cacheKey = getAdditionalSnapGeometryCacheKey(layers, snapBounds);
    if (userMapSnapGeometryCache.key === cacheKey) {
        return userMapSnapGeometryCache;
    }

    const vertices = [];
    const segments = [];

    layers.forEach(layer => {
        const geometry = collectLayerSnapGeometry(layer, snapBounds);
        geometry.vertices.forEach(vertex => {
            vertices.push({
                latlng: vertex,
                point: map.latLngToContainerPoint(vertex)
            });
        });
        geometry.segments.forEach(([startLatLng, endLatLng]) => {
            segments.push({
                startLatLng,
                endLatLng,
                startPoint: map.latLngToContainerPoint(startLatLng),
                endPoint: map.latLngToContainerPoint(endLatLng)
            });
        });
    });

    userMapSnapGeometryCache = { key: cacheKey, vertices, segments };
    return userMapSnapGeometryCache;
}

function findSnapTarget(latlng, excludedLayer = null) {
    if (!isSnapEnabled()) return null;
    if (!latlng) return null;

    const targetPoint = map.latLngToContainerPoint(latlng);
    const snapBounds = map.getBounds().pad(0.15);
    let bestVertex = null;
    let bestSegment = null;

    (drawnItems ? drawnItems.getLayers() : []).forEach(layer => {
        if (layer.feature?.properties?.isHidden === true) return;
        if (excludedLayer && layer === excludedLayer) return;
        if (!isLayerInSnapView(layer, snapBounds)) return;

        const geometry = collectLayerSnapGeometry(layer, snapBounds);
        geometry.vertices.forEach(vertex => {
            const vertexPoint = map.latLngToContainerPoint(vertex);
            const distance = getPointDistance(targetPoint, vertexPoint);
            if (distance > SNAP_DISTANCE_PX) return;
            if (!bestVertex || distance < bestVertex.distance) {
                bestVertex = { latlng: vertex, distance };
            }
        });

        geometry.segments.forEach(([startLatLng, endLatLng]) => {
            const startPoint = map.latLngToContainerPoint(startLatLng);
            const endPoint = map.latLngToContainerPoint(endLatLng);
            const snappedPoint = getClosestPointOnSegment(targetPoint, startPoint, endPoint);
            const distance = getPointDistance(targetPoint, snappedPoint);
            if (distance > SNAP_DISTANCE_PX) return;
            if (!bestSegment || distance < bestSegment.distance) {
                bestSegment = { latlng: map.containerPointToLatLng(snappedPoint), distance };
            }
        });
    });

    const additionalGeometry = getCachedAdditionalSnapGeometry(snapBounds);
    additionalGeometry.vertices.forEach(({ latlng: vertex, point: vertexPoint }) => {
        const distance = getPointDistance(targetPoint, vertexPoint);
        if (distance > SNAP_DISTANCE_PX) return;
        if (!bestVertex || distance < bestVertex.distance) {
            bestVertex = { latlng: vertex, distance };
        }
    });

    additionalGeometry.segments.forEach(({ startLatLng, endLatLng, startPoint, endPoint }) => {
        const snappedPoint = getClosestPointOnSegment(targetPoint, startPoint, endPoint);
        const distance = getPointDistance(targetPoint, snappedPoint);
        if (distance > SNAP_DISTANCE_PX) return;
        if (!bestSegment || distance < bestSegment.distance) {
            bestSegment = { latlng: map.containerPointToLatLng(snappedPoint), distance };
        }
    });

    if (bestVertex) return { latlng: bestVertex.latlng, type: 'vertex', distance: bestVertex.distance };
    if (bestSegment) return { latlng: bestSegment.latlng, type: 'segment', distance: bestSegment.distance };
    return null;
}

export function getSnapResult(latlng, excludedLayer = null) {
    const normalizedLatLng = normalizeLatLng(latlng);
    if (!isSnapEnabled()) {
        return {
            latlng: normalizedLatLng,
            isSnapped: false,
            snapTarget: null
        };
    }
    const snapTarget = findSnapTarget(normalizedLatLng, excludedLayer);
    return {
        latlng: snapTarget ? normalizeLatLng(snapTarget.latlng) : normalizedLatLng,
        isSnapped: !!snapTarget,
        snapTarget
    };
}

export function getSnappedLatLng(latlng, excludedLayer = null) {
    return getSnapResult(latlng, excludedLayer).latlng;
}

function ensureSnapGuideLayer() {
    if (snapGuideLayer) return snapGuideLayer;
    snapGuideLayer = L.circleMarker([0, 0], {
        radius: 6,
        color: '#2563eb',
        weight: 2,
        fillColor: '#ffffff',
        fillOpacity: 0.95,
        interactive: false
    });
    return snapGuideLayer;
}

export function updateSnapGuide(latlng, isSnapped) {
    if (!isSnapEnabled()) {
        clearSnapGuide();
        return;
    }
    if (!isSnapped || !latlng) {
        if (snapGuideLayer && map.hasLayer(snapGuideLayer)) map.removeLayer(snapGuideLayer);
        return;
    }

    const guide = ensureSnapGuideLayer();
    guide.setLatLng(latlng);
    if (!map.hasLayer(guide)) guide.addTo(map);
}

export function clearSnapGuide() {
    if (snapGuideLayer && map.hasLayer(snapGuideLayer)) map.removeLayer(snapGuideLayer);
}

export function syncSnapToggleButtons() {
    const isEnabled = isSnapEnabled();
    document.getElementsByName('snap-enabled-select').forEach(input => {
        input.checked = (input.value === String(isEnabled));
    });
}

export function setSnapEnabled(value) {
    AppState.isSnapEnabled = (value === true || value === 'true');
    localStorage.setItem('setting_snap_enabled', AppState.isSnapEnabled ? 'true' : 'false');
    if (!AppState.isSnapEnabled) {
        clearSnapGuide();
        clearUserMapSnapGeometryCache();
    }
    syncSnapToggleButtons();
}
