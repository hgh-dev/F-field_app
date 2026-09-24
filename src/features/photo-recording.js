/* ==========================================================================
   [모듈] 사진 점 기록 시작 기능 (features/photo-recording.js)
   [역할]
   - 사진 촬영 또는 갤러리 선택으로 새 점 기록을 시작합니다.
   - 사진 기록 권한 확인, 임시 파일 input 생성, 선택된 사진 압축을 처리합니다.
   [참고]
   - 사진을 첨부한 점 기록 시작 흐름을 바꿀 때 확인합니다.
   ========================================================================== */
import { L } from '../vendor-globals.js';
import { AUTH_FEATURES } from '../auth-policy.js';
import { AppState } from '../state.js';
import { map } from '../map.js';
import { currentEditLayerId, drawnItems, getUniqueRecordName, recordSvgRenderer, startDraw } from '../draw.js';
import { closeBottomSheet, highlightButton, openPhotoSelectMenu, renderSurveyList, switchSidebarTab, updateLayerInfo } from '../ui.js';
import { saveToStorage } from '../data.js';
import { createColoredMarkerIcon, getRandomColor, getTimestampString, resizeImage, setRecordName } from '../utils.js';
import { showTextPrompt } from '../app-dialog.js';

const PHOTO_BATCH_MODE_SINGLE = 'single';
const PHOTO_BATCH_MODE_EACH = 'each';

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => resolve(event.target.result);
        reader.onerror = () => reject(reader.error || new Error('파일을 읽지 못했습니다.'));
        reader.readAsArrayBuffer(file);
    });
}

function readFileAsDataUrl(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = event => resolve(event.target.result);
        reader.readAsDataURL(file);
    });
}

function parseExifGpsCoordinate(values, ref) {
    if (!Array.isArray(values) || values.length < 3) return null;
    const [deg, min, sec] = values;
    if (![deg, min, sec].every(Number.isFinite)) return null;
    let decimal = deg + (min / 60) + (sec / 3600);
    if (ref === 'S' || ref === 'W') decimal *= -1;
    return decimal;
}

function parseGpsFromExifBuffer(buffer) {
    return parseExifMetadataFromBuffer(buffer)?.gps || null;
}

function parseExifMetadataFromBuffer(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null;

    let offset = 2;
    while (offset + 4 < view.byteLength) {
        if (view.getUint8(offset) !== 0xff) break;
        const marker = view.getUint8(offset + 1);
        const length = view.getUint16(offset + 2, false);
        const dataStart = offset + 4;
        const dataEnd = offset + 2 + length;
        if (marker === 0xe1 && dataEnd <= view.byteLength) {
            const header = String.fromCharCode(...new Uint8Array(buffer, dataStart, Math.min(6, dataEnd - dataStart)));
            if (header === 'Exif\0\0') return parseExifMetadataFromTiff(view, dataStart + 6);
        }
        offset = dataEnd;
    }
    return null;
}

