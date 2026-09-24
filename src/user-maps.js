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
import { openStyleModalForExternalLayer } from './ui-style-modal.js';
import { createMarkerShapeSvg, normalizeMarkerStyle } from './utils.js';
import { showAppConfirm, showTextPrompt } from './app-dialog.js';
import { isLatLngHitLayer } from './map-hit-test.js';
import { DEFAULT_VECTOR_STYLE, USER_MAP_DATA_STORE } from './user-maps/constants.js';
import {
    loadUserMapGroupsFromStorage,
    loadUserMapsFromStorage as loadStoredUserMaps,
    saveUserMapGroupsToStorage,
    saveUserMapsToStorage as saveStoredUserMaps
} from './user-maps/storage.js';
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
let userMapGroups = [];
let currentUserMapGroupMenuId = null;
const activeUserLayers = new Map();
const mbtilesDbCache = new Map();
const migratingUserMapLayers = new Set();
const MOVE_FRONT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="18" x2="19" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="9" y1="13" x2="9" y2="5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="6.8,7.7 9,5.5 11.2,7.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="15" y1="13" x2="15" y2="5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="12.8,7.7 15,5.5 17.2,7.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MOVE_FORWARD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="18" x2="19" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="12" y1="13" x2="12" y2="5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="9.8,7.7 12,5.5 14.2,7.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MOVE_BACKWARD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="12" y1="10.5" x2="12" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="9.8,15.8 12,18 14.2,15.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MOVE_BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="9" y1="10.5" x2="9" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="6.8,15.8 9,18 11.2,15.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="15" y1="10.5" x2="15" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="12.8,15.8 15,18 17.2,15.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
    userMapGroups = loadUserMapGroupsFromStorage();
}

function saveUserMapsToStorage() {
    saveStoredUserMaps(userMaps);
}

function saveUserMapGroupsToStorageLocal() {
    saveUserMapGroupsToStorage(userMapGroups);
}

function makeUserMapGroupId() {
    return `user-map-group-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function getDefaultUserMapGroupName() {
    let index = 1;
    while (userMapGroups.some(group => group.name === `그룹${index}`)) index++;
    return `그룹${index}`;
}

function getUserMapGroup(groupId) {
    return userMapGroups.find(group => group.id === groupId) || null;
}

function getUserMapsForGroup(groupId) {
    return userMaps.filter(item => item.groupId === groupId);
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
    const geometryType = getUserMapGeometryType(item);
    const normalizedStyle = normalizeUserMapStyle(style || item.style || {}, geometryType);

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

export async function createUserMapGroup() {
    const name = await showTextPrompt('그룹명을 입력하세요:', getDefaultUserMapGroupName());
    if (name === null) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
        alert('그룹명을 입력하세요.');
        return;
    }
    userMapGroups.push({
        id: makeUserMapGroupId(),
        name: trimmedName,
        collapsed: false,
        createdAt: new Date().toISOString()
    });
    saveUserMapGroupsToStorageLocal();
    renderUserMapList();
}

export function openUserMapSectionMenu(event) {
    event?.stopPropagation();
    event?.preventDefault();
    let menu = document.getElementById('user-map-section-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'user-map-section-menu';
        menu.className = 'more-context-menu';
        menu.innerHTML = `
            <div class="more-menu-item" id="user-map-create-group-action">
                ${SVG_ICONS.file_group_add}
                그룹 만들기
            </div>
        `;
        menu.querySelector('#user-map-create-group-action').onclick = () => {
            menu.classList.remove('visible');
            menu.style.display = 'none';
            createUserMapGroup();
        };
        document.body.appendChild(menu);
    }

    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.display = 'flex';
    menu.style.visibility = 'hidden';
    const menuHeight = menu.offsetHeight || 56;
    const top = Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - menuHeight - 18));
    menu.style.top = `${top}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.left = 'auto';
    menu.style.visibility = 'visible';
    requestAnimationFrame(() => menu.classList.add('visible'));
}

