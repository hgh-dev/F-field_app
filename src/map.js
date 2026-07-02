/* ==========================================================================
   [모듈] 지도 초기화와 지도 레이어 관리 (map.js)
   [역할]
   - Leaflet 지도를 만들고 배경지도, 위성지도, 지적도, 주제도 레이어를 설정합니다.
   - 지도 레이어 전환, 순서 갱신, 오프라인 지도 URL 수집을 제공합니다.
   [참고]
   - 지도 자체가 보이지 않거나 배경지도/지적도 전환 문제가 생기면 확인합니다.
   ========================================================================== */
import { VWORLD_API_KEY } from './config.js';
import { AppState } from './state.js';
import {
    applyDefaultMapLayerOpacities,
    configureMapLayerOpacityLayers,
    getInitialMapLayerOpacity,
    getMapLayerEffect,
    getMapLayerOpacity,
    getMapLayerOpacityLabel,
    clearSavedMapLayerStyles,
    resetMapLayerStyle,
    resetAllMapLayerStyles,
    saveCurrentMapLayerStyles,
    setMapLayerEffect,
    setMapLayerOpacity
} from './map-layer-opacity.js';
import { showVworldLegend } from './map-vworld-legend.js';

export {
    getInitialMapLayerOpacity,
    getMapLayerOpacity,
    getMapLayerOpacityLabel,
    getMapLayerEffect,
    clearSavedMapLayerStyles,
    resetMapLayerStyle,
    resetAllMapLayerStyles,
    saveCurrentMapLayerStyles,
    setMapLayerEffect,
    setMapLayerOpacity
} from './map-layer-opacity.js';

/* ==========================================================================
   1) 지도 초기화
   ========================================================================== */
/**
 * 앱 전체에서 공통으로 사용하는 Leaflet 지도 인스턴스를 생성합니다.
 * 동작 원리:
 * - 기본 zoom/attribution 컨트롤은 앱 UI와 겹치지 않도록 끕니다.
 * - renderer를 canvas로 지정해 터치 히트 영역(tolerance)을 늘려 모바일 선택성을 높입니다.
 */
export const map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    tap: false,
    maxZoom: 22,
    // 더블클릭은 확대 대신 앱의 정보 조회 동작에 쓰기 위해 비활성화합니다.
    doubleClickZoom: false,
    // Canvas renderer는 벡터 클릭 판정 범위를 조절하기 쉬워 모바일 편집에서 유리합니다.
    renderer: L.canvas({ padding: 0.5, tolerance: 15 })
    // 기본 시작 위치(대한민국 중심)와 줌 레벨입니다.
}).setView([36.5, 127.8], 7);

/* ==========================================================================
   2) 레이어 정의
   ========================================================================== */

// 축척 막대는 국내 사용 기준으로 metric만 노출합니다.
const scaleControl = L.control.scale({ imperial: false, metric: true }).addTo(map);

function initScaleZoomMenu() {
    const container = scaleControl.getContainer?.();
    if (!container) return;

    container.classList.add('scale-zoom-control');
    container.setAttribute('role', 'button');
    container.setAttribute('tabindex', '0');
    container.setAttribute('aria-label', '지도 스케일 선택');

    const menu = document.createElement('div');
    menu.className = 'scale-zoom-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '지도 스케일');
    container.appendChild(menu);
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    L.DomEvent.disableClickPropagation(menu);
    L.DomEvent.disableScrollPropagation(menu);
    ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'pointermove', 'mousedown', 'mousemove'].forEach(eventName => {
        menu.addEventListener(eventName, (event) => event.stopPropagation(), { passive: false });
    });

    const renderMenu = () => {
        const currentZoom = Math.round(map.getZoom());
        menu.innerHTML = '';
        for (let zoom = 1; zoom <= 22; zoom += 1) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'scale-zoom-menu-item';
            item.dataset.zoom = String(zoom);
            item.setAttribute('role', 'menuitem');
            item.classList.toggle('active', zoom === currentZoom);
            item.toggleAttribute('aria-current', zoom === currentZoom);
            item.textContent = String(zoom);
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                map.setZoom(zoom);
                container.classList.remove('menu-open');
            });
            menu.appendChild(item);
        }
    };

    const toggleMenu = (event) => {
        event.stopPropagation();
        renderMenu();
        container.classList.toggle('menu-open');
    };

    container.addEventListener('click', toggleMenu);
    container.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleMenu(event);
    });
    map.on('zoomend', renderMenu);
    map.on('click', () => container.classList.remove('menu-open'));
    document.addEventListener('click', () => container.classList.remove('menu-open'));
    renderMenu();
}

initScaleZoomMenu();

/* --------------------------------------------------------------------------
   2-1) 커스텀 Pane (z-index 계층)
   -------------------------------------------------------------------------- */
/**
 * 오버레이 간 표시 우선순위를 고정하기 위해 pane을 분리합니다.
 * 동작 원리:
 * - pane zIndex가 클수록 화면 위쪽에 렌더링됩니다.
 * - pointerEvents를 none으로 두어 오버레이가 지도 클릭/드로잉 입력을 가로채지 않게 합니다.
 */
map.createPane('nasHeritagePane');
map.getPane('nasHeritagePane').style.zIndex = 390; // 산림보호구역(400) 아래
map.getPane('nasHeritagePane').style.pointerEvents = 'none';

map.createPane('userMapPane');
map.getPane('userMapPane').style.zIndex = 395; // 사용자 지도는 기록관리 레이어(overlayPane 400) 아래
map.getPane('userMapPane').style.pointerEvents = 'none';

