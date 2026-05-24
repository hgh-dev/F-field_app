/* ==========================================================================
   [모듈] 데이터 입출력 연결부 (data-transfer.js)
   [역할]
   - 가져오기/내보내기 전용 파일을 앱의 기존 데이터 API와 연결합니다.
   - 저장 함수, 프로젝트 렌더링, 지도 복원 함수들을 import/export 기능에 주입합니다.
   [참고]
   - 실제 가져오기 로직은 data-transfer-import.js, 내보내기 로직은 data-transfer-export.js에 있습니다.
   ========================================================================== */
import { STORAGE_KEY } from './config.js';
import { AppState } from './state.js';
import { drawnItems } from './draw.js';
import { renderSurveyList, updateLayerInfo, renderProjectSelector, closeSidebar, createNewProject, openSidebar, switchSidebarTab } from './ui.js';
import { getRandomColor, createColoredMarkerIcon, getShortAddress, getLineStyleDashArray, normalizeFillPattern, setRecordName, ensureRecordNameAlias } from './utils.js';
import { VWORLD_API_KEY } from './config.js';
import { map } from './map.js';
import localforage from 'localforage';
import { showAppConfirm } from './app-dialog.js';
import { configureDataTransferExport } from './data-transfer-export.js';
import { configureDataTransferImport } from './data-transfer-import.js';

export {
    backupAllProjects,
    closeExportFormatModal,
    exportCurrentProject,
    exportLayerWithFormat,
    exportSingleLayer
} from './data-transfer-export.js';

export { handleFileSelect } from './data-transfer-import.js';

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

/* ==========================================================================
   1) 프로젝트 저장/복원
   ========================================================================== */
/**
 * 현재 프로젝트 상태를 localForage(IndexedDB)에 저장합니다.
 * 동작 원리: "지도 레이어 -> AppState -> IndexedDB" 순서로 단계를 분리해
 * 저장 시점의 화면 상태와 저장소 상태가 일치하도록 만듭니다.
 */
export async function saveToStorage() {
    // 프로젝트가 아직 선택되지 않은 초기 상태라면 저장하지 않습니다.
    if (!AppState.currentProjectId) return;

    // currentProjectId는 UI/저장 과정에서 문자열일 수 있어 parseInt로 타입을 맞춘 뒤 비교합니다.
    const projectIndex = AppState.projects.findIndex(p => p.id === parseInt(AppState.currentProjectId));
    if (projectIndex !== -1) {
        const orderedLayers = getLayersForStorageOrder();
        orderedLayers.forEach((layer, index) => {
            if (!layer.feature) layer.feature = { type: "Feature", properties: {} };
            if (!layer.feature.properties) layer.feature.properties = {};
            ensureRecordNameAlias(layer.feature.properties);
            layer.feature.properties.displayOrder = index;
        });

        // Leaflet 레이어는 직렬화가 어려우므로 표준 포맷(GeoJSON)으로 변환해 저장 가능한 형태로 바꿉니다.
        AppState.projects[projectIndex].features = {
            type: "FeatureCollection",
            features: orderedLayers.map(layer => layer.toGeoJSON())
        };
        AppState.projects[projectIndex].updatedAt = new Date().toISOString();

        // UI에서 프로젝트 이름을 변경한 경우 저장 데이터와 이름을 맞춥니다.
        const nameBtn = document.getElementById('project-select-btn');
        if (nameBtn) {
            AppState.projects[projectIndex].name = nameBtn.textContent;
        }
    }

    const storageData = {
        version: "2.0",
        currentProjectId: AppState.currentProjectId,
        projects: AppState.projects
    };

    // localForage는 내부적으로 IndexedDB를 사용해 큰 객체도 문자열 변환 없이 저장할 수 있습니다.
    try {
        await localforage.setItem(STORAGE_KEY, storageData);
    } catch (err) {
        console.error("Storage save failed:", err);
        alert("데이터 저장 실패: " + err);
    }
}

configureDataTransferExport({ saveToStorage });
configureDataTransferImport({
    saveToStorage,
    loadCurrentProjectFeatures,
    restoreFeatures,
    renderProjectSelector
});

