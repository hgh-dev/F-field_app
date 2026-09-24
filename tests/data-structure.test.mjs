import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dataModuleUrl = new URL('../src/data.js', import.meta.url);
const bridgeModuleUrl = new URL('../src/data-transfer.js', import.meta.url);
const importModuleUrl = new URL('../src/data-transfer-import.js', import.meta.url);
const exportModuleUrl = new URL('../src/data-transfer-export.js', import.meta.url);

test('data-transfer는 저장·복원 구현을 복제하지 않는 연결 모듈이다', async () => {
    const source = await readFile(bridgeModuleUrl, 'utf8');

    assert.match(source, /from '\.\/data\.js'/);
    assert.doesNotMatch(source, /localforage/);
    assert.doesNotMatch(source, /function\s+normalizeImportedFeatureProperties/);
    assert.doesNotMatch(source, /function\s+getLayersForStorageOrder/);
    assert.ok(source.split('\n').length < 80, '연결 모듈이 다시 비대해졌습니다.');
});

test('프로젝트 저장소가 가져오기에서 필요한 이름 중복 방지 옵션을 제공한다', async () => {
    const source = await readFile(dataModuleUrl, 'utf8');

    assert.match(source, /restoreFeatures\(geoJsonData, options = \{\}\)/);
    assert.match(source, /options\.ensureUniqueNames === true/);
});

test('GeoJSON 정리와 그룹 복사 규칙은 공통 데이터 규칙 모듈만 구현한다', async () => {
    const sources = await Promise.all([
        readFile(dataModuleUrl, 'utf8'),
        readFile(importModuleUrl, 'utf8'),
        readFile(exportModuleUrl, 'utf8')
    ]);

    sources.forEach(source => {
        assert.doesNotMatch(source, /function\s+normalizeImportedFeatureProperties/);
        assert.doesNotMatch(source, /function\s+cloneRecordGroups/);
    });
    assert.match(sources[0], /from '\.\/project-data-contract\.js'/);
    assert.match(sources[1], /from '\.\/project-data-contract\.js'/);
    assert.match(sources[2], /from '\.\/project-data-contract\.js'/);
});
