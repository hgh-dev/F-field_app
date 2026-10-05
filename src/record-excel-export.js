import JSZip from 'jszip';
import { calculateProjectedAreaM2, calculateProjectedLengthMeters } from './utils.js';

export const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const common = ['번호', '생성일', '수정일', '그룹명', '기록명', '주소'];

// 엑셀의 날짜 일련번호에 한국 표준시를 반영합니다. 없는 시각은 추측하지 않습니다.
function excelDate(value) {
    if (!value || typeof value !== 'string') return '';
    const time = Date.parse(value);
    return Number.isFinite(time) ? (time + 9 * 3600000) / 86400000 + 25569 : '';
}

export function buildRecordSheets(features, recordGroups = []) {
    const groupNames = new Map(recordGroups
        .filter(group => group?.id !== undefined && group?.id !== null)
        .map(group => [String(group.id), String(group.name || '')]));
    const sheets = [
        { name: '점', headers: [...common, '위도', '경도', '메모'], rows: [], widths: [8, 23, 23, 24, 28, 48, 16, 16, 48] },
        { name: '선', headers: [...common, '길이(m)', '메모'], rows: [], widths: [8, 23, 23, 24, 28, 48, 20, 48] },
        { name: '면', headers: [...common, '면적(㎡)', '메모'], rows: [], widths: [8, 23, 23, 24, 28, 48, 20, 48] }
    ];
    function append(geometry, props) {
        if (geometry?.type === 'GeometryCollection') {
            geometry.geometries.forEach(item => append(item, props));
            return;
        }
        if (geometry?.type === 'MultiPoint') {
            geometry.coordinates.forEach(point => append({ type: 'Point', coordinates: point }, props));
            return;
        }
        const type = geometry?.type;
        const sheet = type === 'Point' ? sheets[0] : ['LineString', 'MultiLineString'].includes(type) ? sheets[1] : ['Polygon', 'MultiPolygon'].includes(type) ? sheets[2] : null;
        if (!sheet) throw new Error(`엑셀로 내보낼 수 없는 도형입니다: ${type || '도형 없음'}`);
        const values = type === 'Point' ? [geometry.coordinates[1], geometry.coordinates[0]]
            : [sheet === sheets[1] ? calculateProjectedLengthMeters(geometry) : calculateProjectedAreaM2(geometry)];
        if (values.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('좌표 또는 측정값이 올바르지 않습니다.');
        const groupName = props.groupId === undefined || props.groupId === null
            ? ''
            : (groupNames.get(String(props.groupId)) || '');
        sheet.rows.push([sheet.rows.length + 1, excelDate(props.createdAt), excelDate(props.updatedAt), groupName, String(props.name ?? ''), String(props.address ?? ''), ...values, String(props.description ?? '')]);
    }
    features.forEach(feature => append(feature.geometry, feature.properties || {}));
    return sheets.filter(sheet => sheet.rows.length);
}

export function recordExcelFileName(projectName, date = new Date()) {
    const name = String(projectName || '프로젝트').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim() || '프로젝트';
    const pad = value => String(value).padStart(2, '0');
    const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
    return `${name}_선택기록_${stamp}.xlsx`;
}

function escapeXml(value) {
    const text = String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '');
    if (text.length > 32767) throw new Error('엑셀 셀 한 개에 저장할 수 있는 글자 수(32,767자)를 초과했습니다.');
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r/g, '&#13;');
}

function sheetXml(sheet) {
    if (sheet.rows.length > 1048575) throw new Error('엑셀 시트의 최대 행 수를 초과했습니다.');
    const last = String.fromCharCode(64 + sheet.headers.length);
    const rows = [sheet.headers, ...sheet.rows].map((row, index) => {
        const height = index === 0 ? 28 : Math.min(120, Math.max(30, ...row.map((value, col) => typeof value === 'string' ? value.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length * 1.8 / sheet.widths[col])), 0) * 16 : 30)));
        const cells = row.map((value, col) => {
            const ref = `${String.fromCharCode(65 + col)}${index + 1}`;
            const numeric = typeof value === 'number';
            const style = index === 0 ? 1 : col === 1 || col === 2 ? 3 : numeric && col >= 5 ? (sheet.name === '점' ? 4 : 5) : 2;
            // 모든 사용자 입력은 명시적 문자열 셀로 저장해 수식으로 해석되지 않게 합니다.
            return numeric ? `<c r="${ref}" s="${style}"><v>${value}</v></c>` : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        }).join('');
        return `<row r="${index + 1}" ht="${height}" customHeight="1">${cells}</row>`;
    }).join('');
    return `${XML}<worksheet xmlns="${NS}"><dimension ref="A1:${last}${sheet.rows.length + 1}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="30"/><cols>${sheet.widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData><autoFilter ref="A1:${last}${sheet.rows.length + 1}"/></worksheet>`;
}

// 단순 표 전용 SpreadsheetML 패키지. 기존 JSZip을 재사용해 새 런타임 의존성을 추가하지 않습니다.
export async function createRecordExcel(features, recordGroups = []) {
    const sheets = buildRecordSheets(features, recordGroups);
    if (!sheets.length) throw new Error('선택된 기록이 없습니다.');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
    zip.file('_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file('xl/workbook.xml', `${XML}<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet, i) => `<sheet name="${sheet.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="styles" Type="${REL}/styles" Target="styles.xml"/></Relationships>`);
    zip.file('xl/styles.xml', `${XML}<styleSheet xmlns="${NS}"><numFmts count="3"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/><numFmt numFmtId="165" formatCode="0.000000"/><numFmt numFmtId="166" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF245A81"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>${[0, 164, 165, 166].map(id => `<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
    sheets.forEach((sheet, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet)));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