function getLayersForStorageOrder() {
    return [...drawnItems.getLayers()].sort((a, b) => {
        const orderA = Number(a.feature?.properties?.displayOrder);
        const orderB = Number(b.feature?.properties?.displayOrder);
        const hasOrderA = Number.isFinite(orderA);
        const hasOrderB = Number.isFinite(orderB);

        if (hasOrderA && hasOrderB && orderA !== orderB) return orderA - orderB;
        if (hasOrderA !== hasOrderB) return hasOrderA ? -1 : 1;

        return (a.feature?.properties?.id || 0) - (b.feature?.properties?.id || 0);
    });
}

/**
 * 저장소에서 프로젝트 데이터를 불러오고, 필요하면 구버전 데이터를 마이그레이션합니다.
 * 동작 원리: 먼저 "구버전 호환"을 처리하고, 이후 "현재 버전 복원"을 수행합니다.
 */
export async function loadFromStorage() {
    try {
        // 1) 예전 LocalStorage 데이터가 있으면 localForage로 1회 이전합니다.
        //    (LocalStorage는 용량/성능 제약이 커서 IndexedDB 기반 저장소로 이동)
        const oldData = localStorage.getItem(STORAGE_KEY);
        if (oldData) {
            console.log("Migrating from LocalStorage to localForage...");
            try {
                const parsedOld = JSON.parse(oldData);
                await localforage.setItem(STORAGE_KEY, parsedOld);
                localStorage.removeItem(STORAGE_KEY);
                console.log("Migration successful.");
            } catch (e) {
                console.error("Migration failed:", e);
            }
        }

        // 2) 현재 저장소(localForage)에서 데이터를 읽습니다.
        const savedData = await localforage.getItem(STORAGE_KEY);

        if (!savedData) {
            initDefaultProject();
            return;
        }

        // localForage는 JSON 문자열이 아니라 객체를 반환합니다.
        const parsed = savedData;

        // 저장 데이터 형식(레거시/신버전)을 확인해 복원합니다.
        // 형식을 먼저 판별해두면 이후 코드가 단순해지고 예외 케이스가 줄어듭니다.
        if (Array.isArray(parsed) || (parsed.type === "FeatureCollection")) {
            console.log("Legacy data detected. Migrating...");
            await migrateLegacyData(parsed);
        } else if (parsed.version === "2.0") {
            AppState.projects = parsed.projects || [];
            AppState.currentProjectId = parsed.currentProjectId;

            // 비정상 데이터(프로젝트 없음)라면 기본 프로젝트를 다시 만듭니다.
            if (AppState.projects.length === 0) {
                initDefaultProject();
            } else {
                // 앱 시작 시에는 마지막으로 열었던 프로젝트 대신 기본 프로젝트를 우선 선택합니다.
                const defaultProject = AppState.projects.find(p => p.name === "기본 프로젝트");
                if (defaultProject) {
                    AppState.currentProjectId = defaultProject.id;
                } else if (!AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId))) {
                    // 현재 ID가 유효하지 않으면 첫 프로젝트를 기본 선택으로 설정합니다.
                    AppState.currentProjectId = AppState.projects[0].id;
                }
                renderProjectSelector();
                loadCurrentProjectFeatures();
            }
        } else {
            // 알 수 없는 포맷이면 안전하게 초기화합니다.
            initDefaultProject();
        }
    } catch (e) {
        console.error("Load failed:", e);
        initDefaultProject();
    }
}

/**
 * 앱 최초 실행 상태에서 사용할 기본 프로젝트를 생성합니다.
 * 동작 원리: 최소 1개의 프로젝트가 항상 존재하도록 보장해
 * 이후 로직(선택, 렌더링, 저장)이 null 체크 없이 동작하게 만듭니다.
 */
function initDefaultProject() {
    const defaultProject = {
        // Date.now()를 간단한 유니크 ID로 사용합니다(충분히 낮은 충돌 확률).
        id: Date.now(),
        name: "기본 프로젝트",
        features: { type: "FeatureCollection", features: [] },
        recordGroups: [],
        createdAt: new Date().toISOString()
    };
    AppState.projects = [defaultProject];
    AppState.currentProjectId = defaultProject.id;

    saveToStorage();
    renderProjectSelector();
}

/**
 * 레거시 형식(배열 또는 FeatureCollection)을 현재 프로젝트 구조로 변환합니다.
 * 동작 원리: "형식 통일 -> 상태 반영 -> 화면 복원 -> 저장" 순서로 진행합니다.
 */