function parseExifMetadataFromTiff(view, tiffStart) {
    if (tiffStart + 8 > view.byteLength) return null;
    const byteOrder = String.fromCharCode(view.getUint8(tiffStart), view.getUint8(tiffStart + 1));
    const littleEndian = byteOrder === 'II';
    if (!littleEndian && byteOrder !== 'MM') return null;

    const readUint16 = offset => view.getUint16(offset, littleEndian);
    const readUint32 = offset => view.getUint32(offset, littleEndian);
    const firstIfdOffset = readUint32(tiffStart + 4);
    const firstIfd = tiffStart + firstIfdOffset;
    const firstEntries = readIfdEntries(view, firstIfd, readUint16, readUint32);
    const gpsIfdOffset = getIfdTagValueOffset(firstEntries.get(0x8825), readUint32);
    const exifIfdOffset = getIfdTagValueOffset(firstEntries.get(0x8769), readUint32);
    let gps = null;

    if (gpsIfdOffset) {
        const gpsIfd = tiffStart + gpsIfdOffset;
        const entries = readIfdEntries(view, gpsIfd, readUint16, readUint32);
        const latRef = readAsciiEntry(view, tiffStart, entries.get(0x0001), readUint32);
        const lat = readRationalArrayEntry(view, tiffStart, entries.get(0x0002), readUint32);
        const lngRef = readAsciiEntry(view, tiffStart, entries.get(0x0003), readUint32);
        const lng = readRationalArrayEntry(view, tiffStart, entries.get(0x0004), readUint32);
        const latitude = parseExifGpsCoordinate(lat, latRef);
        const longitude = parseExifGpsCoordinate(lng, lngRef);
        if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
            gps = { lat: latitude, lng: longitude };
        }
    }

    let takenAt = parseExifDateString(readAsciiEntry(view, tiffStart, firstEntries.get(0x0132), readUint32));
    if (exifIfdOffset) {
        const exifEntries = readIfdEntries(view, tiffStart + exifIfdOffset, readUint16, readUint32);
        takenAt = parseExifDateString(
            readAsciiEntry(view, tiffStart, exifEntries.get(0x9003), readUint32) ||
            readAsciiEntry(view, tiffStart, exifEntries.get(0x9004), readUint32)
        ) || takenAt;
    }

    return { gps, takenAt };
}

function readIfdEntries(view, ifdOffset, readUint16, readUint32) {
    const entries = new Map();
    if (ifdOffset + 2 > view.byteLength) return entries;
    const count = readUint16(ifdOffset);
    for (let i = 0; i < count; i++) {
        const entryOffset = ifdOffset + 2 + (i * 12);
        if (entryOffset + 12 > view.byteLength) break;
        entries.set(readUint16(entryOffset), {
            type: readUint16(entryOffset + 2),
            count: readUint32(entryOffset + 4),
            valueOffset: entryOffset + 8
        });
    }
    return entries;
}

function getIfdTagValueOffset(entry, readUint32) {
    return entry ? readUint32(entry.valueOffset) : 0;
}

