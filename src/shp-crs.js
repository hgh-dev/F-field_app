/* ========================================================================== 
   SHP 좌표계 판별 및 WGS84 재투영
   - 좌표계 정의는 이 파일 한 곳에서만 관리합니다.
   - 자동 판별은 .prj WKT를 우선 사용하고, 알려진 ESRI 이름/파라미터를 보조로 사용합니다.
   ========================================================================== */
import proj4 from 'proj4';

export const SHP_CRS_OPTIONS = [
    { value: 'auto', label: '자동 선택(.prj)' },
    { value: 'EPSG:4326', label: 'WGS84 경위도(EPSG:4326)' },
    { value: 'EPSG:5174', label: 'Korean 1985 수정 중부원점(EPSG:5174)' },
    { value: 'EPSG:5179', label: 'Korea 2000 통합좌표계(EPSG:5179)' },
    { value: 'EPSG:5181', label: 'Korea 2000 중부원점(EPSG:5181)' },
    { value: 'EPSG:5186', label: 'Korea 2000 중부원점 2010(EPSG:5186)' },
    { value: 'EPSG:5187', label: 'Korea 2000 동부원점 2010(EPSG:5187)' },
    { value: 'EPSG:5188', label: 'Korea 2000 동해원점 2010(EPSG:5188)' }
];

const CRS_DEFINITIONS = Object.freeze({
    'EPSG:4326': '+proj=longlat +datum=WGS84 +no_defs',
    // EPSG operation 5191의 Molodensky-Badekas 변환을 proj4js가 처리할 수 있는
    // 지구 중심 기준 등가 Helmert(position-vector) 값으로 환산한 정의입니다.
    // 원래 MB 이동값을 towgs84에 그대로 넣으면 기준점 효과가 사라져 약 15m 오차가 납니다.
    'EPSG:5174': '+proj=tmerc +lat_0=38 +lon_0=127.002890277778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-114.61998513899744,475.96296987030655,675.0183286857791,1.162,-2.347,-1.592,6.342 +units=m +no_defs +type=crs',
    'EPSG:5179': '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs',
    'EPSG:5181': '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs',
    'EPSG:5186': '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs',
    'EPSG:5187': '+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs',
    'EPSG:5188': '+proj=tmerc +lat_0=38 +lon_0=131 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs'
});

const SUPPORTED_CODES = new Set(Object.keys(CRS_DEFINITIONS));

export function registerShpCrsDefinitions() {
    Object.entries(CRS_DEFINITIONS).forEach(([code, definition]) => {
        proj4.defs(code, definition);
    });
}

registerShpCrsDefinitions();

