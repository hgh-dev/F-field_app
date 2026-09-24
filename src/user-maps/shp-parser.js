/* ==========================================================================
   [모듈] SHP/GeoJSON 파서 (user-maps/shp-parser.js)
   [역할]
   - SHP ZIP 파일과 GeoJSON 데이터를 읽어 앱에서 쓰는 GeoJSON 구조로 정리합니다.
   - 좌표계, geometry 유형, 속성값 요약, 카테고리 정보를 분석합니다.
   [참고]
   - SHP 파일 업로드, 좌표계 변환, 속성 분류가 이상할 때 확인합니다.
   ========================================================================== */
import { ensureGeojsonSpatialMetadata } from './spatial-utils.js';
import { assertImportFileSize, assertSafeZipArchive } from '../zip-safety.js';
import { parseShpZipToWgs84 } from '../shp-zip-parser.js';

function getCategoryValueKey(value) {
    if (value === null || value === undefined || value === '') return '__EMPTY__';
    return String(value);
}

function getCategoryValueLabel(key) {
    return key === '__EMPTY__' ? '(값 없음)' : key;
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('파일을 읽지 못했습니다.'));
        reader.readAsArrayBuffer(file);
    });
}

function normalizeShpResult(result) {
    if (result?.type === 'FeatureCollection') {
        return {
            type: 'FeatureCollection',
            features: Array.isArray(result.features) ? result.features : []
        };
    }
    if (Array.isArray(result)) {
        return {
            type: 'FeatureCollection',
            features: result.flatMap(item => Array.isArray(item?.features) ? item.features : [])
        };
    }
    if (result?.type === 'Feature') {
        return {
            type: 'FeatureCollection',
            features: [result]
        };
    }
    throw new Error('지원하지 않는 SHP 데이터 구조입니다.');
}

function getFeatureGeometryKind(feature) {
    const type = feature?.geometry?.type;
    if (type === 'Point' || type === 'MultiPoint') return 'marker';
    if (type === 'LineString' || type === 'MultiLineString') return 'line';
    if (type === 'Polygon' || type === 'MultiPolygon') return 'polygon';
    if (type === 'GeometryCollection') {
        const geometries = Array.isArray(feature.geometry.geometries) ? feature.geometry.geometries : [];
        const nestedKinds = geometries.map(geometry => getFeatureGeometryKind({ geometry })).filter(Boolean);
        if (nestedKinds.includes('polygon')) return 'polygon';
        if (nestedKinds.includes('line')) return 'line';
        if (nestedKinds.includes('marker')) return 'marker';
    }
    return null;
}

export function analyzeGeojsonGeometryType(geojson) {
    const counts = { marker: 0, line: 0, polygon: 0 };
    (geojson?.features || []).forEach(feature => {
        const kind = getFeatureGeometryKind(feature);
        if (kind) counts[kind] += 1;
    });

    if (counts.polygon > 0) return 'polygon';
    if (counts.line > 0) return 'line';
    if (counts.marker > 0) return 'marker';
    return 'polygon';
}

export function getGeojsonPropertySummary(geojson) {
    const fields = new Map();
    (geojson?.features || []).forEach(feature => {
        const props = feature?.properties || {};
        Object.keys(props).forEach(field => {
            if (!fields.has(field)) fields.set(field, new Map());
            const values = fields.get(field);
            const key = getCategoryValueKey(props[field]);
            values.set(key, (values.get(key) || 0) + 1);
        });
    });

    return [...fields.entries()]
        .map(([field, values]) => ({
            field,
            values: [...values.entries()]
                .sort((a, b) => b[1] - a[1] || getCategoryValueLabel(a[0]).localeCompare(getCategoryValueLabel(b[0]), 'ko'))
                .map(([value, count]) => ({ value, count }))
        }))
        .sort((a, b) => a.field.localeCompare(b.field, 'ko'));
}

export async function parseLocalShpFile(file, sourceCrs = 'auto') {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.zip')) {
        throw new Error('SHP 파일 세트를 압축한 .zip 파일만 선택할 수 있습니다.');
    }

    assertImportFileSize(file, true);
    const arrayBuffer = await readFileAsArrayBuffer(file);
    await assertSafeZipArchive(arrayBuffer);
    const parsed = await parseShpZipToWgs84(arrayBuffer, sourceCrs || 'auto');
    const featureCollection = normalizeShpResult(parsed);
    if (featureCollection.features.length === 0) {
        throw new Error('표시할 도형이 없습니다.');
    }
    featureCollection.geometryType = analyzeGeojsonGeometryType(featureCollection);
    ensureGeojsonSpatialMetadata(featureCollection);
    return featureCollection;
}