map.createPane('nasRestrictionPane');
map.getPane('nasRestrictionPane').style.zIndex = 410; // 산림보호구역(overlayPane 기본 400) 위
map.getPane('nasRestrictionPane').style.pointerEvents = 'none';

// Proj4 좌표계 정의입니다.
// 동작 원리: 외부 API 데이터가 EPSG별로 달라질 수 있어 사전에 변환 규칙을 등록해 둡니다.
proj4.defs("EPSG:5186", "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs");
proj4.defs("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");



/* --------------------------------------------------------------------------
   2-2) 배경 지도 (TileLayer)
   -------------------------------------------------------------------------- */
// Base map은 타일 URL 템플릿({z}/{x}/{y})으로 요청됩니다.
// 동작 원리: 현재 화면의 타일 좌표에 맞는 조각 이미지만 받아 붙여서 지도를 그립니다.

// VWorld 기본 배경 지도(일반 지도)
export const vworldBase = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', {
    key: VWORLD_API_KEY,
    layer: 'Base',
    ext: 'png',
    attribution: 'VWorld',
    maxNativeZoom: 18, // 19~22레벨에서는 18레벨 타일을 확대해 오프라인 패키지와 맞춥니다.
    maxZoom: 22,
    opacity: getInitialMapLayerOpacity('baseBase'),
    crossOrigin: true
});

// VWorld 위성(영상) 지도
export const vworldSatellite = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', {
    key: VWORLD_API_KEY,
    layer: 'Satellite',
    ext: 'jpeg',
    attribution: 'VWorld',
    maxNativeZoom: 18,
    maxZoom: 22,
    opacity: getInitialMapLayerOpacity('baseSatellite'),
    crossOrigin: true
});

// VWorld 하이브리드(도로/지명 텍스트 오버레이)
export const vworldHybrid = L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.{ext}', {
    key: VWORLD_API_KEY,
    layer: 'Hybrid',
    ext: 'png',
    opacity: getInitialMapLayerOpacity('hybrid'),
    attribution: 'VWorld',
    maxNativeZoom: 18,
    maxZoom: 22,
    crossOrigin: true
});

// Esri 위성지도 (VWorld 대체 소스)
export const esriSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri World Imagery',
    maxNativeZoom: 18,
    maxZoom: 22,
    opacity: getInitialMapLayerOpacity('baseEsri'),
    crossOrigin: true
});

/* --------------------------------------------------------------------------
   2-3) 지적도/규제 오버레이 (WMS 포함)
   -------------------------------------------------------------------------- */
// WMS는 화면 영역(BBOX) 기준으로 서버가 이미지를 생성해 반환합니다.
// 동작 원리: 투명 PNG를 겹쳐 다양한 공공 레이어를 배경지도 위에 중첩합니다.

// 지적도(LX 편집도)
export const vworldLxLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY,
    layers: 'lt_c_landinfobasemap',
    styles: '',
    format: 'image/png',
    transparent: true,
    // 반투명으로 두어 위성/기본지도와 함께 읽기 쉽도록 설정
    opacity: getInitialMapLayerOpacity('cadastralLx'),
    version: '1.3.0',
    maxZoom: 22,
    maxNativeZoom: 22,
    detectRetina: true,
    // 타일 크기를 키워 고해상도 환경에서 텍스트/선명도 손실을 줄입니다.
    tileSize: 512,
    zoomOffset: 0,
    className: 'cadastral-layer'
});

// 연속지적도(본번/부번 지적선)
export const vworldContinuousLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY,
    // 본번/부번 레이어를 한 번에 요청해 경계 정보를 함께 표시합니다.
    layers: 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun',
    styles: 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun',
    format: 'image/png',
    transparent: true,
    opacity: getInitialMapLayerOpacity('cadastralContinuous'),
    version: '1.3.0',
    minZoom: 18,
    maxZoom: 22,
    maxNativeZoom: 22,
    detectRetina: true,
    tileSize: 512,
    zoomOffset: 0,
    className: 'cadastral-layer cadastral-continuous-layer'
});

// 행정경계 통합 WMS (시도/시군구/읍면동/리)
export const mergedAdminLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY,
    layers: 'lt_c_adsido,lt_c_adsigg,lt_c_ademd,lt_c_adri',
    styles: 'lt_c_adsido,lt_c_adsigg,lt_c_ademd,lt_c_adri',
    format: 'image/png',
    transparent: true,
    opacity: getInitialMapLayerOpacity('admin'),
    version: '1.3.0',
    // 매우 저줌에서 경계 데이터가 과도해지는 문제를 줄이기 위해 하한 줌을 둡니다.
    minZoom: 6,
    maxZoom: 22,
    maxNativeZoom: 18,
    className: 'admin-layer'
});

// 개발제한구역 WMS
export const vworldRestrictionLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY,
    layers: 'lt_c_ud801',
    styles: 'lt_c_ud801',
    format: 'image/png',
    transparent: true,
    opacity: 0.7,
    version: '1.3.0',
    minZoom: 8,
    maxZoom: 22,
    maxNativeZoom: 19,
    pane: 'nasRestrictionPane',
    className: 'restriction-layer'
});

// 급경사재해예방지역 WMS
export const vworldSteepSlopeLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY,
    layers: 'lt_c_up401',
    styles: 'lt_c_up401',
    format: 'image/png',
    transparent: true,
    opacity: 0.7,
    version: '1.3.0',
    minZoom: 8,
    maxZoom: 22,
    maxNativeZoom: 19,
    pane: 'nasRestrictionPane',
    className: 'steep-slope-layer'
});

