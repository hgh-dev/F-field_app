import test from 'node:test';
import assert from 'node:assert/strict';
import {
    detectShpCrs,
    getKnownShpCrs,
    proj4,
    transformShpFeatureCollectionToWgs84
} from '../src/shp-crs.js';

const EPSG_5174_ESRI_WKT = 'PROJCS["Korean_1985_Modified_Korea_Central_Belt",GEOGCS["GCS_Korean_Datum_1985",DATUM["D_Korean_Datum_1985",SPHEROID["Bessel_1841",6377397.155,299.1528128]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",200000],PARAMETER["False_Northing",500000],PARAMETER["Central_Meridian",127.0028902777778],PARAMETER["Scale_Factor",1],PARAMETER["Latitude_Of_Origin",38],UNIT["Meter",1]]';

function assertLonLat(actual, expected, message = '') {
    assert.ok(Math.abs(actual[0] - expected[0]) < 1e-7, `${message} longitude: ${actual[0]}`);
    assert.ok(Math.abs(actual[1] - expected[1]) < 1e-7, `${message} latitude: ${actual[1]}`);
}

test('ESRI 이름과 파라미터로 EPSG:5174를 감지하고 datum 보정 정의를 사용한다', () => {
    const crs = detectShpCrs(EPSG_5174_ESRI_WKT);
    assert.equal(crs.code, 'EPSG:5174');
    assert.equal(crs.definition, 'EPSG:5174');
    assert.equal(crs.source, 'epsg-datum-fallback');

    // 첨부된 실제 SHP의 첫 꼭짓점과 QGIS 4.0 변환 결과를 고정 기준으로 사용합니다.
    const expected = [126.5705837848925, 37.22959040886702];
    const projected = [161821.568, 414274.3440000004];
    const collection = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: projected } }]
    };
    const transformed = transformShpFeatureCollectionToWgs84(collection, crs);
    assertLonLat(transformed.features[0].geometry.coordinates, expected);
});

test('모든 GeoJSON geometry 중첩 좌표를 바꾸고 Z값을 보존한다', () => {
    const expected = [127.1234, 36.9876];
    const projected = proj4('EPSG:4326', 'EPSG:5186', expected);
    const p = [projected[0], projected[1], 321.5];
    const geometries = [
        { type: 'Point', coordinates: p },
        { type: 'MultiPoint', coordinates: [p] },
        { type: 'LineString', coordinates: [p, p] },
        { type: 'MultiLineString', coordinates: [[p, p]] },
        { type: 'Polygon', coordinates: [[p, p, p, p]] },
        { type: 'MultiPolygon', coordinates: [[[p, p, p, p]]] },
        { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: p }, { type: 'Polygon', coordinates: [[p, p, p, p]] }] }
    ];
    const collection = {
        type: 'FeatureCollection',
        features: geometries.map(geometry => ({ type: 'Feature', properties: {}, geometry }))
    };
    const transformed = transformShpFeatureCollectionToWgs84(collection, getKnownShpCrs('EPSG:5186'));

    function visit(geometry) {
        if (geometry.type === 'GeometryCollection') return geometry.geometries.forEach(visit);
        const walk = coordinates => {
            if (typeof coordinates[0] === 'number') {
                assertLonLat(coordinates, expected, geometry.type);
                assert.equal(coordinates[2], 321.5);
                return;
            }
            coordinates.forEach(walk);
        };
        walk(geometry.coordinates);
    }
    transformed.features.forEach(feature => visit(feature.geometry));
});

test('EPSG:4326은 좌표 변환 없이 그대로 통과한다', () => {
    const collection = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [127, 37, 10] } }]
    };
    const transformed = transformShpFeatureCollectionToWgs84(collection, getKnownShpCrs('EPSG:4326'));
    assert.equal(transformed, collection);
});

test('지원 좌표계를 WKT 이름과 투영 파라미터로 구분한다', () => {
    const cases = [
        ['EPSG:5179', 'Korea_2000_Unified_CS', 127.5, 0.9996, 1000000, 2000000],
        ['EPSG:5181', 'Korea_2000_Central_Belt', 127, 1, 200000, 500000],
        ['EPSG:5186', 'Korea_2000_Central_Belt_2010', 127, 1, 200000, 600000],
        ['EPSG:5187', 'Korea_2000_East_Belt_2010', 129, 1, 200000, 600000],
        ['EPSG:5188', 'Korea_2000_East_Sea_Belt_2010', 131, 1, 200000, 600000]
    ];
    for (const [code, name, longitude, scale, easting, northing] of cases) {
        const wkt = `PROJCS["${name}",GEOGCS["Korea_2000",DATUM["Korean_Geodetic_Datum_2002",SPHEROID["GRS_1980",6378137,298.257222101]]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",${easting}],PARAMETER["False_Northing",${northing}],PARAMETER["Central_Meridian",${longitude}],PARAMETER["Scale_Factor",${scale}],PARAMETER["Latitude_Of_Origin",38],UNIT["Meter",1]]`;
        assert.equal(detectShpCrs(wkt).code, code);
    }
});

test('없는 또는 해석할 수 없는 .prj를 임의 추정하지 않는다', () => {
    assert.throws(() => detectShpCrs(''), /\.prj 파일이 없어/);
    assert.throws(() => detectShpCrs('NOT_A_COORDINATE_SYSTEM'), /해석할 수 없는/);
});

test('변환 결과가 대한민국 확인 범위를 벗어나면 경고한다', () => {
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);
    try {
        const outsideKorea = proj4('EPSG:4326', 'EPSG:5186', [10, 10]);
        transformShpFeatureCollectionToWgs84({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: outsideKorea } }]
        }, getKnownShpCrs('EPSG:5186'));
    } finally {
        console.warn = originalWarn;
    }
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /대한민국 확인 범위/);
});
