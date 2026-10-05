import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberRecordTimestamps, updateRecordTimestamps } from '../src/record-timestamps.js';

const first = '2026-10-05T07:00:00.000Z';
const later = '2026-10-05T08:00:00.000Z';
function makeLayer(properties = {}) {
    return {
        feature: { type: 'Feature', properties: { name: '기록', ...properties } },
        geometry: { type: 'Point', coordinates: [127, 37] },
        toGeoJSON() { return { ...this.feature, geometry: this.geometry }; }
    };
}

test('신규 기록의 생성·수정 시각을 함께 저장하고 단순 저장과 순서 변경에는 유지한다', () => {
    const layer = makeLayer();
    updateRecordTimestamps(layer, first);
    assert.equal(layer.feature.properties.createdAt, first);
    assert.equal(layer.feature.properties.updatedAt, first);
    layer.feature.properties.displayOrder = 8;
    updateRecordTimestamps(layer, later);
    assert.equal(layer.feature.properties.updatedAt, first);
});

test('이름·메모·주소·사진·스타일 변경은 해당 기록의 수정 시각만 갱신한다', () => {
    for (const [key, value] of Object.entries({ name: '새 이름', description: '메모', address: '주소', photos: ['사진'], customColor: '#123456', isHidden: true, groupId: 'group-1' })) {
        const changed = makeLayer();
        const unchanged = makeLayer();
        updateRecordTimestamps(changed, first);
        updateRecordTimestamps(unchanged, first);
        changed.feature.properties[key] = value;
        updateRecordTimestamps(changed, later);
        updateRecordTimestamps(unchanged, later);
        assert.equal(changed.feature.properties.createdAt, first, key);
        assert.equal(changed.feature.properties.updatedAt, later, key);
        assert.equal(unchanged.feature.properties.updatedAt, first, key);
    }
});

test('중첩 좌표·사진 배열을 직접 수정해도 변경을 감지한다', () => {
    const layer = makeLayer({ photos: ['원본'] });
    updateRecordTimestamps(layer, first);
    layer.geometry.coordinates[0] = 128;
    updateRecordTimestamps(layer, later);
    assert.equal(layer.feature.properties.updatedAt, later);
    layer.feature.properties.photos.push('추가');
    updateRecordTimestamps(layer, '2026-10-05T09:00:00.000Z');
    assert.equal(layer.feature.properties.updatedAt, '2026-10-05T09:00:00.000Z');
    assert.equal(layer.feature.properties.createdAt, first);
});

test('파일 복원 후 재저장은 원래 시각을 보존하고 실제 수정만 반영한다', () => {
    const layer = makeLayer({ createdAt: first, updatedAt: first });
    rememberRecordTimestamps(layer);
    updateRecordTimestamps(layer, later);
    assert.equal(layer.feature.properties.updatedAt, first);
    layer.feature.properties.name = '수정';
    updateRecordTimestamps(layer, later);
    assert.equal(layer.feature.properties.createdAt, first);
    assert.equal(layer.feature.properties.updatedAt, later);
});

test('과거 생성 시각은 추측하지 않고 이후 실제 수정 시각부터 기록한다', () => {
    const layer = makeLayer();
    rememberRecordTimestamps(layer);
    updateRecordTimestamps(layer, first);
    assert.equal(layer.feature.properties.createdAt, undefined);
    assert.equal(layer.feature.properties.updatedAt, undefined);
    layer.feature.properties.description = '추가';
    updateRecordTimestamps(layer, later);
    assert.equal(layer.feature.properties.createdAt, undefined);
    assert.equal(layer.feature.properties.updatedAt, later);
});
