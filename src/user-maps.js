/* ==========================================================================
   [모듈] 사용자지도 관리 조립부 (user-maps.js)
   [역할]
   - 사용자가 추가한 SHP/GeoJSON/XYZ/WMS/PMTiles/MBTiles 지도의 목록과 상태를 관리합니다.
   - 사용자지도 하위 모듈을 연결해 추가, 삭제, 정렬, 표시, 스타일 변경 흐름을 제공합니다.
   [참고]
   - 사용자지도 기능의 시작점이며, 실제 파서/레이어 생성은 user-maps/ 하위 파일에 나뉘어 있습니다.
   ========================================================================== */
import localforage from 'localforage';
import { map } from './map.js';
import { SVG_ICONS } from './config.js';
import { openStyleModalForExternalLayer } from './ui-core.js';
import { createMarkerShapeSvg, normalizeMarkerStyle } from './utils.js';
import { showAppConfirm } from './app-dialog.js';
import { DEFAULT_VECTOR_STYLE, USER_MAP_DATA_STORE } from './user-maps/constants.js';
import { loadUserMapsFromStorage as loadStoredUserMaps, saveUserMapsToStorage as saveStoredUserMaps } from './user-maps/storage.js';
import { escapeHtml, escapeJsString, inferUserMapType, isTileUserMapType, normalizeUrl } from './user-maps/utils.js';
import { ensureGeojsonSpatialMetadata } from './user-maps/spatial-utils.js';
import { showUserMapModal as showUserMapModalBase } from './user-maps/modal.js';
import { renderUserMapListView } from './user-maps/render-list.js';
import { createLineLegendSvg, createPolygonLegendSvg } from './user-maps/legend-svg.js';
import { analyzeGeojsonGeometryType, getGeojsonPropertySummary, parseLocalShpFile } from './user-maps/shp-parser.js';
import { showUserMapActionModal } from './user-maps/action-modal.js';
import { applyUserMapLayerZIndex, ensureUserMapPane } from './user-maps/layer-pane.js';
import { createUserMapLayerRuntime } from './user-maps/layer-runtime.js';
import {
    addUserMapFromFileAction,
    addUserMapFromUrlAction,
    applyUserMapCategoryStyleAction,
    applyUserMapStyleAction,
    deleteUserMapAction,
    editUserMapAction,
    fitUserMapToBoundsAction,
    moveUserMapLayerAction,
    refreshActiveUserMapLayerAction
} from './user-maps/actions.js';
import {
    getCategorySelectionState,
    getCategoryValueLabel,
    getDefaultCategoryStyle,
    getUserMapGeometryType,
    getUserMapListMetaText,
    getUserMapStyle,
    getVisibleCategoryValues,
    normalizeUserMapStyle,
    setAllCategoryValuesVisible
} from './user-maps/style-state.js';

let userMaps = [];
const activeUserLayers = new Map();
const mbtilesDbCache = new Map();
const migratingUserMapLayers = new Set();
const userMapLayerRuntime = createUserMapLayerRuntime({
    activeUserLayers,
    mbtilesDbCache,
    getUserMaps: () => userMaps,
    setUserMaps: nextUserMaps => { userMaps = nextUserMaps; },
    saveUserMapsToStorage,
    renderUserMapList,
    reorderUserMapLayers,
    getUserMapDataStore
});

function loadUserMapsFromStorage() {
    userMaps = loadStoredUserMaps();
}

function saveUserMapsToStorage() {
    saveStoredUserMaps(userMaps);
}

function createUnsupportedStyleButton() {
    return `
        <button type="button" class="style-setting-btn"
            title="이 지도 형식은 스타일 설정을 지원하지 않습니다."
            onclick="event.stopPropagation()"
            style="width:28px; height:28px; border:1px solid #ddd; border-radius:0; background:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:default; box-sizing:border-box; padding:0;">
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" style="display:block; fill:#9ca3af;">
                <path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/>
            </svg>
        </button>
    `;
}