// 국가유산 지정/보호구역 WMS
export const vworldHeritageLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY,
    layers: 'lt_c_uo301',
    styles: 'lt_c_uo301',
    format: 'image/png',
    transparent: true,
    opacity: 0.7,
    version: '1.3.0',
    minZoom: 12,
    maxZoom: 22,
    maxNativeZoom: 19,
    pane: 'nasHeritagePane',
    className: 'heritage-layer'
});

// 산림보호구역 WMS
export const vworldForestLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_uf151', styles: 'lt_c_uf151', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'forest-layer'
});

// 도시자연공원구역 WMS
export const vworldCityparkLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_uq162', styles: 'lt_c_uq162', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'citypark-layer'
});

// 임업 및 산촌 진흥권역 WMS
export const vworldForestryLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_uf602', styles: 'lt_c_uf602', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'forestry-layer'
});

// 자연환경보전지역 WMS
export const vworldEnvpreserveLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_uq114', styles: 'lt_c_uq114', format: 'image/png', transparent: true, opacity: 1, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'envpreserve-layer'
});

// 도시지역 WMS
export const vworldCityzoneLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_uq111', styles: 'lt_c_uq111', format: 'image/png', transparent: true, opacity: 1, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'cityzone-layer'
});

// 관리지역 WMS
export const vworldManagezoneLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_uq112', styles: 'lt_c_uq112', format: 'image/png', transparent: true, opacity: 1, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'managezone-layer'
});

// 농림지역 WMS
export const vworldFarmzoneLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_uq113', styles: 'lt_c_uq113', format: 'image/png', transparent: true, opacity: 1, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'farmzone-layer'
});


// 백두대간보호지역 WMS
export const vworldBaekduLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_uf901', styles: 'lt_c_uf901', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 8, maxZoom: 22, maxNativeZoom: 19, className: 'baekdu-layer'
});

// 습지보호지역 WMS
export const vworldWetlandLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_wgisarwet', styles: 'lt_c_wgisarwet', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'wetland-layer'
});

// 야생생물보호 WMS
export const vworldWildlifeLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_um221', styles: 'lt_c_um221', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'wildlife-layer'
});

// 상수원보호 WMS
export const vworldWatersourceLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_um710', styles: 'lt_c_um710', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'watersource-layer'
});

// 자연공원 WMS (국립/군립/도립 묶음)
export const vworldNatureparkLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_wgisnpgug,lt_c_wgisnpgun,lt_c_wgisnpdo', styles: 'lt_c_wgisnpgug,lt_c_wgisnpgun,lt_c_wgisnpdo', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 8, maxZoom: 22, maxNativeZoom: 19, className: 'naturepark-layer'
});

// 도시계획(도로) WMS
export const vworldCityroadLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_upisuq151', styles: 'lt_c_upisuq151', format: 'image/png', transparent: true, opacity: 1, version: '1.3.0', minZoom: 12, maxZoom: 22, maxNativeZoom: 19, className: 'cityroad-layer'
});

// 도시계획_철도·항만·공항·주차장 WMS
export const vworldCityTransportLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_upisuq152', styles: 'lt_c_upisuq152', format: 'image/png', transparent: true, opacity: 1, version: '1.3.0', minZoom: 12, maxZoom: 22, maxNativeZoom: 19, className: 'city-transport-layer'
});

// 도시계획_공간시설 WMS
export const vworldCitySpaceLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_upisuq153', styles: 'lt_c_upisuq153', format: 'image/png', transparent: true, opacity: 1, version: '1.3.0', minZoom: 12, maxZoom: 22, maxNativeZoom: 19, className: 'city-space-layer'
});

// 도시계획_공공문화체육시설 WMS
export const vworldCityPublicCultureLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_upisuq155', styles: 'lt_c_upisuq155', format: 'image/png', transparent: true, opacity: 1, version: '1.3.0', minZoom: 12, maxZoom: 22, maxNativeZoom: 19, className: 'city-public-culture-layer'
});

// 도시계획_방재시설 WMS
export const vworldCityDisasterLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_upisuq156', styles: 'lt_c_upisuq156', format: 'image/png', transparent: true, opacity: 1, version: '1.3.0', minZoom: 12, maxZoom: 22, maxNativeZoom: 19, className: 'city-disaster-layer'
});

// 도시계획_환경기초시설 WMS
export const vworldCityEnvironmentLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_upisuq158', styles: 'lt_c_upisuq158', format: 'image/png', transparent: true, opacity: 1, version: '1.3.0', minZoom: 12, maxZoom: 22, maxNativeZoom: 19, className: 'city-environment-layer'
});

// 토지이용계획도 WMS
export const vworldLanduseLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_lhblpn', styles: 'lt_c_lhblpn', format: 'image/png', transparent: true, opacity: 1, version: '1.3.0', minZoom: 8, maxZoom: 22, maxNativeZoom: 19, className: 'landuse-layer'
});

// 사업지구경계도 WMS
export const vworldBizzoneLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_lhzone', styles: 'lt_c_lhzone', format: 'image/png', transparent: true, opacity: 0.7, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'bizzone-layer'
});

// 산업단지_경계 WMS
export const vworldIndustrialBoundaryLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_damdan', styles: 'lt_c_damdan', format: 'image/png', transparent: true, opacity: 0.8, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'industrial-boundary-layer'
});

