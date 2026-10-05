/* ==========================================================================
   [모듈] 데이터 가져오기 (data-transfer-import.js)
   [역할]
   - GeoJSON, GPX, Shapefile, 백업 파일을 읽어 앱의 프로젝트/기록 구조로 변환합니다.
   - 큰 SHP 파일 안내, 파일 파싱, 기존 프로젝트와 병합하는 흐름을 담당합니다.
   [참고]
   - 파일 업로드나 가져오기 결과가 이상할 때 확인합니다.
   ========================================================================== */
import { AppState } from './state.js';
import { setRecordName } from './utils.js';
import { addUserMapFromFile } from './user-maps.js';
import { assertImportFileSize, assertSafeZipArchive } from './zip-safety.js';
import { parseShpZipToWgs84 } from './shp-zip-parser.js';
import { SHP_CRS_OPTIONS } from './shp-crs.js';
import {
    cloneRecordGroups,
    ensureFeatureCollectionRecordNames
} from './project-data-contract.js';

let saveToStorage = async () => {};
let loadCurrentProjectFeatures = () => {};
let restoreFeatures = () => {};
let renderProjectSelector = () => {};
let largeShpImportModal = null;
let shpCrsSelectModal = null;

export function configureDataTransferImport(callbacks = {}) {
    saveToStorage = callbacks.saveToStorage || saveToStorage;
    loadCurrentProjectFeatures = callbacks.loadCurrentProjectFeatures || loadCurrentProjectFeatures;
    restoreFeatures = callbacks.restoreFeatures || restoreFeatures;
    renderProjectSelector = callbacks.renderProjectSelector || renderProjectSelector;
}