function normalizedWkt(wkt) {
    return String(wkt || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getWktNumber(wkt, names) {
    for (const name of names) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[ _]');
        const match = String(wkt).match(new RegExp(`PARAMETER\\s*\\[\\s*["']${escaped}["']\\s*,\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'));
        if (match) return Number(match[1]);
    }
    return null;
}

function closeEnough(value, expected, tolerance = 1e-7) {
    return Number.isFinite(value) && Math.abs(value - expected) <= tolerance;
}

function detectKnownCodeFromWkt(wkt) {
    const authorityCodes = [...String(wkt).matchAll(/(?:AUTHORITY|ID)\s*\[\s*["']EPSG["']\s*,\s*["']?(\d+)["']?/gi)]
        .map(match => `EPSG:${match[1]}`)
        .reverse();
    const supportedAuthority = authorityCodes.find(code => SUPPORTED_CODES.has(code));
    if (supportedAuthority) return supportedAuthority;

    const name = normalizedWkt(wkt);
    const namedCodes = [
        ['EPSG:5174', ['korean1985modifiedkoreacentralbelt', 'korean1985modifiedcentralbelt', 'bessel1841transversemercator']],
        ['EPSG:5179', ['korea2000unifiedcs', 'kgd2000unifiedcs']],
        ['EPSG:5181', ['korea2000centralbelt', 'kgd2000centralbelt']],
        ['EPSG:5186', ['korea2000centralbelt2010', 'kgd2000centralbelt2010']],
        ['EPSG:5187', ['korea2000eastbelt2010', 'kgd2000eastbelt2010']],
        ['EPSG:5188', ['korea2000eastseabelt2010', 'kgd2000eastseabelt2010']]
    ];
    // 더 긴 이름(2010 등)을 먼저 확인해 부분 이름 충돌을 피합니다.
    namedCodes.sort((a, b) => Math.max(...b[1].map(v => v.length)) - Math.max(...a[1].map(v => v.length)));
    for (const [code, aliases] of namedCodes) {
        if (aliases.some(alias => name.includes(alias))) return code;
    }

    const isProjected = /(?:PROJCS|PROJCRS)\s*\[/i.test(wkt);
    if (!isProjected && /(?:wgs1984|wgs84)/.test(name)) return 'EPSG:4326';

    const isTransverseMercator = /transverse[_ ]mercator/i.test(wkt);
    if (!isTransverseMercator) return null;
    const latitude = getWktNumber(wkt, ['Latitude_Of_Origin', 'Latitude of natural origin']);
    const longitude = getWktNumber(wkt, ['Central_Meridian', 'Longitude of natural origin']);
    const scale = getWktNumber(wkt, ['Scale_Factor', 'Scale factor at natural origin']);
    const easting = getWktNumber(wkt, ['False_Easting', 'False easting']);
    const northing = getWktNumber(wkt, ['False_Northing', 'False northing']);
    const isBesselKorean1985 = /(?:bessel1841|korean1985)/.test(name);
    const isKgd2002 = /(?:kgd2002|korea2000|koreageodeticdatum2002|grs1980|grs80)/.test(name);

    if (isBesselKorean1985 && closeEnough(latitude, 38) && closeEnough(longitude, 127.0028902777778, 1e-8)
        && closeEnough(scale, 1) && closeEnough(easting, 200000) && closeEnough(northing, 500000)) return 'EPSG:5174';
    if (!isKgd2002 || !closeEnough(latitude, 38)) return null;
    if (closeEnough(longitude, 127.5) && closeEnough(scale, 0.9996) && closeEnough(easting, 1000000) && closeEnough(northing, 2000000)) return 'EPSG:5179';
    if (!closeEnough(scale, 1) || !closeEnough(easting, 200000)) return null;
    if (closeEnough(longitude, 127) && closeEnough(northing, 500000)) return 'EPSG:5181';
    if (closeEnough(longitude, 127) && closeEnough(northing, 600000)) return 'EPSG:5186';
    if (closeEnough(longitude, 129) && closeEnough(northing, 600000)) return 'EPSG:5187';
    if (closeEnough(longitude, 131) && closeEnough(northing, 600000)) return 'EPSG:5188';
    return null;
}

function canProj4Parse(definition) {
    try {
        proj4.Proj(definition);
        return true;
    } catch {
        return false;
    }
}

export function getKnownShpCrs(code) {
    const normalizedCode = String(code || '').toUpperCase();
    if (!SUPPORTED_CODES.has(normalizedCode)) {
        throw new Error(`지원하지 않는 SHP 좌표계입니다: ${code || '(없음)'}`);
    }
    return { code: normalizedCode, definition: normalizedCode, source: 'manual' };
}

export function detectShpCrs(prjText) {
    const wkt = String(prjText || '').trim();
    if (!wkt) {
        throw new Error('ZIP 안에 .prj 파일이 없어 원본 좌표계를 알 수 없습니다. 좌표계를 직접 선택해 주세요.');
    }

    const knownCode = detectKnownCodeFromWkt(wkt);
    const wktParses = canProj4Parse(wkt);
    if (knownCode === 'EPSG:4326') {
        return { code: knownCode, definition: knownCode, source: wktParses ? 'prj-wkt' : 'name-fallback' };
    }
    if (knownCode === 'EPSG:5174') {
        // ESRI 5174 WKT는 보통 TOWGS84를 생략합니다. 이 WKT를 그대로 쓰면
        // Bessel 좌표가 WGS84로 datum 이동되지 않아 수백 m 오차가 납니다.
        const hasDatumTransform = /TOWGS84\s*\[/i.test(wkt);
        return {
            code: knownCode,
            definition: wktParses && hasDatumTransform ? wkt : knownCode,
            source: wktParses && hasDatumTransform ? 'prj-wkt' : 'epsg-datum-fallback'
        };
    }
    if (knownCode) {
        return { code: knownCode, definition: wktParses ? wkt : knownCode, source: wktParses ? 'prj-wkt' : 'name-fallback' };
    }
    if (wktParses) {
        return { code: 'PRJ-WKT', definition: wkt, source: 'prj-wkt' };
    }
    throw new Error('지원하거나 해석할 수 없는 .prj 좌표계입니다. 원본 SHP의 좌표계를 확인한 뒤 직접 선택해 주세요.');
}

function firstCoordinateInGeometry(geometry) {
    if (!geometry) return null;
    if (geometry.type === 'GeometryCollection') {
        for (const nested of geometry.geometries || []) {
            const coordinate = firstCoordinateInGeometry(nested);
            if (coordinate) return coordinate;
        }
        return null;
    }
    let value = geometry.coordinates;
    while (Array.isArray(value) && Array.isArray(value[0])) value = value[0];
    return Array.isArray(value) && value.length >= 2 ? value : null;
}

function firstCoordinateInCollection(featureCollection) {
    for (const feature of featureCollection?.features || []) {
        const coordinate = firstCoordinateInGeometry(feature?.geometry);
        if (coordinate) return coordinate;
    }
    return null;
}

function transformCoordinate(coordinate, sourceDefinition) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return coordinate;
    const x = Number(coordinate[0]);
    const y = Number(coordinate[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return coordinate;
    const [longitude, latitude] = proj4(sourceDefinition, 'EPSG:4326', [x, y]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        throw new Error('SHP 좌표를 WGS84로 변환하지 못했습니다.');
    }
    return coordinate.length > 2
        ? [longitude, latitude, ...coordinate.slice(2)]
        : [longitude, latitude];
}

function transformNestedCoordinates(coordinates, sourceDefinition) {
    if (!Array.isArray(coordinates)) return coordinates;
    if (typeof coordinates[0] === 'number') return transformCoordinate(coordinates, sourceDefinition);
    return coordinates.map(item => transformNestedCoordinates(item, sourceDefinition));
}

export function transformShpGeometryToWgs84(geometry, crs) {
    if (!geometry || crs.code === 'EPSG:4326') return geometry;
    if (geometry.type === 'GeometryCollection') {
        return {
            ...geometry,
            geometries: (geometry.geometries || []).map(item => transformShpGeometryToWgs84(item, crs))
        };
    }
    return { ...geometry, coordinates: transformNestedCoordinates(geometry.coordinates, crs.definition) };
}

export function transformShpFeatureCollectionToWgs84(featureCollection, crs, layerName = '') {
    const before = firstCoordinateInCollection(featureCollection);
    const transformed = crs.code === 'EPSG:4326'
        ? featureCollection
        : {
            ...featureCollection,
            features: (featureCollection.features || []).map(feature => ({
                ...feature,
                geometry: transformShpGeometryToWgs84(feature.geometry, crs)
            }))
        };
    const after = firstCoordinateInCollection(transformed);
    const prefix = layerName ? `[SHP CRS:${layerName}]` : '[SHP CRS]';
    console.debug(`${prefix} source CRS:`, crs.code, `(${crs.source})`);
    console.debug(`${prefix} before:`, before ? [...before] : null);
    console.debug(`${prefix} after:`, after ? [...after] : null);

    if (after && crs.code !== 'EPSG:4326') {
        const longitude = Number(after[0]);
        const latitude = Number(after[1]);
        if (Number.isFinite(longitude) && Number.isFinite(latitude)
            && (longitude < 124 || longitude > 132 || latitude < 33 || latitude > 39)) {
            console.warn(`${prefix} 변환 결과가 대한민국 확인 범위(경도 124~132, 위도 33~39)를 벗어납니다.`, after);
        }
    }
    return transformed;
}

export { proj4 };
