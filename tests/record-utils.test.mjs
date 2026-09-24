import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ensureRecordNameAlias,
    getRecordName,
    normalizeColor,
    parseDashArray,
    setRecordName
} from '../src/utils.js';

test('구버전 memo 기록명을 name과 동기화한다', () => {
    const properties = { memo: '기존 기록명' };
    ensureRecordNameAlias(properties);
    assert.equal(getRecordName(properties), '기존 기록명');
    assert.deepEqual(properties, { name: '기존 기록명', memo: '기존 기록명' });
});

test('기록명 변경 시 name과 memo를 함께 저장한다', () => {
    const properties = {};
    setRecordName(properties, '새 기록명');
    assert.deepEqual(properties, { name: '새 기록명', memo: '새 기록명' });
});

test('색상과 선 스타일 입력을 안전한 값으로 정규화한다', () => {
    assert.equal(normalizeColor('#12AbEf'), '#12AbEf');
    assert.equal(normalizeColor('red'), 'red');
    assert.equal(normalizeColor('red\" onload=\"alert(1)'), '#3388ff');
    assert.deepEqual(parseDashArray('10, 5, 2, 5'), [10, 5, 2, 5]);
    assert.deepEqual(parseDashArray('none'), []);
});