function ensureUserMapGroupSelectModal() {
    let overlay = document.getElementById('user-map-group-select-modal-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'user-map-group-select-modal-overlay';
    overlay.className = 'nav-modal-overlay center-modal-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
        <div class="nav-modal-content center-modal-content compact" data-user-map-group-select-content>
            <div class="nav-modal-header" style="font-size:18px; font-weight:bold; margin-bottom:10px; text-align:center;">그룹에 추가</div>
            <div id="user-map-group-select-list" style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px; max-height:240px; overflow-y:auto;"></div>
            <button id="user-map-group-select-cancel" type="button"
                style="width:100%; padding:14px; background:#f5f5f5; border:none; border-radius:12px; font-size:15px; font-weight:bold; color:#666;">취소</button>
        </div>
    `;
    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeUserMapGroupSelectModal();
    });
    overlay.querySelector('[data-user-map-group-select-content]')?.addEventListener('click', event => event.stopPropagation());
    overlay.querySelector('#user-map-group-select-cancel')?.addEventListener('click', closeUserMapGroupSelectModal);
    document.body.appendChild(overlay);
    return overlay;
}

function closeUserMapGroupSelectModal() {
    const overlay = document.getElementById('user-map-group-select-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => {
        if (!overlay.classList.contains('visible')) overlay.style.display = 'none';
    }, 200);
    delete overlay.dataset.userMapId;
}

export function openAddUserMapToGroupModal(id) {
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item) return;
    const overlay = ensureUserMapGroupSelectModal();
    const list = overlay.querySelector('#user-map-group-select-list');
    if (!list) return;
    list.innerHTML = '';

    const createButton = document.createElement('button');
    createButton.type = 'button';
    createButton.className = 'record-group-select-item';
    createButton.innerHTML = `
        <span class="record-group-select-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 12.5h-5v5h-2v-5H6v-2h5v-5h2v5h5v2z"/></svg></span>
        <span class="record-group-select-name">새 그룹 만들기</span>
    `;
    createButton.onclick = () => createUserMapGroupAndAdd(id);
    list.appendChild(createButton);

    userMapGroups.forEach(group => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'record-group-select-item';
        button.innerHTML = `
            <span class="record-group-select-icon">${SVG_ICONS.folder}</span>
            <span class="record-group-select-name">${escapeHtml(group.name || '그룹')}</span>
        `;
        button.onclick = () => addUserMapToGroup(id, group.id);
        list.appendChild(button);
    });

    overlay.dataset.userMapId = String(id);
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('visible'));
}

function addUserMapToGroup(id, groupId) {
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item || !userMapGroups.some(group => group.id === groupId)) return;
    item.groupId = groupId;
    saveUserMapsToStorage();
    closeUserMapGroupSelectModal();
    renderUserMapList();
}

async function createUserMapGroupAndAdd(id) {
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item) return;
    const name = await showTextPrompt('그룹명을 입력하세요:', getDefaultUserMapGroupName());
    if (name === null) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
        alert('그룹명을 입력하세요.');
        return;
    }
    const group = {
        id: makeUserMapGroupId(),
        name: trimmedName,
        collapsed: false,
        createdAt: new Date().toISOString()
    };
    userMapGroups.push(group);
    item.groupId = group.id;
    saveUserMapGroupsToStorageLocal();
    saveUserMapsToStorage();
    closeUserMapGroupSelectModal();
    renderUserMapList();
}

export function removeUserMapFromGroup(id) {
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item?.groupId) return;
    delete item.groupId;
    saveUserMapsToStorage();
    renderUserMapList();
}

export function toggleUserMapGroup(groupId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    const group = userMapGroups.find(item => item.id === groupId);
    if (!group) return;
    group.collapsed = !group.collapsed;
    saveUserMapGroupsToStorageLocal();
    renderUserMapList();
}

export async function toggleUserMapGroupVisibility(groupId, isChecked) {
    const items = userMaps.filter(item => item.groupId === groupId);
    for (const item of items) {
        if (item.enabled !== isChecked) {
            await toggleUserMapLayer(item.id, isChecked);
        }
    }
    renderUserMapList();
}

function ensureUserMapGroupMenu() {
    let menu = document.getElementById('user-map-group-context-menu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'user-map-group-context-menu';
    menu.className = 'more-context-menu';
    menu.innerHTML = `
        <div class="more-menu-item" onclick="handleUserMapGroupMenuAction('edit')">
            ${SVG_ICONS.edit} 수정
        </div>
        <div class="more-menu-item" onclick="handleUserMapGroupMenuAction('ungroup')">
            ${SVG_ICONS.file_group_ungroup}
            그룹 해제
        </div>
        <hr style="width:100%; margin:4px 0; border:none; border-top:1px solid #f0f0f0;">
        <div class="more-menu-item" onclick="handleUserMapGroupMenuAction('front')">
            ${MOVE_FRONT_ICON} 맨앞으로
        </div>
        <div class="more-menu-item" onclick="handleUserMapGroupMenuAction('forward')">
            ${MOVE_FORWARD_ICON} 앞으로
        </div>
        <div class="more-menu-item" onclick="handleUserMapGroupMenuAction('backward')">
            ${MOVE_BACKWARD_ICON} 뒤로
        </div>
        <div class="more-menu-item" onclick="handleUserMapGroupMenuAction('back')">
            ${MOVE_BACK_ICON} 맨뒤로
        </div>
        <hr style="width:100%; margin:4px 0; border:none; border-top:1px solid #f0f0f0;">
        <div class="more-menu-item danger" onclick="handleUserMapGroupMenuAction('delete')">
            ${SVG_ICONS.trash} 삭제
        </div>
    `;
    document.body.appendChild(menu);
    document.addEventListener('click', event => {
        if (!event.target.closest('.btn-more') && !event.target.closest('.more-context-menu')) {
            closeUserMapGroupMenu();
        }
    }, true);
    return menu;
}

function closeUserMapGroupMenu() {
    const menu = document.getElementById('user-map-group-context-menu');
    if (!menu) return;
    menu.classList.remove('visible');
    setTimeout(() => {
        if (!menu.classList.contains('visible')) menu.style.display = 'none';
    }, 100);
    currentUserMapGroupMenuId = null;
}

export function openUserMapGroupMenu(event, groupId) {
    event?.stopPropagation();
    event?.preventDefault();
    const sectionMenu = document.getElementById('user-map-section-menu');
    if (sectionMenu) {
        sectionMenu.classList.remove('visible');
        sectionMenu.style.display = 'none';
    }
    currentUserMapGroupMenuId = groupId;
    const menu = ensureUserMapGroupMenu();
    menu.classList.remove('visible');
    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.display = 'flex';
    menu.style.visibility = 'hidden';
    const menuHeight = menu.offsetHeight || 320;
    const top = Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - menuHeight - 18));
    menu.style.top = `${top}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.left = 'auto';
    menu.style.visibility = 'visible';
    requestAnimationFrame(() => menu.classList.add('visible'));
}

export function handleUserMapGroupMenuAction(action) {
    const groupId = currentUserMapGroupMenuId;
    if (!groupId) return;
    closeUserMapGroupMenu();
    if (action === 'edit') {
        editUserMapGroup(groupId);
    } else if (action === 'ungroup') {
        ungroupUserMapGroup(groupId);
    } else if (action === 'delete') {
        deleteUserMapGroup(groupId);
    } else if (['front', 'forward', 'backward', 'back'].includes(action)) {
        moveUserMapGroupById(groupId, action);
    }
}

async function editUserMapGroup(groupId) {
    const group = getUserMapGroup(groupId);
    if (!group) return;
    const name = await showTextPrompt('그룹명을 입력하세요:', group.name || '그룹');
    if (name === null) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
        alert('그룹명을 입력하세요.');
        return;
    }
    group.name = trimmedName;
    saveUserMapGroupsToStorageLocal();
    renderUserMapList();
}

