import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildRecordSheets, createRecordExcel, recordExcelFileName } from '../src/record-excel-export.js';
import { calculateProjectedAreaM2, calculateProjectedLengthMeters } from '../src/utils.js';
const feature = (type, coordinates, properties = {}) => ({ type: 'Feature', geometry: { type, coordinates }, properties });
const point = feature('Point', [127, 37], { name: '=1+1', groupId: 'group-1', address: '주소 & <확인>', description: '첫 줄\n둘째 줄', createdAt: '2026-10-05T07:00:00.000Z' });
const line = feature('LineString', [[127, 37], [127.001, 37.001]], { name: '선' });
const polygon = feature('Polygon', [[[127, 37], [127.001, 37], [127.001, 37.001], [127, 37]]], { name: '면' });

test('점·선·면 열 순서와 좌표, 측정값, 한국 시각 및 없는 속성 처리', () => {
    const sheets = buildRecordSheets([point, line, polygon], [{ id: 'group-1', name: '현장 그룹' }]);
    assert.deepEqual(sheets.map(s => s.name), ['점', '선', '면']);
    assert.deepEqual(sheets[0].headers, ['번호', '생성일', '수정일', '그룹명', '기록명', '주소', '위도', '경도', '메모']);
    assert.deepEqual(sheets[1].headers, ['번호', '생성일', '수정일', '그룹명', '기록명', '주소', '길이(m)', '메모']);
    assert.deepEqual(sheets[2].headers, ['번호', '생성일', '수정일', '그룹명', '기록명', '주소', '면적(㎡)', '메모']);
    assert.deepEqual(sheets[0].rows[0].slice(2), ['', '현장 그룹', '=1+1', '주소 & <확인>', 37, 127, '첫 줄\n둘째 줄']);
    assert.equal(Math.round((sheets[0].rows[0][1] - Math.floor(sheets[0].rows[0][1])) * 24), 16);
    assert.equal(sheets[1].rows[0][6], calculateProjectedLengthMeters(line));
    assert.equal(sheets[2].rows[0][6], calculateProjectedAreaM2(polygon));
    assert.deepEqual(sheets[1].rows[0].slice(1, 3), ['', '']);
});

test('빈 시트를 제외하고 시트별 번호와 입력 순서를 유지한다', () => {
    const sheets = buildRecordSheets([polygon, { ...polygon, properties: { name: '두번째' } }]);
    assert.deepEqual(sheets.map(s => s.name), ['면']);
    assert.deepEqual(sheets[0].rows.map(row => [row[0], row[4]]), [[1, '면'], [2, '두번째']]);
});

test('복합 도형과 다중점을 빠뜨리지 않는다', () => {
    const multi = feature('MultiPoint', [[127, 37], [128, 38]]);
    const collection = { type: 'Feature', geometry: { type: 'GeometryCollection', geometries: [line.geometry, polygon.geometry] } };
    assert.deepEqual(buildRecordSheets([multi, collection]).map(s => s.rows.length), [2, 1, 1]);
    assert.throws(() => buildRecordSheets([{ geometry: null }]), /도형 없음/);
});

test('XLSX 패키지는 문자열과 숫자를 구분하고 필터와 첫 행 고정을 포함한다', async () => {
    const zip = await JSZip.loadAsync(await createRecordExcel([point, line, polygon], [{ id: 'group-1', name: '현장 그룹' }]));
    const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
    assert.match(sheet, /t="inlineStr"><is><t xml:space="preserve">=1\+1/);
    assert.match(sheet, /주소 &amp; &lt;확인&gt;/);
    assert.match(sheet, /현장 그룹/);
    assert.match(sheet, /<c r="G2" s="4"><v>37<\/v>/);
    assert.match(sheet, /state="frozen"/);
    assert.match(sheet, /autoFilter ref="A1:I2"/);
    assert.equal(sheet.includes('<f>'), false);
    assert.match(await zip.file('xl/workbook.xml').async('string'), /sheet name="면"/);
    assert.match(await zip.file('xl/styles.xml').async('string'), /yyyy-mm-dd hh:mm:ss/);
});

test('파일명은 프로젝트명, 현지 날짜와 시간을 사용한다', () => {
    assert.equal(recordExcelFileName('재경부/이관', new Date(2026, 9, 5, 16, 35, 32)), '재경부_이관_선택기록_20261005_163532.xlsx');
});
