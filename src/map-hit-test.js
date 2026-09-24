/* ==========================================================================
   [모듈] 지도 지점 히트 테스트 (map-hit-test.js)
   [역할]
   - 화면 좌표 기준으로 점/선/면 Leaflet 레이어가 특정 지점에 걸리는지 판정합니다.
   - 지도 컨텍스트 메뉴에서 기록과 사용자지도 도형 목록을 찾는 데 사용합니다.
   [참고]
   - 우클릭/롱프레스 지점의 도형 선택 범위가 이상할 때 확인합니다.
   ========================================================================== */
import { L } from './vendor-globals.js';
import { map } from './map.js';

const DEFAULT_HIT_TOLERANCE_PX = 14;

function isLatLngPoint(value) {
    return value && typeof value.lat === 'number' && typeof value.lng === 'number';
}

function collectLatLngRings(latlngs, rings = []) {
    if (!Array.isArray(latlngs) || latlngs.length === 0) return rings;
    if (isLatLngPoint(latlngs[0])) {
        if (latlngs.length > 0) rings.push(latlngs);
        return rings;
    }
    latlngs.forEach(child => collectLatLngRings(child, rings));
    return rings;
}

function distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return point.distanceTo(a);
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
    return point.distanceTo(L.point(a.x + t * dx, a.y + t * dy));
}

function isPointInRing(point, ring) {
    const points = ring.map(latlng => map.latLngToLayerPoint(latlng));
    let inside = false;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const pi = points[i];
        const pj = points[j];
        const intersects = ((pi.y > point.y) !== (pj.y > point.y)) &&
            (point.x < ((pj.x - pi.x) * (point.y - pi.y)) / ((pj.y - pi.y) || 1e-9) + pi.x);
        if (intersects) inside = !inside;
    }

    return inside;
}

function isNearLatLngSegments(point, segments, tolerancePx) {
    return segments.some(segment => {
        if (!Array.isArray(segment) || segment.length < 2) return false;
        for (let index = 1; index < segment.length; index += 1) {
            const a = map.latLngToLayerPoint(segment[index - 1]);
            const b = map.latLngToLayerPoint(segment[index]);
            if (distanceToSegment(point, a, b) <= tolerancePx) return true;
        }
        return false;
    });
}

export function isLatLngHitLayer(layer, latlng, options = {}) {
    if (!layer || !latlng) return false;
    const tolerancePx = Number.isFinite(Number(options.tolerancePx))
        ? Number(options.tolerancePx)
        : DEFAULT_HIT_TOLERANCE_PX;
    const targetPoint = map.latLngToLayerPoint(latlng);

    if (layer instanceof L.Marker) {
        const markerLatLng = layer.getLatLng?.();
        return markerLatLng ? targetPoint.distanceTo(map.latLngToLayerPoint(markerLatLng)) <= tolerancePx + 4 : false;
    }

    if (layer instanceof L.CircleMarker) {
        const markerLatLng = layer.getLatLng?.();
        const radius = Number(layer.options?.radius) || 5;
        return markerLatLng ? targetPoint.distanceTo(map.latLngToLayerPoint(markerLatLng)) <= radius + tolerancePx : false;
    }

    if (layer instanceof L.Polygon && typeof layer.getLatLngs === 'function') {
        if (typeof layer.getBounds === 'function' && !layer.getBounds().pad(0.02).contains(latlng)) return false;
        const rings = collectLatLngRings(layer.getLatLngs());
        if (rings.some(ring => ring.length >= 3 && isPointInRing(targetPoint, ring))) return true;
        return isNearLatLngSegments(targetPoint, rings, tolerancePx);
    }

    if (layer instanceof L.Polyline && typeof layer.getLatLngs === 'function') {
        if (typeof layer.getBounds === 'function' && !layer.getBounds().pad(0.02).contains(latlng)) return false;
        return isNearLatLngSegments(targetPoint, collectLatLngRings(layer.getLatLngs()), tolerancePx);
    }

    return false;
}