function ungroupUserMapGroup(groupId) {
    getUserMapsForGroup(groupId).forEach(item => {
        delete item.groupId;
    });
    const groupIndex = userMapGroups.findIndex(group => group.id === groupId);
    if (groupIndex >= 0) userMapGroups.splice(groupIndex, 1);
    saveUserMapsToStorage();
    saveUserMapGroupsToStorageLocal();
    renderUserMapList();
}

async function deleteUserMapGroup(groupId) {
    const group = getUserMapGroup(groupId);
    if (!group) return;
    const groupItems = getUserMapsForGroup(groupId);
    if (!await showAppConfirm(`'${group.name}' 그룹과 그룹 안의 ${groupItems.length}개 지도를 삭제할까요?`, { title: '사용자지도 그룹 삭제' })) return;

    const store = getUserMapDataStore();
    for (const item of groupItems) {
        const activeLayer = activeUserLayers.get(item.id);
        if (activeLayer && map.hasLayer(activeLayer)) map.removeLayer(activeLayer);
        if (activeLayer?.__fFieldShp) {
            activeLayer.clearLayers();
            activeLayer.__allGeojson = null;
        }
        activeUserLayers.delete(item.id);
        if (item.type === 'shp' && item.geojsonKey) {
            await store.removeItem(item.geojsonKey);
        }
    }

    const groupItemIds = new Set(groupItems.map(item => item.id));
    userMaps = userMaps.filter(item => !groupItemIds.has(item.id));
    const groupIndex = userMapGroups.findIndex(item => item.id === groupId);
    if (groupIndex >= 0) userMapGroups.splice(groupIndex, 1);
    saveUserMapsToStorage();
    saveUserMapGroupsToStorageLocal();
    reorderUserMapLayers();
    renderUserMapList();
}

