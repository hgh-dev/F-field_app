/* ==========================================================================
   [모듈] 사용자지도 추가/수정 액션 (user-maps/actions.js)
   [역할]
   - URL 또는 파일로 사용자지도를 추가하고, 기존 사용자지도 정보를 수정합니다.
   - SHP/GeoJSON 파일 파싱 후 지도 범위 이동과 목록 갱신 흐름을 처리합니다.
   [참고]
   - 사용자지도 추가, 파일 업로드, 편집 저장 흐름이 이상할 때 확인합니다.
   ========================================================================== */
import { map } from '../map.js';
import { DEFAULT_MAX_ZOOM } from './constants.js';
import { analyzeGeojsonGeometryType, parseLocalShpFile } from './shp-parser.js';
import { bboxToLeafletBounds } from './spatial-utils.js';

export async function addUserMapFromUrlAction({
    showUserMapModal,
    addUserMap,
    saveUserMapsToStorage,
    renderUserMapList
}) {
    const item = await showUserMapModal();
    if (!item) return;
    addUserMap(item);
    saveUserMapsToStorage();
    renderUserMapList();
}

export async function addUserMapFromFileAction(file, {
    getUserMapDataStore,
    addUserMap,
    saveUserMapsToStorage,
    renderUserMapList
}) {
    if (!file) return null;

    const id = `user-map-${Date.now()}`;
    const name = file.name.replace(/\.[^.]+$/, '') || '사용자 지도';
    const geojsonKey = `${id}-geojson`;
    const geojson = await parseLocalShpFile(file);
    await getUserMapDataStore().setItem(geojsonKey, geojson);

    const item = {
        id,
        name,
        type: 'shp',
        url: '',
        sourceName: file.name,
        geojsonKey,
        featureCount: geojson.features.length,
        geometryType: geojson.geometryType || analyzeGeojsonGeometryType(geojson),
        dataBounds: geojson.__bbox || null,
        maxZoom: DEFAULT_MAX_ZOOM,
        minZoom: 12,
        maxNativeZoom: 22,
        simplifyLevel: 'off',
        opacity: 1
    };

    addUserMap(item);
    saveUserMapsToStorage();
    renderUserMapList();
    return item;
}

export async function editUserMapAction(id, {
    getUserMaps,
    setUserMapAt,
    showUserMapModal,
    activeUserLayers,
    deactivateUserMapLayer,
    activateUserMapLayer,
    getUserMapDataStore,
    saveUserMapsToStorage,
    renderUserMapList
}) {
    const userMaps = getUserMaps();
    const index = userMaps.findIndex(item => item.id === id);
    if (index < 0) return;
    const updated = await showUserMapModal(userMaps[index]);
    if (!updated) return;

    const wasActive = activeUserLayers.has(id);
    if (wasActive) deactivateUserMapLayer(userMaps[index]);
    if (userMaps[index].type === 'shp' && updated.type !== 'shp' && userMaps[index].geojsonKey) {
        await getUserMapDataStore().removeItem(userMaps[index].geojsonKey);
    }
    setUserMapAt(index, updated);
    saveUserMapsToStorage();
    if (wasActive) await activateUserMapLayer(updated);
    renderUserMapList();
}

export async function deleteUserMapAction(id, {
    getUserMaps,
    setUserMaps,
    showAppConfirm,
    activeUserLayers,
    getUserMapDataStore,
    saveUserMapsToStorage,
    renderUserMapList
}) {
    const userMaps = getUserMaps();
    const item = userMaps.find(mapItem => mapItem.id === id);
    if (!item) return;
    if (!await showAppConfirm(`'${item.name}' 지도를 삭제할까요?`, { title: '사용자 지도 삭제' })) return;
    const activeLayer = activeUserLayers.get(id);
    if (activeLayer && map.hasLayer(activeLayer)) map.removeLayer(activeLayer);
    if (activeLayer?.__fFieldShp) {
        activeLayer.clearLayers();
        activeLayer.__allGeojson = null;
    }
    activeUserLayers.delete(id);
    if (item.type === 'shp' && item.geojsonKey) {
        await getUserMapDataStore().removeItem(item.geojsonKey);
    }
    setUserMaps(userMaps.filter(mapItem => mapItem.id !== id));
    saveUserMapsToStorage();
    renderUserMapList();
}