async function migrateLegacyData(legacyData) {
    // 배열 형식이라면 FeatureCollection으로 감싸 표준 구조로 통일합니다.
    let featureCollection = legacyData;
    if (Array.isArray(legacyData)) {
        featureCollection = { type: "FeatureCollection", features: legacyData };
    }
    const migratedProject = {
        id: Date.now(),
        name: "기본 프로젝트",
        features: featureCollection,
        recordGroups: cloneRecordGroups(featureCollection.recordGroups),
        createdAt: new Date().toISOString()
    };
    AppState.projects = [migratedProject];
    AppState.currentProjectId = migratedProject.id;

    renderProjectSelector();
    // 복원 후 저장 순서를 지켜야 다음 실행 시에도 동일한 구조를 유지할 수 있습니다.
    // (저장을 먼저 하면 화면 상태와 저장 상태가 어긋날 수 있음)
    loadCurrentProjectFeatures();
    await saveToStorage();

}

/**
 * 현재 선택된 프로젝트의 레이어를 지도에 다시 표시합니다.
 * 동작 원리: "초기화 후 재구성" 방식으로 중복 렌더링을 방지합니다.
 */
export function loadCurrentProjectFeatures() {
    // 기존 지도 레이어를 먼저 비워야, 프로젝트 전환 시 이전 프로젝트 도형이 남지 않습니다.
    drawnItems.clearLayers();

    const project = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    if (project && project.features) {
        restoreFeatures(project.features);
    }

    // 레이어 리스트 UI를 현재 지도 상태와 동기화합니다.
    renderSurveyList();
}

/**
 * 현재 지도에 표시된(현재 프로젝트) 레이어 전체가 보이도록 뷰를 맞춥니다.
 * 동작 원리: 레이어 그룹의 bounds를 계산해 map.fitBounds로 카메라를 자동 이동합니다.
 * @returns {boolean} 이동 성공 여부
 */
export function fitCurrentProjectToMap() {
    const layers = drawnItems.getLayers();
    if (!layers || layers.length === 0) return false;

    const bounds = drawnItems.getBounds();
    if (!bounds || !bounds.isValid()) return false;

    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 19 });
    return true;
}

/**
 * SHP/DBF 불러오기 시 잘릴 수 있는 속성명(최대 10자)을 표준 키로 보정합니다.
 * 동작 원리:
 * - DBF 필드 길이 제한으로 `customColor -> customcolo`처럼 잘린 키를 원래 키로 매핑합니다.
 * - 타입(숫자/불리언)으로 쓰이는 값은 후속 렌더링 충돌을 막기 위해 한 번 더 정규화합니다.
 */
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

/**
 * GeoJSON을 Leaflet 레이어로 복원해 현재 프로젝트 레이어 그룹(drawnItems)에 추가합니다.
 * 동작 원리: L.geoJSON의 콜백(pointToLayer/style/onEachFeature)으로
 * 지오메트리 타입별 생성 규칙, 스타일 규칙, 속성 후처리를 분리합니다.
 */
