import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import {
    MAX_IMPORT_TEXT_FILE_BYTES,
    MAX_IMPORT_ZIP_ENTRY_COUNT,
    MAX_IMPORT_ZIP_FILE_BYTES,
    assertImportFileSize,
    assertSafeZipArchive
} from '../src/zip-safety.js';

test('허용 크기보다 큰 일반 파일과 ZIP을 거부한다', () => {
    assert.throws(() => assertImportFileSize({ size: MAX_IMPORT_TEXT_FILE_BYTES + 1 }, false), /100MB/);
    assert.throws(() => assertImportFileSize({ size: MAX_IMPORT_ZIP_FILE_BYTES + 1 }, true), /150MB/);
    assert.doesNotThrow(() => assertImportFileSize({ size: MAX_IMPORT_ZIP_FILE_BYTES }, true));
});

test('ZIP 파일 개수 제한을 적용한다', async () => {
    const zip = new JSZip();
    for (let index = 0; index <= MAX_IMPORT_ZIP_ENTRY_COUNT; index++) {
        zip.file(`record-${index}.geojson`, '{}');
    }
    const archive = await zip.generateAsync({ type: 'arraybuffer' });
    await assert.rejects(assertSafeZipArchive(archive), /파일이 너무 많습니다/);
});

test('정상적인 사진 포함 백업 ZIP은 허용한다', async () => {
    const fixture = await readFile(new URL('./fixtures/photo-project.geojson', import.meta.url), 'utf8');
    const zip = new JSZip();
    zip.file('photo-project.geojson', fixture);
    const archive = await zip.generateAsync({ type: 'arraybuffer' });
    await assert.doesNotReject(assertSafeZipArchive(archive));
});

test('ZIP 형식이 아닌 손상된 파일을 거부한다', async () => {
    await assert.rejects(assertSafeZipArchive(new TextEncoder().encode('not-a-zip').buffer));
});