function parseExifDateString(value) {
    const match = String(value || '').trim().match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return null;
    const [, year, month, day, hour, minute, second] = match.map(Number);
    const date = new Date(year, month - 1, day, hour, minute, second);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatPhotoRecordName(date = new Date()) {
    const value = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    const year = String(value.getFullYear()).slice(-2);
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    const hour = String(value.getHours()).padStart(2, '0');
    const minute = String(value.getMinutes()).padStart(2, '0');
    const second = String(value.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hour}${minute}${second}`;
}

function readAsciiEntry(view, tiffStart, entry, readUint32) {
    if (!entry) return '';
    const sourceOffset = entry.count <= 4 ? entry.valueOffset : tiffStart + readUint32(entry.valueOffset);
    const chars = [];
    for (let i = 0; i < entry.count && sourceOffset + i < view.byteLength; i++) {
        const code = view.getUint8(sourceOffset + i);
        if (code === 0) break;
        chars.push(String.fromCharCode(code));
    }
    return chars.join('');
}

function readRationalArrayEntry(view, tiffStart, entry, readUint32) {
    if (!entry || entry.type !== 5) return null;
    const sourceOffset = tiffStart + readUint32(entry.valueOffset);
    const values = [];
    for (let i = 0; i < entry.count; i++) {
        const offset = sourceOffset + (i * 8);
        if (offset + 8 > view.byteLength) return null;
        const numerator = readUint32(offset);
        const denominator = readUint32(offset + 4);
        values.push(denominator ? numerator / denominator : NaN);
    }
    return values;
}

async function findFirstPhotoGps(files) {
    const metadata = await readPhotoMetadata(files);
    return metadata.find(item => item.gps)?.gps || null;
}

async function readPhotoMetadata(files) {
    const results = [];
    for (const file of files) {
        try {
            const buffer = await readFileAsArrayBuffer(file);
            results.push(parseExifMetadataFromBuffer(buffer) || { gps: null, takenAt: null });
        } catch (error) {
            console.warn('사진 GPS 메타정보를 읽지 못했습니다.', error);
            results.push({ gps: null, takenAt: null });
        }
    }
    return results;
}

function getDateFromNativePhotoItem(item) {
    const date = item?.takenAt ? new Date(item.takenAt) : null;
    return date && !Number.isNaN(date.getTime()) ? date : new Date();
}

function getGpsFromNativePhotoItem(item) {
    const lat = Number(item?.gps?.lat);
    const lng = Number(item?.gps?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
}

async function showPhotoBatchModeDialog() {
    return new Promise(resolve => {
        let overlay = document.getElementById('photo-batch-mode-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'photo-batch-mode-modal-overlay';
            overlay.className = 'nav-modal-overlay center-modal-overlay';
            overlay.innerHTML = `
                <div class="nav-modal-content center-modal-content compact" onclick="event.stopPropagation()">
                    <div class="nav-modal-header" style="font-size:18px; font-weight:bold; margin-bottom:10px; text-align:center;">사진 기록 방식</div>
                    <p style="font-size:13px; color:#666; line-height:1.5; text-align:center; margin:0 0 16px;">선택한 여러 장의 사진을 어떻게 기록할까요?</p>
                    <button id="photo-batch-single-btn" type="button"
                        style="width:100%; padding:14px; background:#3b82f6; border:none; border-radius:12px; font-size:15px; font-weight:bold; color:white; margin-bottom:8px;">하나의 점 기록에 추가</button>
                    <button id="photo-batch-each-btn" type="button"
                        style="width:100%; padding:14px; background:#fff; border:1px solid #d1d5db; border-radius:12px; font-size:15px; font-weight:bold; color:#374151; margin-bottom:8px;">각각의 점 기록으로 만들기</button>
                    <button id="photo-batch-cancel-btn" type="button"
                        style="width:100%; padding:14px; background:#f5f5f5; border:none; border-radius:12px; font-size:15px; font-weight:bold; color:#666;">취소</button>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        const close = result => {
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (!overlay.classList.contains('visible')) overlay.style.display = 'none';
            }, 180);
            resolve(result);
        };
        overlay.onclick = () => close(null);
        overlay.querySelector('#photo-batch-single-btn').onclick = () => close(PHOTO_BATCH_MODE_SINGLE);
        overlay.querySelector('#photo-batch-each-btn').onclick = () => close(PHOTO_BATCH_MODE_EACH);
        overlay.querySelector('#photo-batch-cancel-btn').onclick = () => close(null);
        overlay.style.display = 'flex';
        requestAnimationFrame(() => overlay.classList.add('visible'));
    });
}

async function createPhotoRecordAtGps(gps, photos, defaultName = getTimestampString(), options = {}) {
    const recordName = options.promptName === false
        ? defaultName
        : await showTextPrompt('기록명 입력:', defaultName);
    const memo = recordName;
    if (memo === null) return false;
    const finalRecordName = memo || defaultName || getTimestampString();
    const randomColor = getRandomColor();
    const marker = L.marker([gps.lat, gps.lng], {
        icon: createColoredMarkerIcon(randomColor, '📷', 3),
        renderer: recordSvgRenderer
    });
    marker.feature = {
        type: 'Feature',
        properties: setRecordName({
            id: Date.now(),
            isHidden: false,
            customColor: randomColor,
            customEmoji: '📷',
            customMarkerSize: 3,
            photos
        }, getUniqueRecordName(finalRecordName))
    };

    updateLayerInfo(marker);
    drawnItems.addLayer(marker);
    saveToStorage();
    marker.openPopup();
    map.setView([gps.lat, gps.lng], Math.max(map.getZoom(), 18));
    switchSidebarTab('record');
    renderSurveyList();
    return true;
}

