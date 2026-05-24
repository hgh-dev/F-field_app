/* ==========================================================================
   [모듈] 사용자지도 공간 계산 유틸 (user-maps/spatial-utils.js)
   [역할]
   - GeoJSON geometry의 bbox 계산, 화면 범위 확장, 좌표 배열 수집을 제공합니다.
   - 큰 사용자지도에서 보이는 feature만 골라내는 데 필요한 공간 계산을 담당합니다.
   [참고]
   - 사용자지도 화면 범위 필터링이나 bbox 계산이 이상할 때 확인합니다.
   ========================================================================== */
import { map } from '../map.js';
import { SHP_VIEWPORT_BUFFER_RATIO } from './constants.js';

export function getStoredFeatureBbox(feature) {
    const bbox = feature?.bbox || feature?.properties?.__bbox;
    return Array.isArray(bbox) && bbox.length === 4 && bbox.every(value => Number.isFinite(Number(value)))
        ? bbox.map(Number)
        : null;
}

export function computeGeometryBbox(geometry) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const visitCoordinate = (coordinate) => {
        if (!Array.isArray(coordinate) || coordinate.length < 2) return;
        const x = Number(coordinate[0]);
        const y = Number(coordinate[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    };

    const walk = (coordinates) => {
        if (!Array.isArray(coordinates)) return;
        if (typeof coordinates[0] === 'number') {
            visitCoordinate(coordinates);
            return;
        }
        coordinates.forEach(walk);
    };

    walk(geometry?.coordinates);

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return null;
    }
    return [minX, minY, maxX, maxY];
}

export function ensureGeojsonSpatialMetadata(geojson) {
    if (!geojson || !Array.isArray(geojson.features)) return false;

    let changed = false;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    geojson.features.forEach(feature => {
        const bbox = getStoredFeatureBbox(feature) || computeGeometryBbox(feature?.geometry);
        if (!bbox) return;

        if (!Array.isArray(feature.bbox) || feature.bbox.length !== 4) {
            feature.bbox = [...bbox];
            changed = true;
        }
        feature.properties = feature.properties || {};
        if (!Array.isArray(feature.properties.__bbox) || feature.properties.__bbox.length !== 4) {
            feature.properties.__bbox = [...bbox];
            changed = true;
        }

        if (bbox[0] < minX) minX = bbox[0];
        if (bbox[1] < minY) minY = bbox[1];
        if (bbox[2] > maxX) maxX = bbox[2];
        if (bbox[3] > maxY) maxY = bbox[3];
    });

    if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
        const boundsBbox = [minX, minY, maxX, maxY];
        if (!Array.isArray(geojson.__bbox) || geojson.__bbox.length !== 4 || geojson.__bbox.some((value, index) => Number(value) !== boundsBbox[index])) {
            geojson.__bbox = boundsBbox;
            changed = true;
        }
    }

    return changed;
}

export function bboxIntersects(a, b) {
    if (!a || !b) return false;
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

export function getBufferedMapBbox() {
    const bounds = map.getBounds();
    const west = bounds.getWest();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const north = bounds.getNorth();
    const width = east - west;
    const height = north - south;
    const bufferX = width * SHP_VIEWPORT_BUFFER_RATIO;
    const bufferY = height * SHP_VIEWPORT_BUFFER_RATIO;
    return [west - bufferX, south - bufferY, east + bufferX, north + bufferY];
}

export function bboxToLeafletBounds(bbox) {
    if (!bbox) return null;
    return L.latLngBounds([bbox[1], bbox[0]], [bbox[3], bbox[2]]);
}

export function isLatLngPoint(value) {
    return value && typeof value.lat === 'number' && typeof value.lng === 'number';
}

export function collectLatLngSegments(latlngs, segments = []) {
    if (!Array.isArray(latlngs) || latlngs.length === 0) return segments;
    if (isLatLngPoint(latlngs[0])) {
        if (latlngs.length > 1) segments.push(latlngs);
        return segments;
    }
    latlngs.forEach(child => collectLatLngSegments(child, segments));
    return segments;
}

