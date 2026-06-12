/* ==========================================================================
   [모듈] 데이터 내보내기 (data-transfer-export.js)
   [역할]
   - 기록과 프로젝트를 GeoJSON, GPX, Shapefile, 백업 파일로 내보냅니다.
   - 파일 저장, 압축 생성, 네이티브 앱 저장 연동을 담당합니다.
   [참고]
   - 내보내기 형식이나 백업 파일 생성 문제가 생기면 확인합니다.
   ========================================================================== */
import { AppState } from './state.js';
import { drawnItems } from './draw.js';
import { getTimestampString, getRecordName, ensureRecordNameAlias } from './utils.js';
import { isNativeApp, saveBlobNative } from './native-bridge.js';
import { showAppConfirm } from './app-dialog.js';

let jsZipPromise = null;
let shpWriteZipPromise = null;
let saveToStorageCallback = async () => {};

export function configureDataTransferExport({ saveToStorage } = {}) {
    saveToStorageCallback = saveToStorage || saveToStorageCallback;
}

function cloneRecordGroups(recordGroups) {
    if (!Array.isArray(recordGroups)) return [];
    return recordGroups
        .filter(group => group && typeof group === 'object' && group.id)
        .map(group => ({
            id: String(group.id),
            name: String(group.name || '그룹'),
            collapsed: Boolean(group.collapsed),
            createdAt: group.createdAt || new Date().toISOString()
        }));
}

function attachProjectExportMetadata(featureCollection, project) {
    featureCollection.isProjectExport = true;
    featureCollection.projectName = project.name;
    featureCollection.exportedAt = new Date().toISOString();
    featureCollection.recordGroups = cloneRecordGroups(project.recordGroups);
}

async function getJSZipConstructor() {
    if (!jsZipPromise) {
        jsZipPromise = import('jszip').then(module => module.default);
    }
    return jsZipPromise;
}

async function getShpWriteZip() {
    if (!shpWriteZipPromise) {
        shpWriteZipPromise = import('@crmackey/shp-write').then(module => module.zip);
    }
    return shpWriteZipPromise;
}

function normalizeImportedFeatureProperties(feature) {
    if (!feature || typeof feature !== 'object') return;
    const props = feature.properties || (feature.properties = {});

    const pickFirstDefined = (keys) => {
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(props, key) && props[key] !== undefined && props[key] !== null && props[key] !== '') {
                return props[key];
            }
        }
        return undefined;
    };

    const assignIfMissing = (targetKey, aliasKeys) => {
        if (props[targetKey] !== undefined && props[targetKey] !== null && props[targetKey] !== '') return;
        const value = pickFirstDefined(aliasKeys);
        if (value !== undefined) props[targetKey] = value;
    };

    assignIfMissing('customColor', ['customcolo', 'CUSTOMCOLO', 'customcolor', 'CUSTOMCOLOR', 'color', 'COLOR']);
    assignIfMissing('customEmoji', ['customemoj', 'CUSTOMEMOJ']);
    assignIfMissing('customMarkerSize', ['custommarke', 'CUSTOMMARKE']);
    assignIfMissing('customDashArray', ['customdash', 'CUSTOMDASH']);
    assignIfMissing('customWeight', ['customweig', 'CUSTOMWEIG', 'weight', 'WEIGHT']);
    assignIfMissing('customFillOpacity', ['customfill', 'CUSTOMFILL', 'fillopacit', 'FILLOPACIT']);
    assignIfMissing('description', ['descriptio', 'DESCRIPTIO']);
    assignIfMissing('name', ['name', 'NAME', 'memo', 'MEMO']);
    assignIfMissing('memo', ['memo', 'MEMO', 'name', 'NAME']);
    ensureRecordNameAlias(props);

    if (props.customMarkerSize !== undefined) {
        const parsed = parseInt(props.customMarkerSize, 10);
        if (!Number.isNaN(parsed)) {
            props.customMarkerSize = Math.min(5, Math.max(1, parsed));
        }
    }
    if (props.customWeight !== undefined) {
        const parsed = parseInt(props.customWeight, 10);
        if (!Number.isNaN(parsed)) {
            props.customWeight = Math.min(5, Math.max(1, parsed));
        }
    }
    if (props.customFillOpacity !== undefined) {
        const parsed = parseFloat(props.customFillOpacity);
        if (!Number.isNaN(parsed)) {
            props.customFillOpacity = Math.min(1, Math.max(0, parsed));
        }
    }

    if (typeof props.isHidden === 'string') {
        const v = props.isHidden.trim().toLowerCase();
        props.isHidden = (v === 'true' || v === 't' || v === '1' || v === 'y');
    }
    if (typeof props.customFill === 'string') {
        const v = props.customFill.trim().toLowerCase();
        props.customFill = (v === 'true' || v === 't' || v === '1' || v === 'y');
    }
}

