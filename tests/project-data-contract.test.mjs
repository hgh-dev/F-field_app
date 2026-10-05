import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import {
    attachProjectExportMetadata,
    cloneRecordGroupsForExport,
    ensureFeatureCollectionRecordNames,
    normalizeImportedFeatureProperties,
    upgradeFeatureCollectionRecordProperties
} from '../src/project-data-contract.js';

const fixtureUrl = new URL('./fixtures/photo-project.geojson', import.meta.url);

test('내보내기 정리는 memo를 제거하고 주소와 사용자 메모를 보존한다', () => {
    const collection = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [127, 37] }, properties: {
            name: '매곡리 산35-2', memo: '사용하지 않는 값',
            address: '경기도 예시시 예시면 매곡리 산 35-2', description: '현장 확인 완료'
        } }]
    };
    ensureFeatureCollectionRecordNames(collection);
    const restored = JSON.parse(JSON.stringify(collection)).features[0];
    assert.equal(Object.hasOwn(restored.properties, 'memo'), false);
    assert.equal(restored.properties.name, '매곡리 산35-2');
    assert.equal(restored.properties.address, '경기도 예시시 예시면 매곡리 산 35-2');
    assert.equal(restored.properties.description, '현장 확인 완료');
    assert.deepEqual(restored.geometry.coordinates, [127, 37]);
});

test('사진 포함 GeoJSON을 직렬화해도 Base64와 기록 속성이 유지된다', async () => {
    const source = JSON.parse(await readFile(fileURLToPath(fixtureUrl), 'utf8'));
    const originalFeatures = structuredClone(source.features);
    const exportedAt = '2026-09-10T00:00:00.000Z';

    attachProjectExportMetadata(source, {
        name: '현장 프로젝트',
        recordGroups: [{
            id: 'group-1',
            name: '사진 그룹',
            collapsed: true,
            createdAt: '2026-09-09T00:00:00.000Z'
        }]
    }, exportedAt);

    const restored = JSON.parse(JSON.stringify(source));
    assert.deepEqual(restored.features, originalFeatures);
    assert.deepEqual(restored.features.map(feature => feature.geometry.type), ['LineString', 'Polygon', 'Point']);
    assert.equal(restored.features[2].properties.photos[0], originalFeatures[2].properties.photos[0]);
    assert.equal(restored.projectName, '현장 프로젝트');
    assert.equal(restored.exportedAt, exportedAt);
    assert.deepEqual(restored.recordGroups, [{
        id: 'group-1',
        name: '사진 그룹',
        collapsed: true,
        createdAt: '2026-09-09T00:00:00.000Z'
    }]);
});

test('사진 포함 프로젝트를 ZIP으로 압축하고 풀어도 내용이 유지된다', async () => {
    const source = JSON.parse(await readFile(fileURLToPath(fixtureUrl), 'utf8'));
    attachProjectExportMetadata(source, { name: 'ZIP 왕복', recordGroups: [] }, '2026-09-10T00:00:00.000Z');

    const zip = new JSZip();
    zip.file('project.geojson', JSON.stringify(source));
    const archive = await zip.generateAsync({ type: 'arraybuffer' });
    const restoredZip = await JSZip.loadAsync(archive);
    const restored = JSON.parse(await restoredZip.file('project.geojson').async('string'));

    assert.deepEqual(restored, source);
    assert.match(restored.features[2].properties.photos[0], /^data:image\/png;base64,/);
});

test('그룹 내보내기는 잘못된 항목을 제외하고 원본을 변경하지 않는다', () => {
    const groups = [{ id: 7, name: '그룹 7', collapsed: 0, createdAt: '2026-01-01' }, null, { name: 'ID 없음' }];
    const cloned = cloneRecordGroupsForExport(groups);

    assert.deepEqual(cloned, [{ id: '7', name: '그룹 7', collapsed: false, createdAt: '2026-01-01' }]);
    assert.equal(groups[0].id, 7);
});

test('SHP 축약 속성과 문자열 값을 앱 표준 속성으로 정리한다', () => {
    const feature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [127, 37] },
        properties: {
            id: '42',
            NAME: '가져온 기록',
            CUSTOMCOLO: '#123456',
            CUSTOMMARKE: '9',
            CUSTOMWEIG: '0',
            FILLOPACIT: '1.5',
            isHidden: 'Y',
            customFill: 'false',
            photos: ['data:image/jpeg;base64,abc123']
        }
    };

    normalizeImportedFeatureProperties(feature);

    assert.equal(feature.properties.id, 42);
    assert.equal(feature.properties.name, '가져온 기록');
    assert.equal(Object.hasOwn(feature.properties, 'memo'), false);
    assert.equal(feature.properties.customColor, '#123456');
    assert.equal(feature.properties.customMarkerSize, 5);
    assert.equal(feature.properties.customWeight, 1);
    assert.equal(feature.properties.customFillOpacity, 1);
    assert.equal(feature.properties.isHidden, true);
    assert.equal(feature.properties.customFill, false);
    assert.deepEqual(feature.properties.photos, ['data:image/jpeg;base64,abc123']);
});

test('가져오기에서는 잘못된 ID를 제거하고 내보내기에서는 기존 ID를 보존한다', () => {
    const imported = { type: 'Feature', geometry: null, properties: { id: 'not-an-id', name: '기록' } };
    normalizeImportedFeatureProperties(imported);
    assert.equal(Object.hasOwn(imported.properties, 'id'), false);

    const exported = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: null, properties: { id: 'legacy-id', name: '기록' } }]
    };
    ensureFeatureCollectionRecordNames(exported, { normalizeId: false });
    assert.equal(exported.features[0].properties.id, 'legacy-id');
    assert.equal(exported.features[0].properties.name, '기록');
});

test('기존 저장 기록은 memo를 이름으로 옮기지 않고 시각 속성만 현재 형식으로 보정한다', () => {
    const collection = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature', geometry: { type: 'Point', coordinates: [127, 37] },
            properties: { id: 1609459200000, memo: '옛 기록명', description: '기존 메모' }
        }]
    };
    assert.equal(upgradeFeatureCollectionRecordProperties(collection), true);
    const props = collection.features[0].properties;
    assert.equal(Object.hasOwn(props, 'memo'), false);
    assert.equal(Object.hasOwn(props, 'name'), false);
    assert.equal(props.createdAt, '2021-01-01T00:00:00.000Z');
    assert.equal(props.updatedAt, props.createdAt);
    assert.equal(props.description, '기존 메모');
    assert.equal(upgradeFeatureCollectionRecordProperties(collection), false);
});