// 산업단지_시설용지 WMS
export const vworldIndustrialFacilityLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_damyoj', styles: 'lt_c_damyoj', format: 'image/png', transparent: true, opacity: 0.8, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'industrial-facility-layer'
});

// 산업단지_용도지역 WMS
export const vworldIndustrialUsezoneLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_damyod', styles: 'lt_c_damyod', format: 'image/png', transparent: true, opacity: 0.8, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'industrial-usezone-layer'
});

// 산업단지_유치업종 WMS
export const vworldIndustrialBusinessLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_damyuch', styles: 'lt_c_damyuch', format: 'image/png', transparent: true, opacity: 0.8, version: '1.3.0', minZoom: 10, maxZoom: 22, maxNativeZoom: 19, className: 'industrial-business-layer'
});

// 비행금지구역 WMS
export const vworldFlightProhibitLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_aisprhc', styles: 'lt_c_aisprhc', format: 'image/png', transparent: true, opacity: 0.8, version: '1.3.0', minZoom: 8, maxZoom: 22, maxNativeZoom: 19, className: 'flight-prohibit-layer'
});

// 도로구분 WMS
export const vworldRoadClassLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_l_moctlink', styles: 'lt_l_moctlink', format: 'image/png', transparent: true, opacity: 0.9, version: '1.3.0', minZoom: 8, maxZoom: 22, maxNativeZoom: 19, className: 'road-class-layer'
});

// 비행제한구역 WMS
export const vworldFlightRestrictLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_aisresc', styles: 'lt_c_aisresc', format: 'image/png', transparent: true, opacity: 0.8, version: '1.3.0', minZoom: 8, maxZoom: 22, maxNativeZoom: 19, className: 'flight-restrict-layer'
});

// 산림입지토양도 WMS
export const vworldForestSoilLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_c_fsdifrsts', styles: 'lt_c_fsdifrsts', format: 'image/png', transparent: true, opacity: 0.8, version: '1.3.0', minZoom: 10, minNativeZoom: 12, maxZoom: 22, maxNativeZoom: 19, className: 'forest-soil-layer'
});

// 등산로 WMS (선/점 레이어 묶음)
export const vworldHikingTrailLayer = L.tileLayer.wms("https://api.vworld.kr/req/wms", {
    key: VWORLD_API_KEY, layers: 'lt_l_frstclimb,lt_p_climball', styles: 'lt_l_frstclimb,lt_p_climball', format: 'image/png', transparent: true, opacity: 0.9, version: '1.3.0', minZoom: 8, maxZoom: 22, maxNativeZoom: 19, className: 'hiking-trail-layer'
});

configureMapLayerOpacityLayers({
    baseSatellite: vworldSatellite,
    baseEsri: esriSatelliteLayer,
    baseBase: vworldBase,
    hybrid: vworldHybrid,
    admin: mergedAdminLayer,
    cadastralContinuous: vworldContinuousLayer,
    cadastralLx: vworldLxLayer,
    restriction: vworldRestrictionLayer,
    steepSlope: vworldSteepSlopeLayer,
    forest: vworldForestLayer,
    heritage: vworldHeritageLayer,
    citypark: vworldCityparkLayer,
    forestry: vworldForestryLayer,
    envpreserve: vworldEnvpreserveLayer,
    cityzone: vworldCityzoneLayer,
    managezone: vworldManagezoneLayer,
    farmzone: vworldFarmzoneLayer,
    baekdu: vworldBaekduLayer,
    wetland: vworldWetlandLayer,
    wildlife: vworldWildlifeLayer,
    watersource: vworldWatersourceLayer,
    naturepark: vworldNatureparkLayer,
    cityroad: vworldCityroadLayer,
    cityTransport: vworldCityTransportLayer,
    citySpace: vworldCitySpaceLayer,
    cityPublicCulture: vworldCityPublicCultureLayer,
    cityDisaster: vworldCityDisasterLayer,
    cityEnvironment: vworldCityEnvironmentLayer,
    landuse: vworldLanduseLayer,
    bizzone: vworldBizzoneLayer,
    industrialBoundary: vworldIndustrialBoundaryLayer,
    industrialFacility: vworldIndustrialFacilityLayer,
    industrialUsezone: vworldIndustrialUsezoneLayer,
    industrialBusiness: vworldIndustrialBusinessLayer,
    roadClass: vworldRoadClassLayer,
    flightProhibit: vworldFlightProhibitLayer,
    flightRestrict: vworldFlightRestrictLayer,
    forestSoil: vworldForestSoilLayer,
    hikingTrail: vworldHikingTrailLayer
});
applyDefaultMapLayerOpacities();

const vworldKeyLayers = [
    vworldBase,
    vworldSatellite,
    vworldHybrid,
    vworldLxLayer,
    vworldContinuousLayer,
    mergedAdminLayer,
    vworldRestrictionLayer,
    vworldSteepSlopeLayer,
    vworldHeritageLayer,
    vworldForestLayer,
    vworldCityparkLayer,
    vworldForestryLayer,
    vworldEnvpreserveLayer,
    vworldCityzoneLayer,
    vworldManagezoneLayer,
    vworldFarmzoneLayer,
    vworldBaekduLayer,
    vworldWetlandLayer,
    vworldWildlifeLayer,
    vworldWatersourceLayer,
    vworldNatureparkLayer,
    vworldCityroadLayer,
    vworldCityTransportLayer,
    vworldCitySpaceLayer,
    vworldCityPublicCultureLayer,
    vworldCityDisasterLayer,
    vworldCityEnvironmentLayer,
    vworldLanduseLayer,
    vworldBizzoneLayer,
    vworldIndustrialBoundaryLayer,
    vworldIndustrialFacilityLayer,
    vworldIndustrialUsezoneLayer,
    vworldIndustrialBusinessLayer,
    vworldFlightProhibitLayer,
    vworldRoadClassLayer,
    vworldFlightRestrictLayer,
    vworldForestSoilLayer,
    vworldHikingTrailLayer
];

