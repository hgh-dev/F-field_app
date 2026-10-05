const MB = 1024 * 1024;

export const MAX_IMPORT_TEXT_FILE_BYTES = 100 * MB;
export const MAX_IMPORT_ZIP_FILE_BYTES = 150 * MB;
export const MAX_IMPORT_ZIP_ENTRY_COUNT = 128;
export const MAX_IMPORT_ZIP_UNCOMPRESSED_BYTES = 300 * MB;

export function assertImportFileSize(file, isZip = false) {
    const limit = isZip ? MAX_IMPORT_ZIP_FILE_BYTES : MAX_IMPORT_TEXT_FILE_BYTES;
    if (Number(file?.size || 0) > limit) {
        throw new Error(`파일이 너무 큽니다. ${isZip ? 'ZIP은 150MB' : 'GeoJSON/GPX는 100MB'} 이하만 가저올 수 있습니다.`);
    }
}

export async function assertSafeZipArchive(arrayBuffer) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(arrayBuffer);
    const entries = Object.values(zip.files).filter(entry => !entry.dir);

    if (entries.length > MAX_IMPORT_ZIP_ENTRY_COUNT) {
        throw new Error(`ZIP 안의 파일이 너무 많습니다. 최대 ${MAX_IMPORT_ZIP_ENTRY_COUNT}개까지 가저올 수 있습니다.`);
    }

    const totalUncompressedBytes = entries.reduce((total, entry) => {
        const size = Number(entry?._data?.uncompressedSize || 0);
        return total + (Number.isFinite(size) && size > 0 ? size : 0);
    }, 0);

    if (totalUncompressedBytes > MAX_IMPORT_ZIP_UNCOMPRESSED_BYTES) {
        throw new Error('압축을 푼 파일의 예상 크기가 300MB를 초과합니다. 더 작은 파일로 나눠 주세요.');
    }
}
