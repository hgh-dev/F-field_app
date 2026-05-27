/* ==========================================================================
   [모듈] 사용자지도 레이어 생성 런타임 (user-maps/layer-runtime.js)
   [역할]
   - 사용자지도 설정을 실제 Leaflet 레이어로 변환하고 지도에 추가/제거합니다.
   - XYZ, WMS, PMTiles, MBTiles, SHP/GeoJSON 등 지도 유형별 생성 흐름을 담당합니다.
   [참고]
   - 사용자지도가 지도에 표시되지 않거나 레이어 유형별 문제가 생기면 확인합니다.
   ========================================================================== */
import { map, updateLayerOrder } from '../map.js';
import { AppState } from '../state.js';
import { DEFAULT_MAX_ZOOM } from './constants.js';
import { parseWmsUrl } from './utils.js';
import { ensureGeojsonSpatialMetadata } from './spatial-utils.js';
import { getPmtilesModule, getSqlJs } from './dependencies.js';
import { MbtilesLayer, getMbtilesMimeType } from './mbtiles-layer.js';
import { analyzeGeojsonGeometryType } from './shp-parser.js';
import { applyUserMapLayerZIndex, ensureUserMapPane, getUserMapLayerZIndex } from './layer-pane.js';
import { createShpViewportLayer, syncShpViewportLayer } from './shp-viewport-layer.js';