export async function fitUserMapToBoundsAction(id, event = null, {
    activeUserLayers,
    getUserMaps,
    toggleUserMapLayer
}) {
    if (event) event.stopPropagation();
    const item = getUserMaps().find(mapItem => mapItem.id === id);
    if (!item) return;

    try {
        if (!activeUserLayers.has(id)) {
            await toggleUserMapLayer(id, true);
        }

        const layer = activeUserLayers.get(id);
        const bounds = layer?.getBounds ? layer.getBounds() : null;
        if (bounds?.isValid?.()) {
            map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18 });
            return;
        }

        if (item.type === 'shp' && item.dataBounds) {
            const storedBounds = bboxToLeafletBounds(item.dataBounds);
            if (storedBounds?.isValid?.()) {
                map.fitBounds(storedBounds, { padding: [24, 24], maxZoom: 18 });
                return;
            }
        }

        alert('이 지도 형식은 전체 범위 정보가 없어 한눈에 보기로 이동할 수 없습니다.');
    } catch (error) {
        console.error(error);
        alert(`사용자 지도 범위로 이동하지 못했습니다.\n${error.message || error}`);
    }
}

export function moveUserMapLayerAction(id, direction, {
    getUserMaps,
    moveUserMapItem
}) {
    const userMaps = getUserMaps();
    const index = userMaps.findIndex(item => item.id === id);
    if (index < 0) return;

    if (direction === 'front') {
        moveUserMapItem(id, userMaps.length - 1);
    } else if (direction === 'forward') {
        moveUserMapItem(id, index + 1);
    } else if (direction === 'backward') {
        moveUserMapItem(id, index - 1);
    } else if (direction === 'back') {
        moveUserMapItem(id, 0);
    }
}

export async function refreshActiveUserMapLayerAction(id, {
    activeUserLayers,
    activateUserMapLayer,
    getUserMaps
}) {
    const item = getUserMaps().find(mapItem => mapItem.id === id);
    if (!item) return;
    const activeLayer = activeUserLayers.get(id);
    if (activeLayer) {
        if (map.hasLayer(activeLayer)) map.removeLayer(activeLayer);
        if (activeLayer.__fFieldShp) {
            activeLayer.clearLayers();
            activeLayer.__allGeojson = null;
        }
        activeUserLayers.delete(id);
    }
    if (activeLayer || item.enabled) {
        try {
            await activateUserMapLayer(item);
        } catch (error) {
            console.error(error);
            alert(`사용자 지도 스타일을 적용하지 못했습니다.\n${error.message || error}`);
        }
    }
}

export async function applyUserMapStyleAction(id, style, {
    getUserMaps,
    saveUserMapsToStorage,
    refreshActiveUserMapLayer,
    renderUserMapList
}) {
    const item = getUserMaps().find(mapItem => mapItem.id === id);
    if (!item) return;

    item.style = style;
    saveUserMapsToStorage();
    await refreshActiveUserMapLayer(id);
    renderUserMapList();
}

export async function applyUserMapCategoryStyleAction(id, value, style, {
    getUserMaps,
    saveUserMapsToStorage,
    refreshActiveUserMapLayer,
    renderUserMapList
}) {
    const item = getUserMaps().find(mapItem => mapItem.id === id);
    if (!item) return;
    item.categoryStyles = item.categoryStyles || {};
    item.categoryStyles[value] = style;
    saveUserMapsToStorage();
    await refreshActiveUserMapLayer(id);
    renderUserMapList();
}