/**
 * 사진 첨부용 점 기록 시작 메뉴를 엽니다.
 * 동작 원리: 임시 file input DOM을 만들고 메뉴 선택(촬영/갤러리)으로 분기합니다.
 */
export function startPhotoPoint({ ensureFeatureAccess }) {
    if (!ensureFeatureAccess(AUTH_FEATURES.PHOTO_RECORDING, '사진 기록은 인증된 회원과 관리자 계정만 사용할 수 있습니다.')) return;
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    closeBottomSheet();

    const tempId = 'new-photo-point';
    let div = document.getElementById(`temp-inputs-${tempId}`);
    if (!div) {
        div = document.createElement('div');
        div.id = `temp-inputs-${tempId}`;
        div.style.display = 'none';
        div.innerHTML = `<input type="file" id="input-cam-${tempId}" accept="image/*" capture="environment" onchange="processPendingPhotoFiles(this)">
                         <input type="file" id="input-gal-${tempId}" accept="image/*" multiple onchange="processPendingPhotoFiles(this)">`;
        document.body.appendChild(div);
    }
    openPhotoSelectMenu(null, tempId);
}

/**
 * 사진 점 기록 전처리(리사이즈/임시저장) 후 마커 그리기를 시작합니다.
 * 동작 원리: 파일을 base64로 읽고 resizeImage를 거쳐 AppState.pendingPhotos에 보관합니다.
 */
export async function processPendingPhotoFiles(input, { ensureFeatureAccess }) {
    if (!ensureFeatureAccess(AUTH_FEATURES.PHOTO_RECORDING, '사진 기록은 인증된 회원과 관리자 계정만 사용할 수 있습니다.')) {
        input.value = '';
        return;
    }
    const files = input.files;
    if (!files || files.length === 0) return;
    if (files.length > 5) {
        alert('사진은 최대 5장까지만 저장할 수 있습니다.');
        input.value = '';
        return;
    }

    const selectedFiles = Array.from(files);
    const isGalleryMultiSelect = input.id?.includes('input-gal-') && selectedFiles.length > 1;
    const batchMode = isGalleryMultiSelect ? await showPhotoBatchModeDialog() : PHOTO_BATCH_MODE_SINGLE;
    if (!batchMode) {
        input.value = '';
        const tempDiv = document.getElementById('temp-inputs-new-photo-point');
        if (tempDiv) tempDiv.remove();
        return;
    }

    const resizePromises = selectedFiles.map(file => readFileAsDataUrl(file).then(dataUrl => resizeImage(dataUrl, 800, 0.8)));
    Promise.all([
        readPhotoMetadata(selectedFiles),
        Promise.all(resizePromises)
    ]).then(async ([metadata, results]) => {
        AppState.pendingPhotos = results;
        input.value = '';

        const tempDiv = document.getElementById('temp-inputs-new-photo-point');
        if (tempDiv) tempDiv.remove();

        if (batchMode === PHOTO_BATCH_MODE_EACH) {
            AppState.pendingPhotos = null;
            const noGpsPhotos = [];
            const noGpsMetadata = [];
            for (let index = 0; index < results.length; index++) {
                const itemMetadata = metadata[index] || {};
                const defaultName = formatPhotoRecordName(itemMetadata.takenAt || new Date());
                if (itemMetadata.gps) {
                    await createPhotoRecordAtGps(itemMetadata.gps, [results[index]], defaultName, { promptName: false });
                } else {
                    noGpsPhotos.push(results[index]);
                    noGpsMetadata.push(itemMetadata);
                }
            }
            if (noGpsPhotos.length > 0) {
                alert(`GPS 정보가 없는 사진 ${noGpsPhotos.length}장은 직접 위치를 지정해 하나의 점 기록으로 저장합니다.`);
                AppState.pendingPhotos = noGpsPhotos;
                AppState.pendingPhotoRecordName = formatPhotoRecordName(noGpsMetadata[0]?.takenAt || new Date());
                startDraw('marker');
                highlightButton('btn-photo-point');
            }
            return;
        }

        const firstMetadata = metadata[0] || {};
        const defaultName = formatPhotoRecordName(firstMetadata.takenAt || new Date());
        const gps = metadata.find(item => item?.gps)?.gps || null;
        if (gps) {
            AppState.pendingPhotos = null;
            await createPhotoRecordAtGps(gps, results, defaultName);
            return;
        }

        // 전처리 완료 후 마커 드로어를 시작하면 created 이벤트에서 사진이 레이어에 귀속됩니다.
        AppState.pendingPhotoRecordName = defaultName;
        startDraw('marker');
        highlightButton('btn-photo-point');
    }).catch(error => {
        console.error(error);
        alert(`사진을 처리하지 못했습니다.\n${error.message || error}`);
        input.value = '';
    });
}