export function createUserMapLayerRuntime({
    activeUserLayers,
    mbtilesDbCache,
    getUserMaps,
    setUserMaps,
    saveUserMapsToStorage,
    renderUserMapList,
    reorderUserMapLayers,
    getUserMapDataStore
}) {
    let userMapZoomSyncInitialized = false;
    let userMapViewportSyncQueued = false;
    let userMapViewportSyncDelayTimer = null;

    async function createLayerForUserMap(item) {
        const userMaps = getUserMaps();
        const itemIndex = Math.max(0, userMaps.findIndex(mapItem => mapItem.id === item.id));
        const paneName = ensureUserMapPane(item.id, itemIndex);
        const commonOptions = {
            attribution: item.attribution || item.name,
            minZoom: item.minZoom === '' || item.minZoom === undefined ? 0 : Number(item.minZoom),
            maxZoom: Number(item.maxZoom) || DEFAULT_MAX_ZOOM,
            maxNativeZoom: item.maxNativeZoom === '' || item.maxNativeZoom === undefined ? undefined : Number(item.maxNativeZoom),
            opacity: Number.isFinite(Number(item.opacity)) ? Number(item.opacity) : 1,
            crossOrigin: true,
            pane: paneName,
            zIndex: getUserMapLayerZIndex(itemIndex)
        };

        if (item.type === 'xyz') {
            return L.tileLayer(item.url, commonOptions);
        }

        if (item.type === 'wms') {
            const wms = item.wms || parseWmsUrl(item.url);
            if (!wms.layers) throw new Error('WMS layers 값이 필요합니다.');
            return L.tileLayer.wms(wms.baseUrl, {
                ...commonOptions,
                layers: wms.layers,
                styles: wms.styles || '',
                format: wms.format || 'image/png',
                transparent: wms.transparent !== false,
                version: wms.version || '1.3.0'
            });
        }

        if (item.type === 'pmtiles') {
            const { PMTiles, leafletRasterLayer } = await getPmtilesModule();
            const pmtiles = new PMTiles(item.url);
            return leafletRasterLayer(pmtiles, commonOptions);
        }

        if (item.type === 'mbtiles') {
            let db = mbtilesDbCache.get(item.url);
            if (!db) {
                const response = await fetch(item.url);
                if (!response.ok) throw new Error(`MBTiles 파일을 불러오지 못했습니다. (${response.status})`);
                const SQL = await getSqlJs();
                db = new SQL.Database(new Uint8Array(await response.arrayBuffer()));
                mbtilesDbCache.set(item.url, db);
            }
            return new MbtilesLayer(db, {
                ...commonOptions,
                mimeType: getMbtilesMimeType(db)
            });
        }

        if (item.type === 'shp') {
            const geojson = await getUserMapDataStore().getItem(item.geojsonKey);
            if (!geojson) throw new Error('저장된 SHP 지도 데이터를 찾을 수 없습니다. 다시 불러오세요.');
            const spatialMetadataChanged = ensureGeojsonSpatialMetadata(geojson);
            if (spatialMetadataChanged) {
                await getUserMapDataStore().setItem(item.geojsonKey, geojson);
            }
            if (!item.dataBounds && Array.isArray(geojson.__bbox)) {
                item.dataBounds = [...geojson.__bbox];
                saveUserMapsToStorage();
            }
            if (!item.geometryType) {
                item.geometryType = geojson.geometryType || analyzeGeojsonGeometryType(geojson);
                saveUserMapsToStorage();
                renderUserMapList();
            }
            return createShpViewportLayer(item, geojson, paneName, id => getUserMaps().findIndex(mapItem => mapItem.id === id));
        }

        throw new Error('지원하지 않는 사용자 지도 형식입니다.');
    }

    function removeActiveUserBaseMap() {
        activeUserLayers.forEach((layer) => {
            if (map.hasLayer(layer)) map.removeLayer(layer);
            if (layer?.__fFieldShp) {
                layer.clearLayers();
                layer.__allGeojson = null;
            }
        });
        activeUserLayers.clear();
        setUserMaps(getUserMaps().map(item => ({
            ...item,
            enabled: false,
            ...(item.styleMode === 'categorized' ? { categoryVisibleValues: [] } : {})
        })));
        saveUserMapsToStorage();
        renderUserMapList();
    }

    function hasActiveUserBaseMap() {
        return activeUserLayers.size > 0;
    }

    function getUserMapSnapLayers() {
        return getUserMaps()
            .filter(item => item.type === 'shp' && (activeUserLayers.has(item.id) || item.enabled))
            .map(item => activeUserLayers.get(item.id))
            .filter(layer => layer && map.hasLayer(layer));
    }

    function getUserMapMinVisibleZoom(item) {
        const minZoom = Number(item?.minZoom);
        return Number.isFinite(minZoom) ? minZoom : 0;
    }

    function getUserMapMaxVisibleZoom(item) {
        const maxNativeZoom = Number(item?.maxNativeZoom);
        if (Number.isFinite(maxNativeZoom)) return maxNativeZoom;
        const maxZoom = Number(item?.maxZoom);
        return Number.isFinite(maxZoom) ? maxZoom : DEFAULT_MAX_ZOOM;
    }

    function isUserMapInVisibleZoomRange(item) {
        if (item?.type !== 'shp') return true;
        const zoom = map.getZoom();
        return zoom >= getUserMapMinVisibleZoom(item) && zoom <= getUserMapMaxVisibleZoom(item);
    }

    function syncUserMapLayerZoomVisibility(item) {
        const layer = activeUserLayers.get(item.id);
        if (!layer) return;

        if (isUserMapInVisibleZoomRange(item)) {
            if (!map.hasLayer(layer)) map.addLayer(layer);
            if (layer.__fFieldShp) {
                syncShpViewportLayer(layer, item);
            }
            applyUserMapLayerZIndex(layer, getUserMaps().findIndex(mapItem => mapItem.id === item.id));
            return;
        }

        if (map.hasLayer(layer)) map.removeLayer(layer);
    }

    function syncAllUserMapZoomVisibility() {
        getUserMaps()
            .filter(item => item.enabled && activeUserLayers.has(item.id))
            .forEach(item => syncUserMapLayerZoomVisibility(item));
    }

    function runQueuedUserMapViewportSync() {
        if (userMapViewportSyncQueued) return;
        userMapViewportSyncQueued = true;
        window.requestAnimationFrame(() => {
            userMapViewportSyncQueued = false;
            syncAllUserMapZoomVisibility();
        });
    }

    function queueSyncAllUserMapViewport() {
        if (AppState.isVectorRenderDelayEnabled) {
            clearTimeout(userMapViewportSyncDelayTimer);
            userMapViewportSyncDelayTimer = setTimeout(() => {
                userMapViewportSyncDelayTimer = null;
                runQueuedUserMapViewportSync();
            }, 500);
            return;
        }

        runQueuedUserMapViewportSync();
    }

    function initUserMapZoomVisibilitySync() {
        if (userMapZoomSyncInitialized) return;
        userMapZoomSyncInitialized = true;
        map.on('zoomend', queueSyncAllUserMapViewport);
        map.on('moveend', queueSyncAllUserMapViewport);
    }

    async function activateUserMapLayer(item) {
        const layer = activeUserLayers.get(item.id) || await createLayerForUserMap(item);
        activeUserLayers.set(item.id, layer);
        item.enabled = true;
        syncUserMapLayerZoomVisibility(item);
        updateLayerOrder();
        reorderUserMapLayers();
    }

    function deactivateUserMapLayer(item) {
        const activeLayer = activeUserLayers.get(item.id);
        if (activeLayer && map.hasLayer(activeLayer)) map.removeLayer(activeLayer);
        if (activeLayer?.__fFieldShp) {
            activeLayer.clearLayers();
            activeLayer.__allGeojson = null;
        }
        activeUserLayers.delete(item.id);
        item.enabled = false;
    }

    return {
        activateUserMapLayer,
        createLayerForUserMap,
        deactivateUserMapLayer,
        getUserMapSnapLayers,
        hasActiveUserBaseMap,
        initUserMapZoomVisibilitySync,
        removeActiveUserBaseMap
    };
}
