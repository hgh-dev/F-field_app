import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecordAddress, getShortRecordAddress } from '../src/record-address.js';

test('전체 주소를 보존하며 일반 지번과 산 지번 기록명을 축약한다', () => {
    const address = '경기도 예시시 예시면 매곡리 산 35-2';
    assert.equal(getRecordAddress(address), address);
    assert.equal(getShortRecordAddress(address), '매곡리 산35-2');
    assert.equal(getShortRecordAddress('경기도 예시시 예시면 매곡리 산35-2'), '매곡리 산35-2');
    assert.equal(getShortRecordAddress('경기도  예시시 예시면 매곡리 145-4'), '매곡리 145-4');
});

test('조회 실패 문구와 빈 값은 기록 주소로 사용하지 않는다', () => {
    for (const value of [undefined, null, '', '   ', '주소 정보 없음']) {
        assert.equal(getRecordAddress(value), '');
        assert.equal(getShortRecordAddress(value), '');
    }
});