function createTileOpacityButton(item) {
    return `
        <button type="button" class="style-setting-btn"
            title="투명도 설정"
            onclick="openUserMapTileOpacitySettings('${escapeJsString(item.id)}', event)"
            style="width:28px; height:28px; border:1px solid #ddd; border-radius:0; background:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; box-sizing:border-box; padding:0; color:#9ca3af;">
            <svg viewBox="3 3 18 18" width="27" height="27" aria-hidden="true" style="display:block; fill:currentColor;">
                <path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/>
            </svg>
        </button>
    `;
}

function createLayerGroupIconButton() {
    return `
        <span class="style-setting-btn"
            title="하위 레이어 묶음"
            style="width:28px; height:28px; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-sizing:border-box; padding:0; color:#9ca3af;">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" style="display:block; fill:#9ca3af;">
                <path d="M7 4h13v10H7V4zm-3 3h2v8h11v2H4V7zm-3 3h2v8h11v2H1V10z"/>
            </svg>
        </span>
    `;
}

function createShpStyleButton(item, style, onclick) {
    const escapedOnclick = onclick || `openUserMapStyleSettings('${item.id}', event)`;
    const normalizedStyle = normalizeUserMapStyle(style || item.style || {});
    const geometryType = getUserMapGeometryType(item);

    if (geometryType === 'marker') {
        const customEmoji = normalizedStyle.customEmoji || '';
        const markerColor = escapeHtml(normalizedStyle.customColor || normalizedStyle.color || DEFAULT_VECTOR_STYLE.color);
        const content = createMarkerShapeSvg(markerColor, normalizeMarkerStyle(customEmoji), 24);
        return `
            <button type="button" class="style-setting-btn"
                title="스타일 설정"
                onclick="${escapedOnclick}"
                style="width:28px; height:28px; border:none; background:transparent; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; box-sizing:border-box; padding:0;">
                ${content}
            </button>
        `;
    }

    const content = geometryType === 'line'
        ? createLineLegendSvg(normalizedStyle)
        : createPolygonLegendSvg(normalizedStyle);
    return `
        <button type="button" class="style-setting-btn"
            title="스타일 설정"
            onclick="${escapedOnclick}"
            style="width:28px; height:28px; border:1px solid #ddd; border-radius:0; background:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; box-sizing:border-box; padding:1px; overflow:hidden;">
            ${content}
        </button>
    `;
}

function createUserMapStyleButton(item) {
    if (item.type === 'shp' && item.styleMode === 'categorized') return createLayerGroupIconButton();
    if (isTileUserMapType(item.type)) return createTileOpacityButton(item);
    if (item.type !== 'shp') return createUnsupportedStyleButton();
    return createShpStyleButton(item, getUserMapStyle(item));
}

function getUserMapDataStore() {
    return localforage.createInstance({
        name: USER_MAP_DATA_STORE,
        storeName: 'layers'
    });
}

function showUserMapModal(existing = null) {
    return showUserMapModalBase(existing, {
        parseLocalShpFile,
        getUserMapDataStore,
        analyzeGeojsonGeometryType
    });
}

export function reorderUserMapLayers() {
    userMaps.forEach((item, index) => {
        const paneName = ensureUserMapPane(item.id, index);
        const layer = activeUserLayers.get(item.id);
        if (layer && map.hasLayer(layer)) {
            if (layer.options?.pane !== paneName && !migratingUserMapLayers.has(item.id)) {
                migrateActiveUserMapLayerToPane(item);
                return;
            }
            applyUserMapLayerZIndex(layer, index);
            layer.bringToFront();
        }
    });
    if (typeof window !== 'undefined' && typeof window.bringRecordLayersToFront === 'function') {
        window.bringRecordLayersToFront();
    }
}