const MAP_SETTINGS_SAVE_ENABLED_KEY = 'setting_map_settings_save_enabled';
const MAP_LAYER_SELECTION_STORAGE_KEY = 'setting_map_layer_selections';
const DEFAULT_MAP_LAYER_SELECTIONS = {
    baseEnabled: true,
    baseType: 'satellite',
    cadastralEnabled: true,
    cadastralType: 'continuous',
    overlays: {
        hybrid: true,
        admin: false,
        restriction: false,
        steepSlope: false,
        forest: false,
        heritage: false,
        citypark: false,
        forestry: false,
        envpreserve: false,
        cityzone: false,
        managezone: false,
        farmzone: false,
        baekdu: false,
        wetland: false,
        wildlife: false,
        watersource: false,
        naturepark: false,
        cityroad: false,
        cityTransport: false,
        citySpace: false,
        cityPublicCulture: false,
        cityDisaster: false,
        cityEnvironment: false,
        landuse: false,
        bizzone: false,
        industrialBoundary: false,
        industrialFacility: false,
        industrialUsezone: false,
        industrialBusiness: false,
        roadClass: false,
        flightProhibit: false,
        flightRestrict: false,
        forestSoil: false,
        hikingTrail: false
    }
};
const MAP_LAYER_OVERLAY_CONTROLS = [
    ['hybrid', 'chk-hybrid'],
    ['admin', 'chk-admin'],
    ['restriction', 'chk-restriction'],
    ['steepSlope', 'chk-steep-slope'],
    ['forest', 'chk-forest'],
    ['heritage', 'chk-heritage'],
    ['citypark', 'chk-citypark'],
    ['forestry', 'chk-forestry'],
    ['envpreserve', 'chk-envpreserve'],
    ['cityzone', 'chk-cityzone'],
    ['managezone', 'chk-managezone'],
    ['farmzone', 'chk-farmzone'],
    ['baekdu', 'chk-baekdu'],
    ['wetland', 'chk-wetland'],
    ['wildlife', 'chk-wildlife'],
    ['watersource', 'chk-watersource'],
    ['naturepark', 'chk-naturepark'],
    ['cityroad', 'chk-cityroad'],
    ['cityTransport', 'chk-city-transport'],
    ['citySpace', 'chk-city-space'],
    ['cityPublicCulture', 'chk-city-public-culture'],
    ['cityDisaster', 'chk-city-disaster'],
    ['cityEnvironment', 'chk-city-environment'],
    ['landuse', 'chk-landuse'],
    ['bizzone', 'chk-bizzone'],
    ['industrialBoundary', 'chk-industrial-boundary'],
    ['industrialFacility', 'chk-industrial-facility'],
    ['industrialUsezone', 'chk-industrial-usezone'],
    ['industrialBusiness', 'chk-industrial-business'],
    ['roadClass', 'chk-road-class'],
    ['flightProhibit', 'chk-flight-prohibit'],
    ['flightRestrict', 'chk-flight-restrict'],
    ['forestSoil', 'chk-forest-soil'],
    ['hikingTrail', 'chk-hiking-trail']
];

let isRestoringMapLayerSelections = false;

function isMapSettingsSaveEnabled() {
    return localStorage.getItem(MAP_SETTINGS_SAVE_ENABLED_KEY) === 'true';
}

function getSelectedRadioValue(name, fallback) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

function setRadioValue(name, value) {
    const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (radio) radio.checked = true;
}

function getMapLayerSelectionState() {
    const overlays = MAP_LAYER_OVERLAY_CONTROLS.reduce((result, [type, checkboxId]) => {
        result[type] = document.getElementById(checkboxId)?.checked === true;
        return result;
    }, {});
    return {
        baseEnabled: document.getElementById('chk-base-layer')?.checked === true,
        baseType: getSelectedRadioValue('baseMap', DEFAULT_MAP_LAYER_SELECTIONS.baseType),
        cadastralEnabled: document.getElementById('chk-cadastral')?.checked === true,
        cadastralType: getSelectedRadioValue('cadastralMap', DEFAULT_MAP_LAYER_SELECTIONS.cadastralType),
        overlays
    };
}

