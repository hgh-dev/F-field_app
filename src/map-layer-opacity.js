/* ==========================================================================
   [모듈] 지도 레이어 투명도 (map-layer-opacity.js)
   [역할]
   - 배경지도, 지적도, 주제도 같은 지도 레이어의 투명도 기본값과 라벨을 관리합니다.
   - map.js에서 만든 Leaflet 레이어에 실제 투명도를 적용합니다.
   [참고]
   - 지도 레이어 투명도 슬라이더나 표시값이 이상할 때 확인합니다.
   ========================================================================== */
const TOPIC_LAYER_DEFAULT_OPACITY = 0.8;

const mapLayerOpacityDefaults = {
    baseSatellite: 1,
    baseEsri: 1,
    baseBase: 1,
    hybrid: 1,
    admin: 1,
    cadastralContinuous: 0.6,
    cadastralLx: 0.6,
    restriction: TOPIC_LAYER_DEFAULT_OPACITY,
    steepSlope: TOPIC_LAYER_DEFAULT_OPACITY,
    forest: TOPIC_LAYER_DEFAULT_OPACITY,
    heritage: TOPIC_LAYER_DEFAULT_OPACITY,
    citypark: TOPIC_LAYER_DEFAULT_OPACITY,
    forestry: TOPIC_LAYER_DEFAULT_OPACITY,
    envpreserve: TOPIC_LAYER_DEFAULT_OPACITY,
    cityzone: TOPIC_LAYER_DEFAULT_OPACITY,
    managezone: TOPIC_LAYER_DEFAULT_OPACITY,
    farmzone: TOPIC_LAYER_DEFAULT_OPACITY,
    baekdu: TOPIC_LAYER_DEFAULT_OPACITY,
    wetland: TOPIC_LAYER_DEFAULT_OPACITY,
    wildlife: TOPIC_LAYER_DEFAULT_OPACITY,
    watersource: TOPIC_LAYER_DEFAULT_OPACITY,
    naturepark: TOPIC_LAYER_DEFAULT_OPACITY,
    cityroad: TOPIC_LAYER_DEFAULT_OPACITY,
    cityTransport: TOPIC_LAYER_DEFAULT_OPACITY,
    citySpace: TOPIC_LAYER_DEFAULT_OPACITY,
    cityPublicCulture: TOPIC_LAYER_DEFAULT_OPACITY,
    cityDisaster: TOPIC_LAYER_DEFAULT_OPACITY,
    cityEnvironment: TOPIC_LAYER_DEFAULT_OPACITY,
    landuse: TOPIC_LAYER_DEFAULT_OPACITY,
    bizzone: TOPIC_LAYER_DEFAULT_OPACITY,
    industrialBoundary: TOPIC_LAYER_DEFAULT_OPACITY,
    industrialFacility: TOPIC_LAYER_DEFAULT_OPACITY,
    industrialUsezone: TOPIC_LAYER_DEFAULT_OPACITY,
    industrialBusiness: TOPIC_LAYER_DEFAULT_OPACITY,
    roadClass: TOPIC_LAYER_DEFAULT_OPACITY,
    flightProhibit: TOPIC_LAYER_DEFAULT_OPACITY,
    flightRestrict: TOPIC_LAYER_DEFAULT_OPACITY,
    forestSoil: TOPIC_LAYER_DEFAULT_OPACITY,
    hikingTrail: TOPIC_LAYER_DEFAULT_OPACITY
};

const mapLayerOpacityLabels = {
    baseSatellite: 'VWorld 위성지도',
    baseEsri: 'Esri 위성지도',
    baseBase: 'VWorld 일반지도',
    hybrid: '하이브리드(도로/지명)',
    admin: '행정경계',
    cadastralContinuous: '연속지적도',
    cadastralLx: 'LX맵',
    restriction: '개발제한구역',
    steepSlope: '급경사재해예방지역',
    forest: '산림보호구역',
    heritage: '국가유산 지정/보호구역',
    citypark: '도시자연공원구역',
    forestry: '임업 및 산촌 진흥권역',
    envpreserve: '자연환경보전지역',
    cityzone: '도시지역',
    managezone: '관리지역',
    farmzone: '농림지역',
    baekdu: '백두대간보호지역',
    wetland: '습지보호지역',
    wildlife: '야생생물보호구역',
    watersource: '상수원보호구역',
    naturepark: '자연공원',
    cityroad: '도로',
    cityTransport: '철도·항만·공항·주차장',
    citySpace: '공간시설',
    cityPublicCulture: '공공문화체육시설',
    cityDisaster: '방재시설',
    cityEnvironment: '환경기초시설',
    landuse: '[택지개발지구]토지이용계획도',
    bizzone: '[택지개발지구]사업지구경계도',
    industrialBoundary: '[산업단지]경계',
    industrialFacility: '[산업단지]시설용지',
    industrialUsezone: '[산업단지]용도지역',
    industrialBusiness: '[산업단지]유치업종',
    roadClass: '도로구분',
    flightProhibit: '비행금지구역',
    flightRestrict: '비행제한구역',
    forestSoil: '산림입지토양도',
    hikingTrail: '등산로'
};