export function restoreFeatures(geoJsonData) {
    const orderedGeoJsonData = getGeoJsonDataInDisplayOrder(geoJsonData);

    L.geoJSON(orderedGeoJsonData, {
        pointToLayer: function (feature, latlng) {
            // Point는 pointToLayer 콜백이 호출될 때마다 개별 마커로 생성됩니다.
            // 이때 색상/이모지/크기를 아이콘 옵션에 주입해 시각 상태를 복원합니다.
            normalizeImportedFeatureProperties(feature);
            const props = feature.properties || (feature.properties = {});
            if (!props.customColor) props.customColor = getRandomColor();

            const color = props.customColor;
            const emoji = props.customEmoji || null;
            const size = props.customMarkerSize || 3;
            const marker = L.marker(latlng, { icon: createColoredMarkerIcon(color, emoji, size) });
            return marker;
        },
        style: function (feature) {
            normalizeImportedFeatureProperties(feature);
            // style 콜백은 Point를 제외한 지오메트리에 적용됩니다.
            // 반환한 styleObj가 Leaflet path 옵션으로 적용됩니다.
            if (feature.geometry.type !== 'Point') {
                const color = feature.properties.customColor || getRandomColor();
                const strokeColor = feature.properties.customStrokeColor || color;
                const fillColor = feature.properties.customFillColor || color;
                const weight = Number.isFinite(Number(feature.properties.customWeight))
                    ? Math.min(5, Math.max(1, parseInt(feature.properties.customWeight, 10)))
                    : 3;
                const styleObj = { color: strokeColor, fillColor: fillColor, weight: weight };
                styleObj.lineCap = 'round';
                styleObj.lineJoin = 'round';
                if (feature.geometry.type === 'Polygon') {
                    const fillPattern = normalizeFillPattern(feature.properties.customFillPattern);
                    if (Number.isFinite(Number(feature.properties.customFillOpacity))) {
                        const fillOpacity = Math.min(1, Math.max(0, parseFloat(feature.properties.customFillOpacity)));
                        styleObj.fillOpacity = fillPattern === 'solid' ? fillOpacity : 0;
                    } else if (feature.properties.customFill === false) {
                        styleObj.fillOpacity = 0;
                    } else if (feature.properties.customFill === true) {
                        styleObj.fillOpacity = 0.2;
                    } else {
                        styleObj.fillOpacity = 0;
                    }
                }

                const dashArray = feature.properties.customLineStyle
                    ? getLineStyleDashArray(feature.properties.customLineStyle, weight)
                    : feature.properties.customDashArray;
                if (dashArray === 'none') {
                    styleObj.stroke = false;
                } else if (dashArray) {
                    styleObj.dashArray = dashArray;
                    feature.properties.customDashArray = dashArray;
                }

                return styleObj;
            }
        },
        onEachFeature: function (feature, layer) {
            normalizeImportedFeatureProperties(feature);
            // onEachFeature는 레이어 생성 직후 1회 호출되며, 속성 연결/후처리를 수행합니다.
            if (feature.properties) {
                // 필수 속성(id, customColor)이 없으면 기본값을 채웁니다.
                if (!feature.properties.id) feature.properties.id = Date.now() + Math.floor(Math.random() * 1000);
                if (!feature.properties.customColor) {
                    if (layer.options.icon) {
                        // 마커는 pointToLayer에서 이미 customColor를 보정합니다.
                        feature.properties.customColor = feature.properties.customColor || '#FF0000';
                    } else {
                        feature.properties.customColor = layer.options.color || getRandomColor();
                    }
                }

                layer.feature = feature;
                updateLayerInfo(layer);
            }
            drawnItems.addLayer(layer);
        }
    });

    // 레이어 복원 완료 후 목록 UI를 다시 렌더링해 "지도 상태 = 목록 상태"를 맞춥니다.
    renderSurveyList();
}

function getGeoJsonDataInDisplayOrder(geoJsonData) {
    if (!geoJsonData || !Array.isArray(geoJsonData.features)) return geoJsonData;

    return {
        ...geoJsonData,
        features: [...geoJsonData.features].sort((a, b) => {
            const orderA = Number(a.properties?.displayOrder);
            const orderB = Number(b.properties?.displayOrder);
            const hasOrderA = Number.isFinite(orderA);
            const hasOrderB = Number.isFinite(orderB);

            if (hasOrderA && hasOrderB && orderA !== orderB) return orderA - orderB;
            if (hasOrderA !== hasOrderB) return hasOrderA ? -1 : 1;

            return (a.properties?.id || 0) - (b.properties?.id || 0);
        })
    };
}

/* ==========================================================================
   2) 파일 가져오기용 포맷 변환
   ========================================================================== */
/**
 * GPX(XML 문자열)를 GeoJSON FeatureCollection으로 변환합니다.
 * 동작 원리: XML 노드를 읽어 좌표 배열을 만들고, GeoJSON Feature 객체로 재조립합니다.
 */


/* ==========================================================================
   4) 파일 가져오기
   ========================================================================== */
/**
 * shpjs 파싱 결과를 FeatureCollection으로 정규화합니다.
 * 동작 원리:
 * - 단일 FeatureCollection은 그대로 사용합니다.
 * - 배열/객체(레이어 맵) 형태는 FeatureCollection들만 추려 하나로 병합합니다.
 */


/* ==========================================================================
   5) 데이터 초기화/기록 생성/주소 조회
   ========================================================================== */
/**
 * 모든 프로젝트와 기록을 삭제하고 기본 프로젝트 1개만 남기도록 초기화합니다.
 * 동작 원리: 빈 상태 대신 기본 프로젝트를 즉시 재생성해 앱의 최소 동작 조건을 유지합니다.
 */