function ensureFeatureCollectionRecordNames(featureCollection) {
    if (!featureCollection || !Array.isArray(featureCollection.features)) return;
    featureCollection.features.forEach(feature => normalizeImportedFeatureProperties(feature));
}

function buildShpExportOptions(baseName) {
    return {
        name: baseName,
        types: {
            point: baseName,
            multipoint: baseName,
            line: baseName,
            polyline: baseName,
            polygon: baseName,
            pointz: baseName,
            multipointz: baseName,
            polylinez: baseName,
            polygonz: baseName
        }
    };
}

async function toArrayBuffer(data) {
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    if (data && typeof data.arrayBuffer === "function") return await data.arrayBuffer();
    throw new Error("지원하지 않는 바이너리 형식입니다.");
}

async function sanitizeShpZipPaddingIfNeeded(rawZipData) {
    const JSZip = await getJSZipConstructor();
    const zipArrayBuffer = await toArrayBuffer(rawZipData);
    const zip = await JSZip.loadAsync(zipArrayBuffer);
    const allEntries = Object.values(zip.files).filter(entry => !entry.dir);
    const shpEntries = allEntries.filter(entry => /\.shp$/i.test(entry.name));
    if (shpEntries.length === 0) return rawZipData;

    const findSiblingEntry = (baseName, ext) => {
        const target = `${baseName}.${ext}`.toLowerCase();
        return allEntries.find(entry => entry.name.toLowerCase() === target) || null;
    };

    let hasAnyFix = false;

    for (const shpEntry of shpEntries) {
        const baseName = shpEntry.name.replace(/\.shp$/i, '');
        const shxEntry = findSiblingEntry(baseName, 'shx');
        if (!shxEntry) continue;

        const shpBuffer = await shpEntry.async('arraybuffer');
        const shxBuffer = await shxEntry.async('arraybuffer');
        const fixedShpBuffer = trimShpPaddingByShx(shpBuffer, shxBuffer, shpEntry.name);

        if (fixedShpBuffer.byteLength !== shpBuffer.byteLength) {
            hasAnyFix = true;
            zip.file(shpEntry.name, fixedShpBuffer);
        }
    }

    if (!hasAnyFix) return rawZipData;
    return await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

async function generateStableShpZip(featureCollection, baseName) {
    const shpZip = await getShpWriteZip();
    const rawZip = await shpZip(featureCollection, buildShpExportOptions(baseName));
    return await sanitizeShpZipPaddingIfNeeded(rawZip);
}

async function exportShpFile(featureCollection, baseName) {
    const stableZip = await generateStableShpZip(featureCollection, baseName);
    await saveOrShareFile(stableZip, `${baseName}.zip`, "application/zip");
}

export async function exportSingleLayer(id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    let format;
    try {
        format = await showExportFormatModal();
    } catch {
        return;
    }

    let safeMemo = getRecordName(layer.feature.properties, "unnamed").replace(/[\\/:*?"<>|]/g, "_");

    if (format === 'gpx') {
        const featureCollection = {
            type: "FeatureCollection",
            features: [layer.toGeoJSON()]
        };
        const gpxData = geoJsonToGpx(featureCollection, safeMemo);
        await saveOrShareFile(gpxData, safeMemo + ".gpx", "application/gpx+xml");
    } else if (format === 'shp') {
        const featureCollection = {
            type: "FeatureCollection",
            features: [layer.toGeoJSON()]
        };
        try {
            await exportShpFile(featureCollection, safeMemo);
        } catch (e) {
            alert('Shapefile 내보내기 실패: ' + e);
        }
    } else {
        await saveOrShareFile(JSON.stringify(layer.toGeoJSON(), null, 2), safeMemo + ".geojson", "application/geo+json");
    }
};

export async function exportLayerWithFormat(layers, format) {
    if (!layers || layers.length === 0) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
    const shouldZipMultipleFiles = (isIOS || isNativeApp()) && layers.length > 1;

    if (shouldZipMultipleFiles) {
        if (format === 'shp') {
            try {
                const JSZip = await getJSZipConstructor();
                const masterZip = new JSZip();
                const nameCounts = {};
                for (let i = 0; i < layers.length; i++) {
                    const layer = layers[i];
                    const baseMemo = getRecordName(layer.feature.properties, "unnamed").replace(/[\\/:*?"<>|]/g, "_");

                    let safeMemo = baseMemo;
                    if (nameCounts[baseMemo]) {
                        safeMemo = `${baseMemo}_${nameCounts[baseMemo]}`;
                        nameCounts[baseMemo]++;
                    } else {
                        nameCounts[baseMemo] = 1;
                    }

                    const featureCollection = { type: "FeatureCollection", features: [layer.toGeoJSON()] };
                    const shpBuffer = await generateStableShpZip(featureCollection, safeMemo);
                    masterZip.file(safeMemo + ".zip", shpBuffer);
                }
                const content = await masterZip.generateAsync({ type: "blob" });
                await saveOrShareFile(content, `선택저장_${getTimestampString()}.zip`, "application/zip");
            } catch (e) {
                alert(`Shapefile 일괄 내보내기 실패: ${e}`);
            }
        } else {
            try {
                const JSZip = await getJSZipConstructor();
                const zip = new JSZip();
                const nameCounts = {};
                for (let i = 0; i < layers.length; i++) {
                    const layer = layers[i];

                    const baseMemo = getRecordName(layer.feature.properties, "unnamed").replace(/[\\/:*?"<>|]/g, "_");

                    let safeMemo = baseMemo;
                    if (nameCounts[baseMemo]) {
                        safeMemo = `${baseMemo}_${nameCounts[baseMemo]}`;
                        nameCounts[baseMemo]++;
                    } else {
                        nameCounts[baseMemo] = 1;
                    }

                    if (format === 'gpx') {
                        const featureCollection = { type: "FeatureCollection", features: [layer.toGeoJSON()] };
                        const gpxData = geoJsonToGpx(featureCollection, safeMemo);
                        zip.file(safeMemo + ".gpx", gpxData);
                    } else {
                        zip.file(safeMemo + ".geojson", JSON.stringify(layer.toGeoJSON(), null, 2));
                    }
                }
                const content = await zip.generateAsync({ type: "blob" });
                await saveOrShareFile(content, `선택저장_${getTimestampString()}.zip`, "application/zip");
            } catch (e) {
                alert(`ZIP 압축 실패: ${e}`);
            }
        }
        return;
    }

    for (const layer of layers) {
        const safeMemo = getRecordName(layer.feature.properties, "unnamed").replace(/[\\/:*?"<>|]/g, "_");

        if (format === 'gpx') {
            const featureCollection = { type: "FeatureCollection", features: [layer.toGeoJSON()] };
            const gpxData = geoJsonToGpx(featureCollection, safeMemo);
            await saveOrShareFile(gpxData, safeMemo + ".gpx", "application/gpx+xml");
        } else if (format === 'shp') {
            const featureCollection = { type: "FeatureCollection", features: [layer.toGeoJSON()] };
            try {
                await exportShpFile(featureCollection, safeMemo);
            } catch (e) {
                alert(`"${safeMemo}" Shapefile 내보내기 실패: ${e}`);
            }
        } else {
            await saveOrShareFile(JSON.stringify(layer.toGeoJSON(), null, 2), safeMemo + ".geojson", "application/geo+json");
        }
    }
}

function showExportFormatModal() {
    return new Promise((resolve, reject) => {
        const overlay = document.getElementById('export-format-modal-overlay');
        if (!overlay) { reject(); return; }

        window._resolveExportFormat = (format) => {
            closeExportFormatModal();
            resolve(format);
        };

        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('visible'), 10);
    });
}

export function closeExportFormatModal() {
    const overlay = document.getElementById('export-format-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
    window._resolveExportFormat = null;
}

export async function exportCurrentProject() {
    if (!await showAppConfirm('현재 프로젝트를 기기에 저장합니다.\n프로젝트의 모든 기록이 한 개의 GeoJSON 파일로 저장됩니다.\nGeoJSON 파일은 QGIS에서 불러올 수 있습니다.', { title: '프로젝트 저장' })) return;

    const project = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    if (!project) return;

    const currentFeatures = drawnItems.toGeoJSON();
    ensureFeatureCollectionRecordNames(currentFeatures);

    if (currentFeatures.features.length === 0) {
        alert("저장할 기록이 없습니다.");
        return;
    }

    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yy}${mm}${dd}`;
    const safeProjectName = project.name.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");

    attachProjectExportMetadata(currentFeatures, project);

    const fileName = `project_${safeProjectName}_${dateStr}.geojson`;
    await saveOrShareFile(JSON.stringify(currentFeatures), fileName, "application/geo+json");
};

export async function backupAllProjects() {
    if (!await showAppConfirm('모든 프로젝트 파일(.GeoJSON)이 하나의 압축파일(.ZIP)로 저장됩니다. 다시 불러올 때에는 압축을 해제한 후 GeoJSON 파일을 선택하세요.', { title: '데이터 백업' })) return;

    await saveToStorageCallback();

    try {
        const JSZip = await getJSZipConstructor();
        const zip = new JSZip();

        const now = new Date();
        const yy = String(now.getFullYear()).slice(2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const time = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
        const dateStr = `${yy}${mm}${dd}_${time}`;

        const nameCounts = {};

        for (const p of AppState.projects) {
            let features = p.features;
            if (!features || !features.features) {
                features = { type: "FeatureCollection", features: [] };
            }
            ensureFeatureCollectionRecordNames(features);

            attachProjectExportMetadata(features, p);

            const baseName = (p.name || "unnamed").replace(/[\\/:*?"<>|]/g, "_");
            let safeName = baseName;

            if (nameCounts[baseName]) {
                safeName = `${baseName}_${nameCounts[baseName]}`;
                nameCounts[baseName]++;
            } else {
                nameCounts[baseName] = 1;
            }

            zip.file(`${safeName}.geojson`, JSON.stringify(features, null, 2));
        }

        const content = await zip.generateAsync({ type: "blob" });
        await saveOrShareFile(content, `F-field_Backup_${dateStr}.zip`, "application/zip");
    } catch (e) {
        alert("백업 중 오류가 발생했습니다:\n" + e);
        console.error(e);
    }
}

function geoJsonToGpx(geoJson, projectName) {
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="F-Field" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${projectName}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>`;

    geoJson.features.forEach(feature => {
        const props = feature.properties || {};
        const name = getRecordName(props, "기록");
        const color = props.customColor || "";
        const coords = feature.geometry.coordinates;

        const extensions = color ? `<extensions><color>${color}</color></extensions>` : "";

        if (feature.geometry.type === 'Point') {
            gpx += `
  <wpt lat="${coords[1]}" lon="${coords[0]}">
    <name>${name}</name>
    <desc>${props.description || ""}</desc>${extensions}
  </wpt>`;
        } else if (feature.geometry.type === 'LineString') {
            gpx += `
  <trk>
    <name>${name}</name>${extensions}
    <trkseg>`;
            coords.forEach(pt => {
                gpx += `
      <trkpt lat="${pt[1]}" lon="${pt[0]}"></trkpt>`;
            });
            gpx += `
    </trkseg>
  </trk>`;
        } else if (feature.geometry.type === 'Polygon') {
            if (coords.length > 0) {
                gpx += `
  <trk>
    <name>${name} (면)</name>
    <desc>Converted from Polygon</desc>${extensions}
    <trkseg>`;
                coords[0].forEach(pt => {
                    gpx += `
      <trkpt lat="${pt[1]}" lon="${pt[0]}"></trkpt>`;
                });
                gpx += `
    </trkseg>
  </trk>`;
            }
        }
    });

    gpx += `
</gpx>`;
    return gpx;
}

async function saveOrShareFile(content, fileName, mimeType = "application/json") {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });

    if (isNativeApp()) {
        try {
            await saveBlobNative({ blob, fileName, mimeType });
            return;
        } catch (err) {
            alert('파일 저장 실패: ' + (err?.message || err));
            return;
        }
    }

    if (navigator.canShare && navigator.share) {
        const file = new File([blob], fileName, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file] }).catch(err => saveToDevice(content, fileName, mimeType));
        } else saveToDevice(content, fileName, mimeType);
    } else {
        saveToDevice(content, fileName, mimeType);
    }
}

function saveToDevice(content, fileName, mimeType = "application/geo+json") {
    const blob = new Blob([content], { type: mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function getExpectedShpEndFromShx(shxBuffer) {
    if (!(shxBuffer instanceof ArrayBuffer) || shxBuffer.byteLength < 100) return null;

    const view = new DataView(shxBuffer);
    const declaredShxBytes = view.getUint32(24, false) * 2;
    const usableBytes = (declaredShxBytes >= 100 && declaredShxBytes <= shxBuffer.byteLength)
        ? declaredShxBytes
        : shxBuffer.byteLength;
    const recordCount = Math.floor((usableBytes - 100) / 8);
    if (recordCount <= 0) return null;

    let maxEnd = 100;
    for (let i = 0; i < recordCount; i++) {
        const offset = 100 + (i * 8);
        const recordOffsetWords = view.getUint32(offset, false);
        const contentLengthWords = view.getUint32(offset + 4, false);
        const recordEndBytes = (recordOffsetWords * 2) + 8 + (contentLengthWords * 2);
        if (Number.isFinite(recordEndBytes) && recordEndBytes > maxEnd) {
            maxEnd = recordEndBytes;
        }
    }

    return maxEnd > 100 ? maxEnd : null;
}

function trimShpPaddingByShx(shpBuffer, shxBuffer, shpNameForLog = "") {
    if (!(shpBuffer instanceof ArrayBuffer)) return shpBuffer;

    const expectedEnd = getExpectedShpEndFromShx(shxBuffer);
    if (!expectedEnd || expectedEnd <= 100 || expectedEnd >= shpBuffer.byteLength) {
        return shpBuffer;
    }

    const tailBytes = new Uint8Array(shpBuffer, expectedEnd);
    const hasNonZeroTail = tailBytes.some(byte => byte !== 0);
    if (hasNonZeroTail) return shpBuffer;

    const trimmed = shpBuffer.slice(0, expectedEnd);
    if (trimmed.byteLength >= 28) {
        new DataView(trimmed).setUint32(24, Math.floor(trimmed.byteLength / 2), false);
    }
    return trimmed;
}