async function migrateActiveUserMapLayerToPane(item) {
    migratingUserMapLayers.add(item.id);
    try {
        const oldLayer = activeUserLayers.get(item.id);
        if (oldLayer && map.hasLayer(oldLayer)) map.removeLayer(oldLayer);
        activeUserLayers.delete(item.id);

        const nextLayer = await createLayerForUserMap(item);
        activeUserLayers.set(item.id, nextLayer);
        map.addLayer(nextLayer);
        const index = Math.max(0, userMaps.findIndex(mapItem => mapItem.id === item.id));
        applyUserMapLayerZIndex(nextLayer, index);
        nextLayer.bringToFront();
    } catch (error) {
        console.error(error);
    } finally {
        migratingUserMapLayers.delete(item.id);
        if (typeof window !== 'undefined' && typeof window.bringRecordLayersToFront === 'function') {
            window.bringRecordLayersToFront();
        }
    }
}

function moveUserMapItem(id, targetIndex) {
    const currentIndex = userMaps.findIndex(item => item.id === id);
    if (currentIndex < 0) return;

    const boundedIndex = Math.max(0, Math.min(userMaps.length - 1, targetIndex));
    if (currentIndex === boundedIndex) return;

    const [item] = userMaps.splice(currentIndex, 1);
    userMaps.splice(boundedIndex, 0, item);
    saveUserMapsToStorage();
    reorderUserMapLayers();
    renderUserMapList();
}

function closeUserMapCategoryModal() {
    const overlay = document.getElementById('user-map-category-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 160);
}

async function openUserMapCategoryModal(id) {
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item || item.type !== 'shp') return;

    const geojson = await getUserMapDataStore().getItem(item.geojsonKey);
    if (!geojson) {
        alert('저장된 SHP 데이터를 찾을 수 없습니다. 지도를 다시 불러오세요.');
        return;
    }

    const summary = getGeojsonPropertySummary(geojson);
    if (summary.length === 0) {
        alert('분류할 속성값이 없습니다.');
        return;
    }

    closeUserMapCategoryModal();

    const overlay = document.createElement('div');
    overlay.id = 'user-map-category-modal-overlay';
    overlay.className = 'nav-modal-overlay visible';
    overlay.style.zIndex = '10035';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    overlay.innerHTML = `
        <div onclick="event.stopPropagation()" style="width:min(460px, calc(100vw - 32px)); max-height:calc(100vh - 56px); overflow:auto; background:#fff; border-radius:12px; padding:18px; box-sizing:border-box;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px;">
                <div>
                    <div style="font-size:17px; font-weight:800; color:#111827;">속성 분류</div>
                    <div style="font-size:12px; color:#6b7280; margin-top:3px; max-width:330px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.name)}</div>
                </div>
                <button type="button" id="user-map-category-close" style="width:34px; height:34px; border:0; background:#f3f4f6; border-radius:50%; color:#6b7280; font-size:20px; line-height:1;">&times;</button>
            </div>
            <div style="font-size:12px; color:#6b7280; line-height:1.45; margin-bottom:12px;">분류 기준으로 사용할 속성을 선택하세요. 선택 후 사용자 지도 목록에서 값별 스타일을 설정할 수 있습니다.</div>
            <div id="user-map-category-field-list">
                ${summary.map(({ field, values }) => {
        const preview = values.slice(0, 8).map(({ value, count }) => `${escapeHtml(getCategoryValueLabel(value))} (${count})`).join(', ');
        const extra = values.length > 8 ? ` 외 ${values.length - 8}개` : '';
        return `
                        <button type="button" class="user-map-category-field-btn" data-field="${escapeHtml(field)}"
                            style="width:100%; border:1px solid #e5e7eb; border-radius:8px; background:#fff; padding:10px 12px; margin-bottom:8px; text-align:left; cursor:pointer; box-sizing:border-box;">
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                                <span style="font-size:13px; font-weight:800; color:#111827; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(field)}</span>
                                <span style="font-size:11px; color:#2563eb; flex-shrink:0;">${values.length}개 값</span>
                            </div>
                            <div style="font-size:11px; color:#6b7280; line-height:1.45; margin-top:5px;">${preview}${extra}</div>
                        </button>
                    `;
    }).join('')}
            </div>
        </div>
    `;

    overlay.onclick = closeUserMapCategoryModal;
    overlay.querySelector('#user-map-category-close').onclick = closeUserMapCategoryModal;
    overlay.querySelectorAll('.user-map-category-field-btn').forEach(button => {
        button.onclick = async () => {
            const fieldName = button.dataset.field;
            const fieldSummary = summary.find(entry => entry.field === fieldName);
            const valueCount = fieldSummary?.values?.length || 0;
            if (!await showAppConfirm(`${fieldName} 속성의 ${valueCount}개 값으로 지도를 분류하시겠습니까?`, { title: '속성 분류' })) return;
            applyUserMapCategorizedField(id, fieldName, summary);
            closeUserMapCategoryModal();
        };
    });
    document.body.appendChild(overlay);
}

