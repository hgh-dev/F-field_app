/* SHP ZIP을 원시 좌표로 읽고, 각 레이어의 .prj에 따라 WGS84로 변환합니다. */
import { loadShpParser } from './shp-parser-loader.js';
import { detectShpCrs, getKnownShpCrs, transformShpFeatureCollectionToWgs84 } from './shp-crs.js';

let jsZipPromise = null;

function getJSZipConstructor() {
    if (!jsZipPromise) jsZipPromise = import('jszip').then(module => module.default || module);
    return jsZipPromise;
}

function resolveMaybePromise(value) {
    return value && typeof value.then === 'function' ? value : Promise.resolve(value);
}

function isMacOsMetadataEntry(entry) {
    const segments = String(entry?.name || '').replace(/\\/g, '/').split('/');
    return segments.some(segment => segment === '__MACOSX' || segment === '.DS_Store' || segment.startsWith('._'));
}

function getExpectedShpEndFromShx(shxBuffer) {
    if (!(shxBuffer instanceof ArrayBuffer) || shxBuffer.byteLength < 100) return null;
    const view = new DataView(shxBuffer);
    const declaredBytes = view.getUint32(24, false) * 2;
    const usableBytes = declaredBytes >= 100 && declaredBytes <= shxBuffer.byteLength ? declaredBytes : shxBuffer.byteLength;
    const recordCount = Math.floor((usableBytes - 100) / 8);
    let maxEnd = 100;
    for (let index = 0; index < recordCount; index += 1) {
        const entryOffset = 100 + (index * 8);
        const recordEnd = (view.getUint32(entryOffset, false) * 2) + 8 + (view.getUint32(entryOffset + 4, false) * 2);
        if (recordEnd > maxEnd) maxEnd = recordEnd;
    }
    return maxEnd > 100 ? maxEnd : null;
}

function trimZeroPaddingByShx(shpBuffer, shxBuffer) {
    const expectedEnd = getExpectedShpEndFromShx(shxBuffer);
    if (!expectedEnd || expectedEnd >= shpBuffer.byteLength) return shpBuffer;
    if (new Uint8Array(shpBuffer, expectedEnd).some(byte => byte !== 0)) return shpBuffer;
    const trimmed = shpBuffer.slice(0, expectedEnd);
    if (trimmed.byteLength >= 28) new DataView(trimmed).setUint32(24, Math.floor(trimmed.byteLength / 2), false);
    return trimmed;
}

export async function parseShpZipToWgs84(arrayBuffer, sourceCrs = 'auto') {
    const [JSZip, shp] = await Promise.all([getJSZipConstructor(), loadShpParser()]);
    if (!shp || typeof shp.parseShp !== 'function' || typeof shp.combine !== 'function') {
        throw new Error('SHP 파서를 사용할 수 없습니다.');
    }
    const zip = await JSZip.loadAsync(arrayBuffer);
    const archiveEntries = Object.values(zip.files).filter(entry => !entry.dir);
    const entries = archiveEntries.filter(entry => !isMacOsMetadataEntry(entry));
    const ignoredEntryCount = archiveEntries.length - entries.length;
    if (ignoredEntryCount > 0) {
        console.debug(`[SHP ZIP] macOS 보조 파일 ${ignoredEntryCount}개를 제외했습니다.`);
    }
    const shpEntries = entries.filter(entry => /\.shp$/i.test(entry.name));
    if (!shpEntries.length) throw new Error('ZIP 안에서 .shp 파일을 찾을 수 없습니다.');
    const findSibling = (baseName, extension) => entries.find(entry => entry.name.toLowerCase() === `${baseName}.${extension}`.toLowerCase()) || null;
    const collections = [];

    for (const shpEntry of shpEntries) {
        const baseName = shpEntry.name.replace(/\.shp$/i, '');
        const prjEntry = findSibling(baseName, 'prj');
        const shxEntry = findSibling(baseName, 'shx');
        const dbfEntry = findSibling(baseName, 'dbf');
        const cpgEntry = findSibling(baseName, 'cpg');
        const crs = sourceCrs === 'auto'
            ? detectShpCrs(prjEntry ? await prjEntry.async('text') : '')
            : getKnownShpCrs(sourceCrs);

        let shpBuffer = await shpEntry.async('arraybuffer');
        if (shxEntry) {
            try {
                shpBuffer = trimZeroPaddingByShx(shpBuffer, await shxEntry.async('arraybuffer'));
            } catch { /* SHX 보정 실패는 기본 SHP 파싱으로 계속 진행합니다. */ }
        }
        // .prj를 shpjs에 넘기지 않아 자동/수동 모두 반드시 같은 재투영 경로를 거칩니다.
        const geometries = await resolveMaybePromise(shp.parseShp(shpBuffer));
        let properties = [];
        if (dbfEntry && typeof shp.parseDbf === 'function') {
            try {
                const cpg = cpgEntry ? (await cpgEntry.async('text')).trim() : undefined;
                properties = await resolveMaybePromise(shp.parseDbf(await dbfEntry.async('arraybuffer'), cpg));
            } catch {
                properties = [];
            }
        }
        const safeProperties = Array.isArray(properties) && properties.length
            ? properties
            : (Array.isArray(geometries) ? geometries.map(() => ({})) : []);
        const combined = await resolveMaybePromise(shp.combine([geometries, safeProperties]));
        if (combined?.type === 'FeatureCollection' && Array.isArray(combined.features)) {
            collections.push(transformShpFeatureCollectionToWgs84(combined, crs, shpEntry.name));
        }
    }

    if (!collections.length) throw new Error('표시할 도형이 없습니다.');
    return {
        type: 'FeatureCollection',
        features: collections.flatMap(collection => collection.features || [])
    };
}