function getUserMapOrderBlocks() {
    const validGroupIds = new Set(userMapGroups.map(group => group.id));
    const groupBlocks = new Map();
    const blocks = [];

    userMaps.forEach(item => {
        if (!item.groupId || !validGroupIds.has(item.groupId)) {
            blocks.push({ type: 'item', id: item.id, items: [item] });
            return;
        }

        let block = groupBlocks.get(item.groupId);
        if (!block) {
            block = { type: 'group', id: item.groupId, items: [] };
            groupBlocks.set(item.groupId, block);
            blocks.push(block);
        }
        block.items.push(item);
    });

    return blocks;
}

function moveUserMapGroupById(groupId, position) {
    const blocks = getUserMapOrderBlocks();
    if (blocks.length < 2) return;

    const currentIndex = blocks.findIndex(block => block.type === 'group' && block.id === groupId);
    if (currentIndex < 0) return;

    let targetIndex = currentIndex;
    if (position === 'front') {
        targetIndex = blocks.length - 1;
    } else if (position === 'forward') {
        targetIndex = Math.min(currentIndex + 1, blocks.length - 1);
    } else if (position === 'back') {
        targetIndex = 0;
    } else if (position === 'backward') {
        targetIndex = Math.max(currentIndex - 1, 0);
    }

    if (targetIndex === currentIndex) return;

    const nextBlocks = [...blocks];
    const [targetBlock] = nextBlocks.splice(currentIndex, 1);
    nextBlocks.splice(targetIndex, 0, targetBlock);
    userMaps = nextBlocks.flatMap(block => block.items);

    const groupIndex = userMapGroups.findIndex(group => group.id === groupId);
    if (groupIndex >= 0) {
        let groupTargetIndex = groupIndex;
        if (position === 'front') {
            groupTargetIndex = userMapGroups.length - 1;
        } else if (position === 'forward') {
            groupTargetIndex = Math.min(groupIndex + 1, userMapGroups.length - 1);
        } else if (position === 'back') {
            groupTargetIndex = 0;
        } else if (position === 'backward') {
            groupTargetIndex = Math.max(groupIndex - 1, 0);
        }
        if (groupTargetIndex !== groupIndex) {
            const [group] = userMapGroups.splice(groupIndex, 1);
            userMapGroups.splice(groupTargetIndex, 0, group);
        }
    }

    saveUserMapsToStorage();
    saveUserMapGroupsToStorageLocal();
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

export function findUserMapFeatureHitsAtLatLng(latlng, options = {}) {
    const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 30;
    const hits = [];

    [...userMaps].slice().reverse().some(item => {
        if (item.type !== 'shp' || (!activeUserLayers.has(item.id) && !item.enabled)) return false;
        const layer = activeUserLayers.get(item.id);
        if (!layer || !map.hasLayer(layer) || typeof layer.eachLayer !== 'function') return false;

        layer.eachLayer(childLayer => {
            if (hits.length >= limit) return;
            if (!childLayer?.feature || !isLatLngHitLayer(childLayer, latlng, options)) return;
            hits.push({
                id: `${item.id}:${hits.length}`,
                item,
                feature: childLayer.feature,
                layer: childLayer
            });
        });

        return hits.length >= limit;
    });

    return hits;
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
        openAddToGroup: openAddUserMapToGroupModal,
        removeFromGroup: removeUserMapFromGroup,
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
        userMapGroups,
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