export async function clearAllData() {
    if (!await showAppConfirm("모든 프로젝트와 기록이 삭제되고, 앱이 최초 상태로 초기화됩니다.\n이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?", { title: '전체 초기화' })) return;

    drawnItems.clearLayers();

    const defaultProject = {
        id: Date.now(),
        name: "기본 프로젝트",
        features: { type: "FeatureCollection", features: [] },
        recordGroups: [],
        createdAt: new Date().toISOString()
    };

    AppState.projects = [defaultProject];
    AppState.currentProjectId = defaultProject.id;

    saveToStorage();
    renderProjectSelector();
    renderSurveyList();
}

/**
 * 현재 좌표를 빨간 마커 기록으로 저장합니다.
 * 동작 원리: 좌표 -> Leaflet 마커 -> feature 메타 부여 -> 저장/렌더링 순서로 처리합니다.
 */
export function saveCurrentPoint(lat, lng, addressName) {
    const shortName = getShortAddress(addressName);
    const marker = L.marker([lat, lng], { icon: createColoredMarkerIcon('#FF0000') });
    marker.feature = { type: "Feature", properties: setRecordName({ id: Date.now(), customColor: '#FF0000', isHidden: false }, shortName || "지점 기록") };
    updateLayerInfo(marker);
    drawnItems.addLayer(marker);
    saveToStorage();
    renderSurveyList();
    alert(`지점이 기록되었습니다.\n(${shortName})`);
    openSidebar();
    switchSidebarTab('record');
}

/**
 * 현재 선택된 경계 레이어를 기록으로 저장합니다.
 * 동작 원리: 멀티 지오메트리를 flatten으로 단일 feature들로 나눈 뒤
 * 각 feature를 레이어로 다시 생성해 공통 저장 규칙을 적용합니다.
 */
export function saveCurrentBoundary(addressName) {
    if (!AppState.currentBoundaryLayer) { alert("영역이 선택되지 않았습니다."); return; }
    let shortName = getShortAddress(addressName);
    let addedCount = 0;

    AppState.currentBoundaryLayer.eachLayer(function (layer) {
        const feature = layer.feature;
        const flattened = turf.flatten(feature);

        flattened.features.forEach(function (singleFeature) {
            const uniqueId = Date.now() + addedCount;
            addedCount++;

            const newLayer = L.geoJSON(singleFeature, {
                style: { color: '#FF0000', weight: 3, opacity: 0.8, fillColor: '#FF0000', fillOpacity: 0 }
            });

            newLayer.eachLayer(function (innerLayer) {
                innerLayer.feature = innerLayer.feature || {};
                innerLayer.feature.properties = {
                    id: uniqueId,
                    name: shortName || "지적 영역",
                    memo: shortName || "지적 영역",
                    customColor: '#FF0000',
                    customWeight: 3,
                    customFillPattern: 'none',
                    customFillOpacity: 0,
                    isHidden: false
                };
                updateLayerInfo(innerLayer);
                drawnItems.addLayer(innerLayer);
            });
        });
    });

    saveToStorage();
    renderSurveyList();

    if (AppState.currentBoundaryLayer) {
        map.removeLayer(AppState.currentBoundaryLayer);
        AppState.currentBoundaryLayer = null;
    }

    alert(`영역이 기록되었습니다.\n(${shortName})`);
    openSidebar();
    switchSidebarTab('record');
}

// 주소 조회 API 연속 호출을 줄이기 위한 마지막 호출 시각(2초 간격 제한, 간단한 throttle)
let lastAddressCall = 0;
/**
 * 좌표(lat, lng)를 브이월드 JSONP API로 조회해 화면의 주소 표시 영역을 업데이트합니다.
 * 동작 원리: JSONP 방식으로 script 태그를 동적 삽입하고, 콜백 함수에서 결과를 수신합니다.
 */
export function getAddressFromCoords(lat, lng) {
    const now = Date.now();
    if (now - lastAddressCall < 2000) return;
    lastAddressCall = now;

    // JSONP는 전역 함수명이 필요하므로 요청마다 고유 콜백 이름을 만듭니다.
    const callbackName = 'vworld_callback_' + Math.floor(Math.random() * 100000);
    window[callbackName] = function (data) {
        const el = document.getElementById('address-display');
        if (el) el.innerText = (data.response.status === "OK") ? data.response.result[0].text : "주소 정보 없음";
        // 메모리 누수/이름 충돌 방지를 위해 콜백과 script 태그를 정리합니다.
        delete window[callbackName];
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) scriptEl.remove();
    };
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lng},${lat}&format=jsonp&type=BOTH&zipcode=false&simple=false&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}
