import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeRecordName,
    getRecordName,
    normalizeColor,
    parseDashArray,
    setRecordName
} from '../src/utils.js';

test('기록명은 name만 사용하며 memo는 제거한다', () => {
    const properties = { name: '현재 기록명', memo: '사용하지 않는 값' };
    assert.equal(getRecordName({ memo: '과거 값' }, '기본값'), '기본값');
    normalizeRecordName(properties);
    assert.equal(getRecordName(properties), '현재 기록명');
    assert.deepEqual(properties, { name: '현재 기록명' });
});

test('기록명 변경 시 name만 저장한다', () => {
    const properties = { memo: '사용하지 않는 값' };
    setRecordName(properties, '새 기록명');
    assert.deepEqual(properties, { name: '새 기록명' });
});

test('색상과 선 스타일 입력을 안전한 값으로 정규화한다', () => {
    assert.equal(normalizeColor('#12AbEf'), '#12AbEf');
    assert.equal(normalizeColor('red'), 'red');
    assert.equal(normalizeColor('red\" onload=\"alert(1)'), '#3388ff');
    assert.deepEqual(parseDashArray('10, 5, 2, 5'), [10, 5, 2, 5]);
    assert.deepEqual(parseDashArray('none'), []);
});