function makeImportedRecordGroupId() {
    return `record-group-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function escapeModalHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showLargeShpImportChoice(featureCount) {
    if (largeShpImportModal) {
        largeShpImportModal.remove();
        largeShpImportModal = null;
    }

    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'nav-modal-overlay center-modal-overlay';
        overlay.style.display = 'flex';
        overlay.style.zIndex = '13000';
        overlay.innerHTML = `
            <div class="nav-modal-content center-modal-content compact" onclick="event.stopPropagation()" style="display:flex; flex-direction:column; gap:14px;">
                <div style="font-size:18px; font-weight:800; color:#111827;">SHP 파일 추가 방식</div>
                <div style="padding:12px; border-radius:8px; background:#f8f9fa; color:#4b5563; font-size:13px; line-height:1.55;">
                    이 SHP 파일에는 도형이 ${featureCount.toLocaleString()}개 있습니다.<br>
                    도형이 많고 수정할 일이 없는 읽기 전용의 SHP파일은 기록관리보다 지도관리 &gt; 사용자지도에서 배경지도로 가저오는 것이 적합합니다.
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <button id="large-shp-user-map-btn" type="button" style="width:100%; min-height:44px; border:0; border-radius:8px; background:#2563eb; color:#fff; font-size:14px; font-weight:800;">사용자 지도에 추가</button>
                    <button id="large-shp-record-btn" type="button" style="width:100%; min-height:44px; border:0; border-radius:8px; background:#f3f4f6; color:#111827; font-size:14px; font-weight:800;">기록관리에 추가</button>
                    <button id="large-shp-cancel-btn" type="button" style="width:100%; min-height:40px; border:0; background:transparent; color:#6b7280; font-size:13px; font-weight:700;">취소</button>
                </div>
            </div>
        `;

        const close = (value) => {
            overlay.classList.remove('visible');
            setTimeout(() => {
                overlay.remove();
                if (largeShpImportModal === overlay) largeShpImportModal = null;
                resolve(value);
            }, 160);
        };

        overlay.addEventListener('click', event => {
            if (event.target === overlay) close(null);
        });
        overlay.querySelector('#large-shp-user-map-btn').addEventListener('click', () => close('user-map'));
        overlay.querySelector('#large-shp-record-btn').addEventListener('click', () => close('record'));
        overlay.querySelector('#large-shp-cancel-btn').addEventListener('click', () => close(null));

        document.body.appendChild(overlay);
        largeShpImportModal = overlay;
        setTimeout(() => overlay.classList.add('visible'), 10);
    });
}

function showShpCrsSelectModal(fileName) {
    if (shpCrsSelectModal) {
        shpCrsSelectModal.remove();
        shpCrsSelectModal = null;
    }

    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'nav-modal-overlay center-modal-overlay';
        overlay.style.display = 'flex';
        overlay.style.zIndex = '13000';
        overlay.innerHTML = `
            <div class="nav-modal-content center-modal-content compact" onclick="event.stopPropagation()" style="display:flex; flex-direction:column; gap:14px;">
                <div style="font-size:18px; font-weight:800; color:#111827;">SHP 좌표계 선택</div>
                <div style="padding:12px; border-radius:8px; background:#f8f9fa; color:#4b5563; font-size:13px; line-height:1.55;">
                    ${escapeModalHtml(fileName)} 파일의 원본 좌표계를 선택하세요.<br>
                    .prj 파일을 기준으로 가저오려면 자동 선택을 사용하세요.
                </div>
                <label style="display:block;">
                    <span style="display:block; font-size:12px; font-weight:800; color:#4b5563; margin-bottom:6px;">좌표계</span>
                    <select id="shp-import-crs-select" class="verification-code-input" style="width:100%;">
                        ${SHP_CRS_OPTIONS.map(option => `<option value="${escapeModalHtml(option.value)}">${escapeModalHtml(option.label)}</option>`).join('')}
                    </select>
                </label>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <button id="shp-import-crs-confirm-btn" type="button" style="width:100%; min-height:44px; border:0; border-radius:8px; background:#2563eb; color:#fff; font-size:14px; font-weight:800;">가저오기</button>
                    <button id="shp-import-crs-cancel-btn" type="button" style="width:100%; min-height:40px; border:0; background:transparent; color:#6b7280; font-size:13px; font-weight:700;">취소</button>
                </div>
            </div>
        `;

        const close = (value) => {
            overlay.classList.remove('visible');
            setTimeout(() => {
                overlay.remove();
                if (shpCrsSelectModal === overlay) shpCrsSelectModal = null;
                resolve(value);
            }, 160);
        };

        overlay.addEventListener('click', event => {
            if (event.target === overlay) close(null);
        });
        overlay.querySelector('#shp-import-crs-confirm-btn').addEventListener('click', () => {
            close(overlay.querySelector('#shp-import-crs-select')?.value || 'auto');
        });
        overlay.querySelector('#shp-import-crs-cancel-btn').addEventListener('click', () => close(null));

        document.body.appendChild(overlay);
        shpCrsSelectModal = overlay;
        setTimeout(() => overlay.classList.add('visible'), 10);
    });
}

function applyImportedRecordGroupsToFeatures(featuresObj, importedGroups, shouldRemapIds = false) {
    const groups = cloneRecordGroups(importedGroups);
    if (!groups.length || !featuresObj?.features) return [];

    const idMap = new Map();
    groups.forEach(group => {
        const originalId = group.id;
        const nextId = shouldRemapIds ? makeImportedRecordGroupId() : originalId;
        idMap.set(originalId, nextId);
        group.id = nextId;
    });

    featuresObj.features.forEach(feature => {
        const groupId = feature?.properties?.groupId;
        if (groupId && idMap.has(String(groupId))) {
            feature.properties.groupId = idMap.get(String(groupId));
        }
    });

    return groups;
}

function gpxToGeoJson(gpxText) {
    // DOMParser는 문자열 XML을 탐색 가능한 문서 객체(DOM)로 바꿔줍니다.
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, "text/xml");
    const features = [];

    // extensions/color가 있으면 복원하고, 없으면 null을 반환해 호출부 기본값을 사용합니다.
    function getColor(node) {
        const ext = node.getElementsByTagName("extensions")[0];
        if (ext) {
            const colorTag = ext.getElementsByTagName("color")[0];
            if (colorTag) return colorTag.textContent;
        }
        return null;
    }

    // waypoint(wpt) -> GeoJSON Point
    const wpts = xmlDoc.getElementsByTagName("wpt");
    for (let i = 0; i < wpts.length; i++) {
        const lat = parseFloat(wpts[i].getAttribute("lat"));
        const lon = parseFloat(wpts[i].getAttribute("lon"));
        const name = wpts[i].getElementsByTagName("name")[0]?.textContent || "GPX Point";

        features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon, lat] },
            properties: {
                id: Date.now() + i,
                name: name,
                // 과거/외부 GPX는 색상이 없는 경우가 많아 앱 기본색으로 보정합니다.
                customColor: getColor(wpts[i]) || '#FF0000',
                isHidden: false
            }
        });
    }

    // track(trk) -> GeoJSON LineString
    const trks = xmlDoc.getElementsByTagName("trk");
    for (let i = 0; i < trks.length; i++) {
        const name = trks[i].getElementsByTagName("name")[0]?.textContent || "GPX Track";
        const trkpts = trks[i].getElementsByTagName("trkpt");
        const coords = [];

        for (let j = 0; j < trkpts.length; j++) {
            const lat = parseFloat(trkpts[j].getAttribute("lat"));
            const lon = parseFloat(trkpts[j].getAttribute("lon"));
            coords.push([lon, lat]);
        }

        if (coords.length > 1) {
            features.push({
                type: "Feature",
                geometry: { type: "LineString", coordinates: coords },
                properties: { id: Date.now() + 1000 + i, name: name, customColor: getColor(trks[i]) || '#0040ff', customWeight: 3, isHidden: false }
            });
        }
    }

    // route(rte)도 선형 데이터이므로 LineString으로 동일 처리합니다.
    const rtes = xmlDoc.getElementsByTagName("rte");
    for (let i = 0; i < rtes.length; i++) {
        const name = rtes[i].getElementsByTagName("name")[0]?.textContent || "GPX Route";
        const rtepts = rtes[i].getElementsByTagName("rtept");
        const coords = [];

        for (let j = 0; j < rtepts.length; j++) {
            const lat = parseFloat(rtepts[j].getAttribute("lat"));
            const lon = parseFloat(rtepts[j].getAttribute("lon"));
            coords.push([lon, lat]);
        }

        if (coords.length > 1) {
            features.push({
                type: "Feature",
                geometry: { type: "LineString", coordinates: coords },
                properties: { id: Date.now() + 2000 + i, name: name, customColor: getColor(rtes[i]) || '#0040ff', customWeight: 3, isHidden: false }
            });
        }
    }

    return { type: "FeatureCollection", features: features };
}

/**
 * 가능한 경우 모바일 공유 API를 사용하고, 불가능하면 다운로드로 저장합니다.
 * 동작 원리: capability detection(navigator.canShare)로 런타임에서 지원 여부를 판별합니다.
 */

/* ==========================================================================
   1) 파일 가져오기
   ========================================================================== */
function normalizeShpGeoJsonResult(rawResult) {
    const isFeatureCollection = (obj) => {
        return !!obj && obj.type === "FeatureCollection" && Array.isArray(obj.features);
    };

    if (isFeatureCollection(rawResult)) {
        return rawResult;
    }

    if (Array.isArray(rawResult)) {
        const collections = rawResult.filter(isFeatureCollection);
        if (collections.length === 0) return null;
        if (collections.length === 1) return collections[0];
        return {
            type: "FeatureCollection",
            features: collections.flatMap(fc => fc.features)
        };
    }

    if (rawResult && typeof rawResult === "object") {
        const collections = Object.values(rawResult).filter(isFeatureCollection);
        if (collections.length === 0) return null;
        if (collections.length === 1) return collections[0];
        return {
            type: "FeatureCollection",
            features: collections.flatMap(fc => fc.features)
        };
    }

    return null;
}

/**
 * 선택한 파일(GeoJSON/GPX/SHP ZIP)을 읽어 현재 앱 데이터에 반영합니다.
 * 동작 원리: 파일 확장자로 파서를 결정한 뒤, 결과를 GeoJSON으로 통일해
 * "프로젝트 단위 추가"와 "현재 프로젝트 레이어 추가"를 분기 처리합니다.
 */
export async function handleFileSelect(input) {
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    // 파일별 성공/병합/오류를 누적해 마지막에 한 번만 사용자에게 요약합니다.
    let newProjectCount = 0;
    let singleLayerCount = 0;
    let mergedDefaultCount = 0;
    let userMapCount = 0;
    let errorCount = 0;
    let firstErrorMessage = "";

    // 여러 프로젝트 파일을 가져올 수 있으므로 마지막 프로젝트 ID를 따로 추적합니다.
    let lastImportedProjectId = null;

    for (const file of files) {
        try {
            // 어떤 파일 형식이든 이후 로직 단순화를 위해 GeoJSON 객체로 통일합니다.
            let json;

            const ext = file.name.toLowerCase().split('.').pop();
            const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            assertImportFileSize(file, ext === 'zip');

            if (ext === 'zip') {
                // Shapefile(.zip)은 바이너리(ArrayBuffer)로 읽어 파싱합니다.
                const arrayBuffer = await file.arrayBuffer();
                await assertSafeZipArchive(arrayBuffer);
                let geoJsonResult;
                const sourceCrs = await showShpCrsSelectModal(file.name);
                if (!sourceCrs) continue;

                geoJsonResult = await parseShpZipToWgs84(arrayBuffer, sourceCrs);

                json = normalizeShpGeoJsonResult(geoJsonResult);
                if (!json) {
                    throw new Error("SHP 파싱 결과를 FeatureCollection으로 변환하지 못했습니다.");
                }

                const LARGE_SHP_FEATURE_THRESHOLD = 50;
                const featureCount = Array.isArray(json.features) ? json.features.length : 0;
                if (featureCount >= LARGE_SHP_FEATURE_THRESHOLD) {
                    const importChoice = await showLargeShpImportChoice(featureCount);
                    if (importChoice === 'user-map') {
                        await addUserMapFromFile(file);
                        userMapCount++;
                        continue;
                    }
                    if (importChoice !== 'record') continue;
                }

                // DBF 인코딩 차이로 속성 문자열이 깨질 수 있어, 기록명을 파일명으로 보정합니다.
                if (json && json.features) {
                    json.features.forEach(feature => {
                        if (!feature.properties) feature.properties = {};
                        setRecordName(feature.properties, fileNameWithoutExt);
                    });
                }

                // 정점 수 제한으로 모바일 브라우저의 메모리/렌더링 과부하를 예방합니다.
                const MAX_VERTICES = 50000;
                const vertexCount = countVertices(json);
                if (vertexCount > MAX_VERTICES) {
                    alert(`"${file.name}" 파일의 버텍스 개수가 너무 많습니다.\n모바일 환경에서는 ${MAX_VERTICES.toLocaleString()}개 이하만 가저올 수 있습니다.\n(현재: ${vertexCount.toLocaleString()}개)`);
                    errorCount++;
                    continue;
                }
            } else if (ext === 'gpx') {
                // GPX 텍스트를 읽고 변환기(gpxToGeoJson)로 표준 구조로 변환합니다.
                const text = await file.text();
                json = gpxToGeoJson(text);
            } else {
                // GeoJSON/JSON은 JSON.parse로 객체화합니다.
                const text = await file.text();
                json = JSON.parse(text);
            }

            if (!json) {
                console.warn(`파일 변환 결과가 없습니다: ${file.name}`);
                errorCount++;
                continue;
            }

            // 프로젝트 메타 필드 존재 여부로 "프로젝트 백업 파일"인지 판별합니다.
            if (json.isProjectExport === true && json.projectName) {
                ensureFeatureCollectionRecordNames(json);
                if (json.projectName === "기본 프로젝트") {
                    const defaultP = AppState.projects.find(p => p.name === "기본 프로젝트");
                    if (defaultP) {
                        const importedFeats = json.features || [];
                        const featuresObj = { type: "FeatureCollection", features: [] };

                        // 가져온 도형 ID가 기존 도형과 같으면 충돌하므로 새 ID를 재발급합니다.
                        for (let i = 0; i < importedFeats.length; i++) {
                            const f = importedFeats[i];
                            if (f.properties) {
                                f.properties.id = Date.now() + i + Math.floor(Math.random() * 100000);
                            }
                            featuresObj.features.push(f);
                        }
                        const importedGroups = applyImportedRecordGroupsToFeatures(featuresObj, json.recordGroups, true);
                        if (!Array.isArray(defaultP.recordGroups)) defaultP.recordGroups = [];
                        defaultP.recordGroups.push(...importedGroups);

                        if (AppState.currentProjectId === defaultP.id) {
                            // 현재 열려 있으면 즉시 렌더링하고,
                            restoreFeatures(featuresObj, { ensureUniqueNames: true });
                        } else {
                            // 아니면 데이터만 병합해 나중에 프로젝트 전환 시 표시되게 합니다.
                            if (!defaultP.features) defaultP.features = { type: "FeatureCollection", features: [] };
                            if (!defaultP.features.features) defaultP.features.features = [];
                            defaultP.features.features.push(...featuresObj.features);
                            defaultP.updatedAt = new Date().toISOString();
                        }

                        mergedDefaultCount += importedFeats.length;
                        // 기본 프로젝트 병합을 끝냈으므로 이 파일 루프는 종료합니다.
                        continue;
                    }
                }

                let importedName = json.projectName;

                // 이름이 같으면 "(2), (3)..."을 붙여 파일 시스템/목록 충돌을 막습니다.
                let baseName = importedName;
                if (AppState.projects.some(p => p.name === baseName)) {
                    let cnt = 2;
                    while (AppState.projects.some(p => p.name === `${baseName} (${cnt})`)) {
                        cnt++;
                    }
                    importedName = `${baseName} (${cnt})`;
                }

                // 프로젝트 파일은 현재 프로젝트에 합치지 않고 새 프로젝트 엔트리로 추가합니다.
                const newProject = {
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    name: importedName,
                    // 프로젝트 단위 복원을 위해 전체 FeatureCollection을 그대로 저장합니다.
                    features: json,
                    recordGroups: cloneRecordGroups(json.recordGroups),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                AppState.projects.push(newProject);
                lastImportedProjectId = newProject.id;
                newProjectCount++;
            } else {
                // 단일 기록은 현재 컨텍스트(현재 프로젝트)에 즉시 반영합니다.
                restoreFeatures(json, { ensureUniqueNames: true });
                singleLayerCount++;
            }

        } catch (err) {
            console.error(`파일 처리 실패 [${file.name}]:`, err);
            errorCount++;
            if (!firstErrorMessage) {
                firstErrorMessage = `${file.name}: ${err?.message || err}`;
            }
        }
    }

    // 파일마다 저장하지 않고 마지막에 한 번만 저장해 I/O 횟수를 줄입니다.
    await saveToStorage();

    // 마지막 프로젝트를 자동 선택해 사용자가 방금 가져온 데이터를 바로 확인할 수 있게 합니다.
    if (lastImportedProjectId !== null) {
        AppState.currentProjectId = lastImportedProjectId;
        loadCurrentProjectFeatures();
    }

    renderProjectSelector();

    // 작업 결과를 단일 알림으로 보여줘 연속 alert를 피합니다.
    const msgs = [];
    if (singleLayerCount > 0) msgs.push(`기록 ${singleLayerCount}건이 현재 프로젝트에 추가되었습니다.`);
    if (userMapCount > 0) msgs.push(`사용자 지도 ${userMapCount}개가 추가되었습니다.`);
    if (mergedDefaultCount > 0) msgs.push(`기본 프로젝트 기록 ${mergedDefaultCount}건이 앱의 기본 프로젝트에 병합되었습니다.`);
    if (newProjectCount > 0) msgs.push(`프로젝트 ${newProjectCount}개가 새로 추가되었습니다.`);
    if (errorCount > 0) msgs.push(`${errorCount}개 파일 처리 중 오류가 발생했습니다.`);
    if (firstErrorMessage) msgs.push(`오류 상세: ${firstErrorMessage}`);

    if (msgs.length > 0) alert(msgs.join('\n'));

    // 같은 파일을 다시 선택할 수 있도록 input 값을 초기화합니다.
    input.value = '';
}

/**
 * GeoJSON 내 전체 버텍스(꼭짓점) 수를 계산합니다.
 * 동작 원리: 중첩 배열을 재귀로 내려가며 [lng, lat] 쌍을 1개 정점으로 계산합니다.
 */
function countVertices(geojson) {
    if (!geojson) return 0;
    const features = geojson.features || [];

    // 좌표 깊이(Point/Line/Polygon/MultiPolygon)가 다르므로 재귀가 가장 단순한 공통 해법입니다.
    function countCoords(coords) {
        if (!Array.isArray(coords)) return 0;
        // 가장 안쪽 배열([lng, lat])이면 꼭짓점 1개로 계산합니다.
        if (typeof coords[0] === 'number') return 1;
        return coords.reduce((sum, c) => sum + countCoords(c), 0);
    }

    return features.reduce((total, feature) => {
        if (!feature.geometry || !feature.geometry.coordinates) return total;
        return total + countCoords(feature.geometry.coordinates);
    }, 0);
}