let mapLayerOpacityLayers = {};
const mapLayerEffects = {};

const COLOR_ADJUST_CHANNELS = ['red', 'green', 'blue', 'yellow'];
const COLOR_ADJUST_BIAS_SCALE = 0.35;
const MAP_SETTINGS_SAVE_ENABLED_KEY = 'setting_map_settings_save_enabled';
const MAP_LAYER_STYLE_STORAGE_KEY = 'setting_map_layer_styles';

let isRestoringMapLayerStyles = false;

export function configureMapLayerOpacityLayers(layers = {}) {
    mapLayerOpacityLayers = layers || {};
}

function normalizeOpacity(value, fallback = 1) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(1, Math.max(0, parsed));
}

function getMapLayerOpacityDefault(id) {
    return mapLayerOpacityDefaults[id] ?? 1;
}

export function getInitialMapLayerOpacity(id) {
    return getMapLayerOpacityDefault(id);
}

function getMapLayerByOpacityId(id) {
    return mapLayerOpacityLayers[id] || null;
}

function getMapLayerContainer(layer) {
    return layer?.getContainer?.() || layer?._container || null;
}

function normalizeColorAdjust(value = {}) {
    return COLOR_ADJUST_CHANNELS.reduce((result, channel) => {
        const parsed = Number(value[channel]);
        result[channel] = Number.isFinite(parsed) ? Math.min(100, Math.max(-100, Math.round(parsed))) : 0;
        return result;
    }, {});
}

function isMapSettingsSaveEnabled() {
    return localStorage.getItem(MAP_SETTINGS_SAVE_ENABLED_KEY) === 'true';
}

function getMapLayerStyleState(id) {
    return {
        opacity: getMapLayerOpacity(id),
        ...getMapLayerEffect(id)
    };
}

function getAllMapLayerStyleState() {
    return Object.keys(mapLayerOpacityDefaults).reduce((result, id) => {
        result[id] = getMapLayerStyleState(id);
        return result;
    }, {});
}