async function applyUserMapCategorizedField(id, fieldName, summary = null) {
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item || item.type !== 'shp') return;

    let fieldSummary = summary?.find(entry => entry.field === fieldName);
    if (!fieldSummary) {
        const geojson = await getUserMapDataStore().getItem(item.geojsonKey);
        fieldSummary = getGeojsonPropertySummary(geojson).find(entry => entry.field === fieldName);
    }
    if (!fieldSummary) return;

    item.styleMode = 'categorized';
    item.categoryField = fieldName;
    item.categoryValues = fieldSummary.values.map(entry => entry.value);
    item.categoryStyles = item.categoryStyles || {};
    item.defaultCategoryStyle = item.defaultCategoryStyle || getUserMapStyle(item);
    item.categoryVisibleValues = [...item.categoryValues];
    item.categoryValues.forEach((value, index) => {
        if (!item.categoryStyles[value]) {
            item.categoryStyles[value] = getDefaultCategoryStyle(item, index);
        }
    });

    saveUserMapsToStorage();
    await refreshActiveUserMapLayer(id);
    renderUserMapList();
}

async function clearUserMapCategorization(id) {
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item) return;
    delete item.styleMode;
    delete item.categoryField;
    delete item.categoryValues;
    delete item.categoryStyles;
    delete item.defaultCategoryStyle;
    delete item.categoryVisibleValues;
    saveUserMapsToStorage();
    await refreshActiveUserMapLayer(id);
    renderUserMapList();
}

export function toggleUserMapCategoryRows(id, event = null) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const itemEl = document.querySelector(`#user-map-list [data-user-map-id="${CSS.escape(id)}"]`);
    const rows = itemEl?.querySelector('.user-map-category-rows');
    const button = itemEl?.querySelector('.map-layer-toggle');
    if (!rows || !button) return;

    const visible = rows.style.display !== 'none';
    rows.style.display = visible ? 'none' : 'block';
    button.classList.toggle('expanded', !visible);
    button.setAttribute('aria-label', visible ? '하위 메뉴 펼치기' : '하위 메뉴 접기');
}

function createLayerForUserMap(item) {
    return userMapLayerRuntime.createLayerForUserMap(item);
}

export function removeActiveUserBaseMap() {
    userMapLayerRuntime.removeActiveUserBaseMap();
}

export function hasActiveUserBaseMap() {
    return userMapLayerRuntime.hasActiveUserBaseMap();
}

export function getUserMapSnapLayers() {
    return userMapLayerRuntime.getUserMapSnapLayers();
}

async function activateUserMapLayer(item) {
    await userMapLayerRuntime.activateUserMapLayer(item);
}

function deactivateUserMapLayer(item) {
    userMapLayerRuntime.deactivateUserMapLayer(item);
}

function initUserMapZoomVisibilitySync() {
    userMapLayerRuntime.initUserMapZoomVisibilitySync();
}