function loadSavedMapLayerSelections() {
    try {
        const raw = localStorage.getItem(MAP_LAYER_SELECTION_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('[map] Failed to load saved map layer selections.', error);
        return null;
    }
}

function persistMapLayerSelectionsIfEnabled() {
    if (isRestoringMapLayerSelections || !isMapSettingsSaveEnabled()) return;
    saveCurrentMapLayerSelections();
}

function applyMapLayerSelections(selection = DEFAULT_MAP_LAYER_SELECTIONS) {
    isRestoringMapLayerSelections = true;

    const baseEnabled = selection.baseEnabled !== false;
    const baseType = ['satellite', 'esri', 'base'].includes(selection.baseType)
        ? selection.baseType
        : DEFAULT_MAP_LAYER_SELECTIONS.baseType;
    const baseCheckbox = document.getElementById('chk-base-layer');
    if (baseCheckbox) baseCheckbox.checked = baseEnabled;
    setRadioValue('baseMap', baseType);
    toggleBaseLayer(baseEnabled);

    const cadastralEnabled = selection.cadastralEnabled !== false;
    const cadastralType = selection.cadastralType === 'lx' ? 'lx' : DEFAULT_MAP_LAYER_SELECTIONS.cadastralType;
    const cadastralCheckbox = document.getElementById('chk-cadastral');
    if (cadastralCheckbox) cadastralCheckbox.checked = cadastralEnabled;
    setRadioValue('cadastralMap', cadastralType);
    toggleOverlay('cadastral', cadastralEnabled);

    MAP_LAYER_OVERLAY_CONTROLS.forEach(([type, checkboxId]) => {
        const nextChecked = selection.overlays?.[type] === true;
        const checkbox = document.getElementById(checkboxId);
        if (checkbox) checkbox.checked = nextChecked;
        toggleOverlay(type, nextChecked);
    });

    updateLayerOrder();
    isRestoringMapLayerSelections = false;
}

export function saveCurrentMapLayerSelections() {
    localStorage.setItem(MAP_LAYER_SELECTION_STORAGE_KEY, JSON.stringify(getMapLayerSelectionState()));
}

export function clearSavedMapLayerSelections() {
    localStorage.removeItem(MAP_LAYER_SELECTION_STORAGE_KEY);
}

export function applySavedMapLayerSelections() {
    if (!isMapSettingsSaveEnabled()) return;
    const savedSelections = loadSavedMapLayerSelections();
    if (!savedSelections || typeof savedSelections !== 'object') return;
    applyMapLayerSelections(savedSelections);
}

export function resetMapLayerSelectionsToDefault() {
    applyMapLayerSelections(DEFAULT_MAP_LAYER_SELECTIONS);
    clearSavedMapLayerSelections();
}

export function applyVworldApiKeyToMapLayers(key = VWORLD_API_KEY) {
    const nextKey = String(key || '').trim();
    if (!nextKey) return;

    vworldKeyLayers.forEach(layer => {
        layer.options.key = nextKey;
        if (typeof layer.redraw === 'function') layer.redraw();
    });
}

if (typeof window !== 'undefined') {
    window.addEventListener('f-field:vworld-api-key-change', (event) => {
        applyVworldApiKeyToMapLayers(event.detail?.key);
    });
}


// 앱 기본 시작 레이어 구성입니다.
// 동작 원리: 위성 + 지적도 + 하이브리드 조합을 먼저 올려 현장 식별성을 높입니다.
map.addLayer(vworldSatellite);
map.addLayer(vworldContinuousLayer);
map.addLayer(vworldHybrid);

// 초기 로드시 체크박스 상태와 실제 지도 레이어 상태를 맞춥니다.
if (document.getElementById('chk-admin') && document.getElementById('chk-admin').checked) {
    toggleOverlay('admin', true);
}
applySavedMapLayerSelections();


/* ==========================================================================
   3) 레이어 제어 함수
   ========================================================================== */

/**
 * 배경지도 표시 전체를 켜거나 끕니다.
 * 동작 원리: ON이면 현재 라디오 선택값을 기준으로 changeBaseMap을 호출합니다.
 */
export function toggleBaseLayer(isChecked) {
    if (isChecked) {
        const selectedValue = document.querySelector('input[name="baseMap"]:checked').value;
        changeBaseMap(selectedValue);
    } else {
        map.removeLayer(vworldSatellite);
        map.removeLayer(vworldBase);
        map.removeLayer(esriSatelliteLayer);
    }
    persistMapLayerSelectionsIfEnabled();
}

/**
 * 배경지도 타입(위성/일반/대체위성)을 전환합니다.
 * 동작 원리: 먼저 후보 레이어를 전부 remove한 뒤 선택 레이어 1개만 add합니다.
 */
export function changeBaseMap(type) {
    if (!document.getElementById('chk-base-layer').checked) {
        persistMapLayerSelectionsIfEnabled();
        return;
    }

    // 단일 선택 보장을 위해 먼저 후보를 모두 제거합니다.
    map.removeLayer(vworldSatellite);
    map.removeLayer(vworldBase);
    map.removeLayer(esriSatelliteLayer);

    if (type === 'satellite') {
        map.addLayer(vworldSatellite);
    } else if (type === 'esri') {
        map.addLayer(esriSatelliteLayer);
    } else {
        map.addLayer(vworldBase);
    }

    // 배경 변경 후 오버레이 계층이 깨지지 않게 순서를 다시 맞춥니다.
    updateLayerOrder();
    persistMapLayerSelectionsIfEnabled();
}

/**
 * 오버레이 렌더링 순서를 재정렬합니다.
 * 동작 원리: bringToFront를 낮은 우선순위부터 순차 호출해 최종 계층을 고정합니다.
 */
export function updateLayerOrder() {
    // 1) 하이브리드 (아래)
    if (map.hasLayer(vworldHybrid)) vworldHybrid.bringToFront();

    // 2) 지적도
    if (map.hasLayer(vworldLxLayer)) vworldLxLayer.bringToFront();
    if (map.hasLayer(vworldContinuousLayer)) vworldContinuousLayer.bringToFront();

    // 3) 토지이용계획
    if (map.hasLayer(vworldLanduseLayer)) vworldLanduseLayer.bringToFront();
    if (map.hasLayer(vworldIndustrialBoundaryLayer)) vworldIndustrialBoundaryLayer.bringToFront();
    if (map.hasLayer(vworldIndustrialFacilityLayer)) vworldIndustrialFacilityLayer.bringToFront();
    if (map.hasLayer(vworldIndustrialUsezoneLayer)) vworldIndustrialUsezoneLayer.bringToFront();
    if (map.hasLayer(vworldIndustrialBusinessLayer)) vworldIndustrialBusinessLayer.bringToFront();

    // 4) 도시계획(도로)
    if (map.hasLayer(vworldCityroadLayer)) vworldCityroadLayer.bringToFront();
    if (map.hasLayer(vworldCityTransportLayer)) vworldCityTransportLayer.bringToFront();
    if (map.hasLayer(vworldCitySpaceLayer)) vworldCitySpaceLayer.bringToFront();
    if (map.hasLayer(vworldCityPublicCultureLayer)) vworldCityPublicCultureLayer.bringToFront();
    if (map.hasLayer(vworldCityDisasterLayer)) vworldCityDisasterLayer.bringToFront();
    if (map.hasLayer(vworldCityEnvironmentLayer)) vworldCityEnvironmentLayer.bringToFront();

    // 5) 기타 주제도
    if (map.hasLayer(vworldRoadClassLayer)) vworldRoadClassLayer.bringToFront();
    if (map.hasLayer(vworldFlightProhibitLayer)) vworldFlightProhibitLayer.bringToFront();
    if (map.hasLayer(vworldFlightRestrictLayer)) vworldFlightRestrictLayer.bringToFront();
    if (map.hasLayer(vworldForestSoilLayer)) vworldForestSoilLayer.bringToFront();
    if (map.hasLayer(vworldHikingTrailLayer)) vworldHikingTrailLayer.bringToFront();

    // 6) 행정경계 (최상단)
    if (map.hasLayer(mergedAdminLayer)) mergedAdminLayer.bringToFront();

    // 7) 사용자 지도는 지적도/하이브리드/기타 WMS보다 앞에 표시합니다.
    if (typeof window !== 'undefined' && typeof window.reorderUserMapLayers === 'function') {
        window.reorderUserMapLayers();
    }

    // 8) 기록관리 레이어는 사용자 지도보다 항상 앞에 표시합니다.
    if (typeof window !== 'undefined' && typeof window.bringRecordLayersToFront === 'function') {
        window.bringRecordLayersToFront();
    }
}

/**
 * 지적도 타입(LX/연속지적도)을 전환합니다.
 */
export function changeCadastralMap(type) {
    if (!document.getElementById('chk-cadastral').checked) {
        persistMapLayerSelectionsIfEnabled();
        return;
    }

    if (type === 'lx') {
        map.addLayer(vworldLxLayer);
        map.removeLayer(vworldContinuousLayer);
    } else {
        map.addLayer(vworldContinuousLayer);
        map.removeLayer(vworldLxLayer);
    }
    updateLayerOrder();
    persistMapLayerSelectionsIfEnabled();
}

/**
 * 오버레이 타입별로 레이어를 ON/OFF 합니다.
 * 동작 원리:
 * - 공통 타입은 layer 변수에 매핑 후 add/remove
 * - 지적도/행정경계처럼 특수 규칙이 있는 타입은 별도 분기로 처리합니다.
 */
export function toggleOverlay(type, isChecked) {
    let layer;

    if (type === 'hybrid') {
        layer = vworldHybrid;
    } else if (type === 'cadastral') {
        // 지적도는 내부에서 다시 세부 타입(LX/연속)을 선택해야 하므로 전용 처리합니다.
        if (isChecked) {
            const selectedValue = document.querySelector('input[name="cadastralMap"]:checked').value;
            changeCadastralMap(selectedValue);
        } else {
            map.removeLayer(vworldLxLayer);
            map.removeLayer(vworldContinuousLayer);
        }
        persistMapLayerSelectionsIfEnabled();
        return;
    } else if (type === 'admin') {
        // 행정경계는 항상 최상단 유지가 중요해 add 시 즉시 bringToFront를 적용합니다.
        if (isChecked) {
            map.addLayer(mergedAdminLayer);
            mergedAdminLayer.bringToFront();
        } else {
            map.removeLayer(mergedAdminLayer);
        }
        persistMapLayerSelectionsIfEnabled();
        return;
    } else if (type === 'restriction') {
        layer = vworldRestrictionLayer;
    } else if (type === 'steepSlope') {
        layer = vworldSteepSlopeLayer;
    } else if (type === 'heritage') {
        layer = vworldHeritageLayer;
    } else if (type === 'citypark') {
        layer = vworldCityparkLayer;
    } else if (type === 'forestry') {
        layer = vworldForestryLayer;
    } else if (type === 'envpreserve') {
        layer = vworldEnvpreserveLayer;
    } else if (type === 'cityzone') {
        layer = vworldCityzoneLayer;
    } else if (type === 'managezone') {
        layer = vworldManagezoneLayer;
    } else if (type === 'farmzone') {
        layer = vworldFarmzoneLayer;
    } else if (type === 'baekdu') {
        layer = vworldBaekduLayer;
    } else if (type === 'wetland') {
        layer = vworldWetlandLayer;
    } else if (type === 'wildlife') {
        layer = vworldWildlifeLayer;
    } else if (type === 'watersource') {
        layer = vworldWatersourceLayer;
    } else if (type === 'naturepark') {
        layer = vworldNatureparkLayer;
    } else if (type === 'cityroad') {
        layer = vworldCityroadLayer;
    } else if (type === 'cityTransport') {
        layer = vworldCityTransportLayer;
    } else if (type === 'citySpace') {
        layer = vworldCitySpaceLayer;
    } else if (type === 'cityPublicCulture') {
        layer = vworldCityPublicCultureLayer;
    } else if (type === 'cityDisaster') {
        layer = vworldCityDisasterLayer;
    } else if (type === 'cityEnvironment') {
        layer = vworldCityEnvironmentLayer;
    } else if (type === 'landuse') {
        layer = vworldLanduseLayer;
    } else if (type === 'bizzone') {
        layer = vworldBizzoneLayer;
    } else if (type === 'industrialBoundary') {
        layer = vworldIndustrialBoundaryLayer;
    } else if (type === 'industrialFacility') {
        layer = vworldIndustrialFacilityLayer;
    } else if (type === 'industrialUsezone') {
        layer = vworldIndustrialUsezoneLayer;
    } else if (type === 'industrialBusiness') {
        layer = vworldIndustrialBusinessLayer;
    } else if (type === 'roadClass') {
        layer = vworldRoadClassLayer;
    } else if (type === 'flightProhibit') {
        layer = vworldFlightProhibitLayer;
    } else if (type === 'flightRestrict') {
        layer = vworldFlightRestrictLayer;
    } else if (type === 'forestSoil') {
        layer = vworldForestSoilLayer;
    } else if (type === 'hikingTrail') {
        layer = vworldHikingTrailLayer;
    } else if (type === 'forest') {
        layer = vworldForestLayer;
    }

    // 공통 add/remove 처리입니다.
    if (isChecked) {
        map.addLayer(layer);
        updateLayerOrder();
    } else {
        map.removeLayer(layer);
    }

    // VWorld WMS 타입은 공통 함수로 범례 표시/숨김을 동기화합니다.
    showVworldLegend(type, isChecked);
    persistMapLayerSelectionsIfEnabled();
}

/* ==========================================================================
   4) 오프라인 지도 URL 수집
   ========================================================================== */
/**
 * 주어진 영역(bounds)과 줌 레벨 범위에 해당하는 타일 URL 배열을 반환합니다.
 * 동작 원리:
 * - bounds를 Web Mercator 타일 좌표(x,y,z) 범위로 변환합니다.
 * - 현재 활성화된 타일 레이어 각각에 getTileUrl(coords)를 호출해 URL을 모읍니다.
 * - 중복 URL을 제거해 다운로드 대상을 최소화합니다.
 */
export function isOfflineDownloadableMapLayer(layer) {
    if (typeof layer?.getTileUrl !== 'function') return false;
    const url = String(layer._url || '');
    return url.includes('api.vworld.kr') && url.includes('/req/wmts');
}

export function getOfflineDownloadBounds(baseZoom = 15) {
    const center = map.getCenter();
    const size = map.getSize();
    const centerPoint = map.project(center, baseZoom);
    const halfSize = size.divideBy(2);
    const northWest = map.unproject(centerPoint.subtract(halfSize), baseZoom);
    const southEast = map.unproject(centerPoint.add(halfSize), baseZoom);
    return L.latLngBounds(northWest, southEast);
}

function getOfflineTileUrl(layer, x, y, z) {
    const template = String(layer?._url || '');
    if (!template) return '';

    const options = layer.options || {};
    const coords = L.point(x, y);
    coords.z = z;
    const data = {
        ...options,
        s: typeof layer._getSubdomain === 'function' ? layer._getSubdomain(coords) : '',
        x,
        y,
        z
    };

    return L.Util.template(template, data);
}

export function getOfflineMapUrls(bounds, minZoom, maxZoom) {
    const urls = [];
    const minLat = bounds.getSouth();
    const maxLat = bounds.getNorth();
    const minLng = bounds.getWest();
    const maxLng = bounds.getEast();

    function lng2tile(lon, zoom) { return Math.floor((lon + 180) / 360 * Math.pow(2, zoom)); }
    function lat2tile(lat, zoom) { return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)); }

    // 현재 지도에 켜진 VWorld WMTS 배경 타일만 수집합니다. WMS는 CORS 때문에 오프라인 저장 대상에서 제외합니다.
    const activeTileLayers = [];
    map.eachLayer((layer) => {
        if (isOfflineDownloadableMapLayer(layer)) {
            activeTileLayers.push(layer);
        }
    });

    for (let z = minZoom; z <= maxZoom; z++) {
        let xtileMin = lng2tile(minLng, z);
        let xtileMax = lng2tile(maxLng, z);
        // 타일 Y축은 북쪽이 작기 때문에 maxLat가 y 최소값이 됩니다.
        let ytileMin = lat2tile(maxLat, z);
        let ytileMax = lat2tile(minLat, z);

        // 드래그 방향에 상관없이 안전하게 순회하도록 min/max를 재정렬합니다.
        const minX = Math.min(xtileMin, xtileMax);
        const maxX = Math.max(xtileMin, xtileMax);
        const minY = Math.min(ytileMin, ytileMax);
        const maxY = Math.max(ytileMin, ytileMax);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                activeTileLayers.forEach(layer => {
                    try {
                        // Leaflet의 getTileUrl은 현재 레이어 줌 상태를 참조할 수 있어 다운로드 대상 줌을 직접 주입합니다.
                        const url = getOfflineTileUrl(layer, x, y, z);
                        if (url) urls.push(url);
                    } catch (e) {
                        console.warn('Failed to generate tile URL for layer', e);
                    }
                });
            }
        }
    }
    // 같은 URL 중복 요청을 방지하기 위해 Set으로 유일값만 반환합니다.
    return [...new Set(urls)];
}