function loadSavedMapLayerStyles() {
    try {
        const raw = localStorage.getItem(MAP_LAYER_STYLE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (error) {
        console.warn('[map-layer-opacity] Failed to load saved map layer styles.', error);
        return {};
    }
}

function persistMapLayerStylesIfEnabled() {
    if (isRestoringMapLayerStyles || !isMapSettingsSaveEnabled()) return;
    localStorage.setItem(MAP_LAYER_STYLE_STORAGE_KEY, JSON.stringify(getAllMapLayerStyleState()));
}

function hasColorAdjust(effect = {}) {
    const colorAdjust = normalizeColorAdjust(effect.colorAdjust);
    return COLOR_ADJUST_CHANNELS.some(channel => colorAdjust[channel] !== 0);
}

function getFilterIdForLayerId(id) {
    return `ffield-map-color-filter-${String(id || 'layer').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function ensureMapColorFilter(id, colorAdjust = {}) {
    const normalized = normalizeColorAdjust(colorAdjust);
    const filterId = getFilterIdForLayerId(id);
    let svg = document.getElementById('ffield-map-color-filter-root');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'ffield-map-color-filter-root';
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.position = 'absolute';
        svg.style.width = '0';
        svg.style.height = '0';
        svg.style.overflow = 'hidden';
        document.body.appendChild(svg);
    }

    let filter = document.getElementById(filterId);
    if (!filter) {
        filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.id = filterId;
        filter.setAttribute('color-interpolation-filters', 'sRGB');
        const matrix = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
        matrix.setAttribute('type', 'matrix');
        filter.appendChild(matrix);
        svg.appendChild(filter);
    }

    const matrix = filter.querySelector('feColorMatrix');
    const redBias = ((normalized.red + normalized.yellow) / 100) * COLOR_ADJUST_BIAS_SCALE;
    const greenBias = ((normalized.green + normalized.yellow) / 100) * COLOR_ADJUST_BIAS_SCALE;
    const blueBias = ((normalized.blue - normalized.yellow) / 100) * COLOR_ADJUST_BIAS_SCALE;

    matrix.setAttribute('values', [
        `1 0 0 0 ${redBias.toFixed(4)}`,
        `0 1 0 0 ${greenBias.toFixed(4)}`,
        `0 0 1 0 ${blueBias.toFixed(4)}`,
        '0 0 0 1 0'
    ].join(' '));

    return filterId;
}

function getMapLayerEffectFilter(effect = {}) {
    const filters = [];
    if (effect.invert) filters.push('invert(1) hue-rotate(180deg)');
    return filters.join(' ');
}

function applyMapLayerEffectToLayer(id, layer, effect = {}) {
    const container = getMapLayerContainer(layer);
    if (!container) {
        layer?.once?.('add', () => applyMapLayerEffectToLayer(id, layer, effect));
        return;
    }
    const filters = [];
    if (hasColorAdjust(effect)) {
        filters.push(`url(#${ensureMapColorFilter(id, effect.colorAdjust)})`);
    }
    const cssFilter = getMapLayerEffectFilter(effect);
    if (cssFilter) filters.push(cssFilter);
    container.style.filter = filters.join(' ');
}

export function applyDefaultMapLayerOpacities() {
    Object.keys(mapLayerOpacityDefaults).forEach(id => {
        const layer = getMapLayerByOpacityId(id);
        if (layer && typeof layer.setOpacity === 'function') {
            layer.setOpacity(getInitialMapLayerOpacity(id));
        }
        applyMapLayerEffectToLayer(id, layer, getMapLayerEffect(id));
    });
    applySavedMapLayerStyles();
}

export function getMapLayerOpacity(id) {
    const layer = getMapLayerByOpacityId(id);
    return normalizeOpacity(layer?.options?.opacity, getMapLayerOpacityDefault(id));
}

export function getMapLayerOpacityLabel(id) {
    return mapLayerOpacityLabels[id] || '지도';
}

export function setMapLayerOpacity(id, value) {
    const opacity = normalizeOpacity(value, getMapLayerOpacityDefault(id));
    const layer = getMapLayerByOpacityId(id);
    if (layer && typeof layer.setOpacity === 'function') {
        layer.setOpacity(opacity);
    }
    persistMapLayerStylesIfEnabled();
    return opacity;
}

export function getMapLayerEffect(id) {
    return {
        invert: mapLayerEffects[id]?.invert === true,
        colorAdjust: normalizeColorAdjust(mapLayerEffects[id]?.colorAdjust)
    };
}

export function setMapLayerEffect(id, effect = {}) {
    const nextEffect = {
        invert: effect.invert === true,
        colorAdjust: normalizeColorAdjust(effect.colorAdjust)
    };
    mapLayerEffects[id] = nextEffect;
    applyMapLayerEffectToLayer(id, getMapLayerByOpacityId(id), nextEffect);
    persistMapLayerStylesIfEnabled();
    return getMapLayerEffect(id);
}

export function resetMapLayerStyle(id) {
    const opacity = setMapLayerOpacity(id, getMapLayerOpacityDefault(id));
    const effect = setMapLayerEffect(id, { invert: false, colorAdjust: normalizeColorAdjust() });
    return { opacity, ...effect };
}

export function saveCurrentMapLayerStyles() {
    localStorage.setItem(MAP_LAYER_STYLE_STORAGE_KEY, JSON.stringify(getAllMapLayerStyleState()));
}

export function clearSavedMapLayerStyles() {
    localStorage.removeItem(MAP_LAYER_STYLE_STORAGE_KEY);
}

export function applySavedMapLayerStyles() {
    if (!isMapSettingsSaveEnabled()) return;
    const savedStyles = loadSavedMapLayerStyles();
    isRestoringMapLayerStyles = true;
    Object.keys(mapLayerOpacityDefaults).forEach(id => {
        const savedStyle = savedStyles[id];
        if (!savedStyle || typeof savedStyle !== 'object') return;
        setMapLayerOpacity(id, savedStyle.opacity);
        setMapLayerEffect(id, {
            invert: savedStyle.invert,
            colorAdjust: savedStyle.colorAdjust
        });
    });
    isRestoringMapLayerStyles = false;
}

export function resetAllMapLayerStyles() {
    isRestoringMapLayerStyles = true;
    Object.keys(mapLayerOpacityDefaults).forEach(id => {
        setMapLayerOpacity(id, getMapLayerOpacityDefault(id));
        setMapLayerEffect(id, { invert: false, colorAdjust: normalizeColorAdjust() });
    });
    isRestoringMapLayerStyles = false;
    clearSavedMapLayerStyles();
}