export async function toggleUserMapLayer(id, isChecked) {
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item) return;

    if (!isChecked) {
        setAllCategoryValuesVisible(item, false);
        deactivateUserMapLayer(item);
        saveUserMapsToStorage();
        renderUserMapList();
        return;
    }

    try {
        setAllCategoryValuesVisible(item, true);
        await activateUserMapLayer(item);
        saveUserMapsToStorage();
        renderUserMapList();
    } catch (error) {
        console.error(error);
        alert(`사용자 지도를 불러오지 못했습니다.\n${error.message || error}`);
        setAllCategoryValuesVisible(item, false);
        item.enabled = false;
        saveUserMapsToStorage();
        renderUserMapList();
    }
}

export function selectUserMap(id, event = null) {
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item) return;
    showUserMapActionModal(item, event, {
        moveLayer: moveUserMapLayer,
        edit: editUserMap,
        fit: fitUserMapToBounds,
        clearCategorization: clearUserMapCategorization,
        openCategoryModal: openUserMapCategoryModal,
        delete: deleteUserMap
    });
}

export function openUserMapStyleSettings(id, event = null) {
    if (event) event.stopPropagation();
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item) return;
    if (item.type !== 'shp') return;

    openStyleModalForExternalLayer({
        id,
        type: getUserMapGeometryType(item),
        style: getUserMapStyle(item),
        onApply: (style) => applyUserMapStyle(id, style)
    });
}

export function openUserMapCategoryStyleSettings(id, value, event = null) {
    if (event) event.stopPropagation();
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item || item.type !== 'shp' || item.styleMode !== 'categorized') return;

    const categoryStyle = item.categoryStyles?.[value] || getDefaultCategoryStyle(item, 0);
    openStyleModalForExternalLayer({
        id: `${id}:${value}`,
        type: getUserMapGeometryType(item),
        style: categoryStyle,
        onApply: (style) => applyUserMapCategoryStyle(id, value, style)
    });
}

export async function toggleUserMapCategoryValue(id, value, isChecked, event = null) {
    if (event) event.stopPropagation();
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item || item.type !== 'shp' || item.styleMode !== 'categorized') return;

    const visibleValues = getVisibleCategoryValues(item);
    if (isChecked) {
        if (!visibleValues.includes(value)) visibleValues.push(value);
    } else {
        item.categoryVisibleValues = visibleValues.filter(categoryValue => categoryValue !== value);
    }

    const nextVisibleValues = getVisibleCategoryValues(item);
    if (nextVisibleValues.length === 0) {
        deactivateUserMapLayer(item);
        saveUserMapsToStorage();
        renderUserMapList();
        return;
    }

    item.enabled = true;
    saveUserMapsToStorage();
    if (activeUserLayers.has(id)) {
        await refreshActiveUserMapLayer(id);
    } else {
        try {
            await activateUserMapLayer(item);
        } catch (error) {
            console.error(error);
            alert(`사용자 지도를 불러오지 못했습니다.\n${error.message || error}`);
            item.enabled = false;
            saveUserMapsToStorage();
        }
    }
    renderUserMapList();
}

async function applyUserMapStyle(id, style) {
    await applyUserMapStyleAction(id, style, {
        getUserMaps: () => userMaps,
        saveUserMapsToStorage,
        refreshActiveUserMapLayer,
        renderUserMapList
    });
}

async function applyUserMapCategoryStyle(id, value, style) {
    await applyUserMapCategoryStyleAction(id, value, style, {
        getUserMaps: () => userMaps,
        saveUserMapsToStorage,
        refreshActiveUserMapLayer,
        renderUserMapList
    });
}

async function refreshActiveUserMapLayer(id) {
    await refreshActiveUserMapLayerAction(id, {
        activeUserLayers,
        activateUserMapLayer,
        getUserMaps: () => userMaps
    });
}

export async function fitUserMapToBounds(id, event = null) {
    return fitUserMapToBoundsAction(id, event, {
        activeUserLayers,
        getUserMaps: () => userMaps,
        toggleUserMapLayer
    });
}

export function moveUserMapLayer(id, direction) {
    moveUserMapLayerAction(id, direction, {
        getUserMaps: () => userMaps,
        moveUserMapItem
    });
}

