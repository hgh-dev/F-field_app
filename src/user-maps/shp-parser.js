/* ==========================================================================
   [모듈] SHP/GeoJSON 파서 (user-maps/shp-parser.js)
   [역할]
   - SHP ZIP 파일과 GeoJSON 데이터를 읽어 앱에서 쓰는 GeoJSON 구조로 정리합니다.
   - 좌표계, geometry 유형, 속성값 요약, 카테고리 정보를 분석합니다.
   [참고]
   - SHP 파일 업로드, 좌표계 변환, 속성 분류가 이상할 때 확인합니다.
   ========================================================================== */
import { getJSZipConstructor, getShpParser } from './dependencies.js';
import { ensureGeojsonSpatialMetadata } from './spatial-utils.js';

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

function ensureShpCrsDefinitions() {
    if (typeof proj4 === 'undefined' || !proj4.defs) return;
    if (!proj4.defs('EPSG:5174')) {
        proj4.defs('EPSG:5174', '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs');
    }
    if (!proj4.defs('EPSG:5179')) {
        proj4.defs('EPSG:5179', '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs');
    }
    if (!proj4.defs('EPSG:5181')) {
        proj4.defs('EPSG:5181', '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs');
    }
    if (!proj4.defs('EPSG:5186')) {
        proj4.defs('EPSG:5186', '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs');
    }
}

function resolveMaybePromise(value) {
    return value && typeof value.then === 'function' ? value : Promise.resolve(value);
}

function transformGeometryCoordinates(geometry, sourceCrs) {
    if (!geometry || sourceCrs === 'auto' || sourceCrs === 'EPSG:4326') return geometry;
    ensureShpCrsDefinitions();
    if (typeof proj4 === 'undefined') {
        throw new Error('좌표 변환 라이브러리를 사용할 수 없습니다.');
    }

    const transformCoordinate = (coordinate) => {
        if (!Array.isArray(coordinate) || coordinate.length < 2) return coordinate;
        const x = Number(coordinate[0]);
        const y = Number(coordinate[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return coordinate;
        const [lng, lat] = proj4(sourceCrs, 'EPSG:4326', [x, y]);
        return coordinate.length > 2 ? [lng, lat, ...coordinate.slice(2)] : [lng, lat];
    };

    const walk = (coordinates) => {
        if (!Array.isArray(coordinates)) return coordinates;
        if (typeof coordinates[0] === 'number') return transformCoordinate(coordinates);
        return coordinates.map(walk);
    };

    if (geometry.type === 'GeometryCollection') {
        return {
            ...geometry,
            geometries: (geometry.geometries || []).map(innerGeometry => transformGeometryCoordinates(innerGeometry, sourceCrs))
        };
    }

    return {
        ...geometry,
        coordinates: walk(geometry.coordinates)
    };
}

function transformFeatureCollectionCoordinates(featureCollection, sourceCrs) {
    if (sourceCrs === 'auto' || sourceCrs === 'EPSG:4326') return featureCollection;
    return {
        ...featureCollection,
        features: featureCollection.features.map(feature => ({
            ...feature,
            geometry: transformGeometryCoordinates(feature.geometry, sourceCrs)
        }))
    };
}

async function parseShpZipWithManualCrs(arrayBuffer, sourceCrs) {
    const [JSZip, shp] = await Promise.all([getJSZipConstructor(), getShpParser()]);
    if (!shp || typeof shp.parseShp !== 'function' || typeof shp.combine !== 'function') {
        throw new Error('SHP 파서를 사용할 수 없습니다.');
    }

    const zip = await JSZip.loadAsync(arrayBuffer);
    const allEntries = Object.values(zip.files).filter(entry => !entry.dir);
    const shpEntries = allEntries.filter(entry => /\.shp$/i.test(entry.name));
    if (shpEntries.length === 0) throw new Error('ZIP 안에서 .shp 파일을 찾을 수 없습니다.');

    const findSiblingEntry = (baseName, ext) => {
        const target = `${baseName}.${ext}`.toLowerCase();
        return allEntries.find(entry => entry.name.toLowerCase() === target) || null;
    };

    const collections = [];
    for (const shpEntry of shpEntries) {
        const baseName = shpEntry.name.replace(/\.shp$/i, '');
        const dbfEntry = findSiblingEntry(baseName, 'dbf');
        const shpBuffer = await shpEntry.async('arraybuffer');
        const geometryRows = await resolveMaybePromise(shp.parseShp(shpBuffer));

        let propertyRows = [];
        if (dbfEntry && typeof shp.parseDbf === 'function') {
            try {
                propertyRows = await resolveMaybePromise(shp.parseDbf(await dbfEntry.async('arraybuffer')));
            } catch {
                propertyRows = [];
            }
        }

        const safeProperties = Array.isArray(propertyRows) && propertyRows.length > 0
            ? propertyRows
            : (Array.isArray(geometryRows) ? geometryRows.map(() => ({})) : []);
        const combined = await resolveMaybePromise(shp.combine([geometryRows, safeProperties]));
        if (combined?.type === 'FeatureCollection' && Array.isArray(combined.features)) {
            collections.push(transformFeatureCollectionCoordinates(combined, sourceCrs));
        }
    }

    if (collections.length === 0) throw new Error('표시할 도형이 없습니다.');
    if (collections.length === 1) return collections[0];
    return {
        type: 'FeatureCollection',
        features: collections.flatMap(collection => collection.features || [])
    };
}

export async function parseLocalShpFile(file, sourceCrs = 'auto') {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.zip')) {
        throw new Error('SHP 파일 세트를 압축한 .zip 파일만 선택할 수 있습니다.');
    }

    const arrayBuffer = await readFileAsArrayBuffer(file);
    const parsed = sourceCrs && sourceCrs !== 'auto'
        ? await parseShpZipWithManualCrs(arrayBuffer, sourceCrs)
        : await (await getShpParser())(arrayBuffer);
    const featureCollection = normalizeShpResult(parsed);
    if (featureCollection.features.length === 0) {
        throw new Error('표시할 도형이 없습니다.');
    }
    featureCollection.geometryType = analyzeGeojsonGeometryType(featureCollection);
    ensureGeojsonSpatialMetadata(featureCollection);
    return featureCollection;
}