export async function processNativePendingPhotoItems(items, { ensureFeatureAccess }) {
    if (!ensureFeatureAccess(AUTH_FEATURES.PHOTO_RECORDING, '사진 기록은 인증된 회원과 관리자 계정만 사용할 수 있습니다.')) return;
    const selectedItems = Array.isArray(items) ? items.filter(item => item?.dataUrl) : [];
    if (selectedItems.length === 0) return;
    if (selectedItems.length > 5) {
        alert('사진은 최대 5장까지만 저장할 수 있습니다.');
        return;
    }

    const batchMode = selectedItems.length > 1 ? await showPhotoBatchModeDialog() : PHOTO_BATCH_MODE_SINGLE;
    if (!batchMode) return;

    try {
        const results = await Promise.all(selectedItems.map(item => resizeImage(item.dataUrl, 800, 0.8)));
        AppState.pendingPhotos = results;

        const tempDiv = document.getElementById('temp-inputs-new-photo-point');
        if (tempDiv) tempDiv.remove();

        if (batchMode === PHOTO_BATCH_MODE_EACH) {
            AppState.pendingPhotos = null;
            const noGpsPhotos = [];
            const noGpsItems = [];
            for (let index = 0; index < results.length; index++) {
                const item = selectedItems[index] || {};
                const defaultName = formatPhotoRecordName(getDateFromNativePhotoItem(item));
                const gps = getGpsFromNativePhotoItem(item);
                if (gps) {
                    await createPhotoRecordAtGps(gps, [results[index]], defaultName, { promptName: false });
                } else {
                    noGpsPhotos.push(results[index]);
                    noGpsItems.push(item);
                }
            }
            if (noGpsPhotos.length > 0) {
                alert(`GPS 정보가 없는 사진 ${noGpsPhotos.length}장은 직접 위치를 지정해 하나의 점 기록으로 저장합니다.`);
                AppState.pendingPhotos = noGpsPhotos;
                AppState.pendingPhotoRecordName = formatPhotoRecordName(getDateFromNativePhotoItem(noGpsItems[0]));
                startDraw('marker');
                highlightButton('btn-photo-point');
            }
            return;
        }

        const firstItem = selectedItems[0] || {};
        const defaultName = formatPhotoRecordName(getDateFromNativePhotoItem(firstItem));
        const gpsItem = selectedItems.find(item => getGpsFromNativePhotoItem(item));
        const gps = getGpsFromNativePhotoItem(gpsItem);
        if (gps) {
            AppState.pendingPhotos = null;
            await createPhotoRecordAtGps(gps, results, defaultName);
            return;
        }

        AppState.pendingPhotoRecordName = defaultName;
        startDraw('marker');
        highlightButton('btn-photo-point');
    } catch (error) {
        console.error(error);
        alert(`사진을 처리하지 못했습니다.\n${error.message || error}`);
    }
}