export async function addUserMapFromUrl() {
    await addUserMapFromUrlAction({
        showUserMapModal,
        addUserMap: item => userMaps.push(item),
        saveUserMapsToStorage,
        renderUserMapList
    });
}

export async function addUserMapFromFile(file) {
    return addUserMapFromFileAction(file, {
        getUserMapDataStore,
        addUserMap: item => userMaps.push(item),
        saveUserMapsToStorage,
        renderUserMapList
    });
}

export async function editUserMap(id) {
    await editUserMapAction(id, {
        getUserMaps: () => userMaps,
        setUserMapAt: (index, item) => { userMaps[index] = item; },
        showUserMapModal,
        activeUserLayers,
        deactivateUserMapLayer,
        activateUserMapLayer,
        getUserMapDataStore,
        saveUserMapsToStorage,
        renderUserMapList
    });
}

export async function deleteUserMap(id) {
    await deleteUserMapAction(id, {
        getUserMaps: () => userMaps,
        setUserMaps: nextUserMaps => { userMaps = nextUserMaps; },
        showAppConfirm,
        activeUserLayers,
        getUserMapDataStore,
        saveUserMapsToStorage,
        renderUserMapList
    });
}

export function getUserMapTileOpacity(id) {
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item || !isTileUserMapType(item.type)) return 1;
    const value = Number(item.opacity);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

export function getUserMapTileOpacityLabel(id) {
    const item = userMaps.find(mapItem => mapItem.id === id);
    return item?.name || '사용자 지도';
}

export function setUserMapTileOpacity(id, value) {
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item || !isTileUserMapType(item.type)) return 1;
    const opacity = Math.min(1, Math.max(0, Number(value)));
    item.opacity = Number.isFinite(opacity) ? opacity : 1;
    saveUserMapsToStorage();

    const layer = activeUserLayers.get(id);
    if (layer && typeof layer.setOpacity === 'function') {
        layer.setOpacity(item.opacity);
    }
    renderUserMapList();
    return item.opacity;
}

export function renderUserMapList() {
    renderUserMapListView(userMaps, {
        getCategorySelectionState: item => getCategorySelectionState(item, activeUserLayers),
        createUserMapStyleButton,
        getUserMapListMetaText,
        getVisibleCategoryValues: item => (activeUserLayers.has(item?.id) || item?.enabled) ? getVisibleCategoryValues(item) : [],
        getDefaultCategoryStyle,
        createShpStyleButton,
        getCategoryValueLabel
    });
}

async function ensureStoredShpGeometryTypes() {
    let changed = false;
    for (const item of userMaps) {
        if (item.type !== 'shp' || !item.geojsonKey) continue;
        const geojson = await getUserMapDataStore().getItem(item.geojsonKey);
        if (!geojson) continue;
        const spatialMetadataChanged = ensureGeojsonSpatialMetadata(geojson);
        if (spatialMetadataChanged) {
            await getUserMapDataStore().setItem(item.geojsonKey, geojson);
        }
        if (!item.geometryType) {
            item.geometryType = geojson.geometryType || analyzeGeojsonGeometryType(geojson);
            changed = true;
        }
        if (!item.featureCount) {
            item.featureCount = geojson.features?.length || 0;
            changed = true;
        }
        if (!item.dataBounds && geojson.__bbox) {
            item.dataBounds = geojson.__bbox;
            changed = true;
        }
    }
    if (changed) {
        saveUserMapsToStorage();
        renderUserMapList();
    }
}

export function initUserMaps() {
    loadUserMapsFromStorage();
    initUserMapZoomVisibilitySync();
    renderUserMapList();
    ensureStoredShpGeometryTypes();
    userMaps.filter(item => item.enabled).forEach(item => {
        activateUserMapLayer(item).catch(error => {
            console.error(error);
            setAllCategoryValuesVisible(item, false);
            item.enabled = false;
            saveUserMapsToStorage();
            renderUserMapList();
        });
    });
}
