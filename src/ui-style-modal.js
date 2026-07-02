/* ==========================================================================
   [모듈] 기록 스타일 설정 (ui-style-modal.js)
   [역할]
   - 점/선/면 기록의 색상, 선 모양, 두께, 채우기, 마커 모양을 수정하는 모달을 관리합니다.
   - 임시 스타일 상태를 적용/취소하고 지도 레이어와 목록 표시를 동기화합니다.
   [참고]
   - 스타일 설정 바텀시트/모달이나 기록 색상 표시가 이상할 때 확인합니다.
   ========================================================================== */
import { drawnItems } from './draw.js';
import { map } from './map.js';
import { saveToStorage } from './data.js';
import { createColoredMarkerIcon, getLineStyleDashArray, getLineStyleFromDashArray, normalizeFillPattern, normalizeMarkerStyle } from './utils.js';
import { renderSurveyList } from './ui-project.js';
import { scheduleViewportVectorOptimization } from './ui-viewport.js';

/* --------------------------------------------------------------------------
   7-2. 스타일 설정 모달 (Style Modal)
   -------------------------------------------------------------------------- */
let currentStyleLayerId = null;
let currentStyleType = null;
let tempStyleColor = '#3B82F6';
let tempLineStyle = 'solid';
let tempLineWeight = 3;
let tempMarkerStyle = '';
let tempMarkerSize = 3;
let tempFillOpacity = 0.2;
let tempFillPattern = 'solid';
let tempTileOpacity = 1;
let tempTileDefaultOpacity = 1;
let tempTileInvert = false;
let tempTileColorAdjust = { red: 0, green: 0, blue: 0, yellow: 0 };
let externalStyleTarget = null;
let currentStyleTab = 'fill';
let tempFillColor = '#3388ff';
let tempLineColor = '#3388ff';
let tempLineColorMode = 'same';
let solidDotOverlayLayer = null;
let solidDotOverlayRenderer = null;
let fillPatternOverlayLayer = null;
let fillPatternSvgRenderer = null;

const STYLE_PALETTE_COLORS = [
    '#7F1D1D', '#B91C1C', '#FF0000', '#EF4444', '#F87171', '#FEE2E2',
    '#C2410C', '#F97316', '#FB923C', '#FFFF00', '#F59E0B', '#FEF3C7',
    '#064E3B', '#047857', '#00FF00', '#10B981', '#34D399', '#D1FAE5',
    '#00FFFF', '#0891B2', '#22D3EE', '#1E3A8A', '#3B82F6', '#DBEAFE',
    '#0000FF', '#1D4ED8', '#4C1D95', '#6D28D9', '#8B5CF6', '#EDE9FE',
    '#FF00FF', '#EC4899', '#000000', '#9CA3AF', '#FFFFFF'
];

const STYLE_BASIC_COLORS = [
    '#FF0000', '#FF7A00', '#FFFF00', '#00FF00', '#00B050', '#00FFFF',
    '#0070C0', '#0000FF', '#7030A0', '#FF00FF', '#000000', '#FFFFFF'
];


const STYLE_EXTENDED_COLORS = [
    null, '#FBE4EA', '#FBEAD9', '#FCF2D2', '#FCF8C9', '#E8FAE7', '#E1FAEE', '#DDF8F8', '#D9ECF8', '#D9E2F7', '#EBD8F8', '#F8DDF3', '#FBE3ED',
    '#E6E6E6', '#F7B9C2', '#F8D3B0', '#F8E3A6', '#FBF6A1', '#D8F7C9', '#C9F4D9', '#BDF2E8', '#B8DDF5', '#B4C8F4', '#D8A9F3', '#F2B4ED', '#F5B7CF',
    '#CFCFCF', '#FA8A93', '#F9BE8B', '#F7DA84', '#F8F577', '#C7F0A8', '#90E8BE', '#7FE4D4', '#84C8F0', '#89A7EF', '#C17EEB', '#EB83E8', '#F090B9',
    '#B5B5B5', '#FC6370', '#FAA85F', '#F8CF52', '#F7F533', '#AEEF8A', '#5EE49A', '#44DFD1', '#57B1EC', '#658BEA', '#B85FEB', '#EB55EA', '#F15F9F',
    '#999999', '#FF404D', '#FF9A43', '#FFD02F', '#FFF000', '#9EEF79', '#39E58D', '#16DDD2', '#29A0E9', '#4773ED', '#AA48EA', '#EA45E6', '#F34B8C',
    '#777777', '#FF0018', '#FF8615', '#FFC000', '#FFF000', '#76EF41', '#00E67C', '#0FDCC9', '#1798E8', '#1F58EF', '#9E2CEA', '#F214DE', '#F5247B',
    '#555555', '#F80010', '#FF6A00', '#F6AC00', '#ECDC00', '#67DF39', '#00D66C', '#10CDB9', '#0D7EE0', '#113DE4', '#9500E8', '#EE12D6', '#F51570',
    '#3F3F3F', '#E90000', '#ED5700', '#E39F00', '#D5CF00', '#58C735', '#00C361', '#11BDA8', '#056AD0', '#002BD7', '#8200D6', '#DF12B8', '#EA0060',
    '#303030', '#C90000', '#C94700', '#BA8700', '#B7B000', '#4DAA33', '#00A954', '#109E8D', '#0057B2', '#001FB9', '#6D00BA', '#C3179D', '#C90055',
    '#202020', '#960000', '#8F3200', '#865E00', '#848000', '#386D27', '#00763C', '#0B6D61', '#00427E', '#00116F', '#4B007F', '#8A126C', '#900047',
    '#000000', '#5F0000', '#621F00', '#5C3D00', '#565900', '#214A19', '#004C28', '#004A43', '#002F59', '#000B4D', '#300052', '#5A0A48', '#610031'
];

function renderStyleColorPalette(paletteId, selectFnName, pickerId) {
    const palette = document.getElementById(paletteId);
    if (!palette || palette.dataset.ready === 'true') return;

    const basicButtons = STYLE_BASIC_COLORS.map(color => `
        <button type="button" class="color-circle" data-color="${color}" style="background-color:${color};"
            onclick="${selectFnName}('${color}')" aria-label="${color}"></button>
    `).join('');
    const extendedButtons = STYLE_EXTENDED_COLORS.map(color => color
        ? `<button type="button" class="color-circle" data-color="${color}" style="background-color:${color};"
            onclick="${selectFnName}('${color}')" aria-label="${color}"></button>`
        : '<span class="palette-grid-spacer" aria-hidden="true"></span>'
    ).join('');

    palette.innerHTML = `
        <div class="palette-basic-row">
            <div class="palette-basic-swatches">${basicButtons}</div>
            <button type="button" class="palette-expand-btn" onclick="toggleStylePalette('${paletteId}')" aria-label="색상표 더보기">+</button>
        </div>
        <div class="palette-grid">${extendedButtons}</div>
        <label for="${pickerId}" class="palette-color-view-btn">사용자 색상</label>
        <input type="color" id="${pickerId}" class="color-picker-input" onchange="${selectFnName}(this.value)">
    `;
    palette.dataset.ready = 'true';
}

function resetStyleColorPalettes() {
    document.querySelectorAll('.color-palette.expanded').forEach(palette => palette.classList.remove('expanded'));
}

function resetStyleMoreOptions() {
    const lineStyleChoices = document.getElementById('style-line-choices');
    const lineStyleMoreBtn = document.getElementById('style-line-more-btn');
    const fillPatternChoices = document.getElementById('style-fill-pattern-choices');
    const fillPatternMoreBtn = document.getElementById('style-fill-pattern-more-btn');
    const markerChoices = document.getElementById('style-marker-choices');
    const markerEmojiMoreBtn = document.getElementById('style-marker-emoji-more-btn');

    lineStyleChoices?.classList.remove('expanded');
    lineStyleMoreBtn?.classList.remove('expanded');
    fillPatternChoices?.classList.remove('expanded');
    fillPatternMoreBtn?.classList.remove('expanded');
    markerChoices?.classList.remove('expanded');
    markerEmojiMoreBtn?.classList.remove('expanded');
}

function normalizeOpacityValue(value, fallback = 0.2) {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(1, Math.max(0, Math.round(parsed * 20) / 20));
}

function normalizeTileColorAdjust(value = {}) {
    return ['red', 'green', 'blue', 'yellow'].reduce((result, channel) => {
        const parsed = Number(value[channel]);
        result[channel] = Number.isFinite(parsed) ? Math.min(100, Math.max(-100, Math.round(parsed))) : 0;
        return result;
    }, {});
}

function normalizeLineWeight(value, fallback = 3) {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(5, Math.max(1, Math.round(parsed * 2) / 2));
}

function formatSliderValue(value) {
    return Number(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function getVisiblePolygonFillOpacity(pattern, opacity) {
    const normalizedPattern = normalizeFillPattern(pattern);
    if (normalizedPattern === 'none') return 0;
    if (normalizedPattern !== 'solid') return 0;
    return normalizeOpacityValue(opacity, 0);
}

function getLayerStoredFillOpacity(layer) {
    if (!(layer instanceof L.Polygon)) return 0;

    const props = layer.feature?.properties || {};
    const pattern = normalizeFillPattern(props.customFillPattern);
    if (pattern === 'none') return 0;
    if (Number.isFinite(Number(props.customFillOpacity))) {
        return normalizeOpacityValue(props.customFillOpacity, 0.2);
    }
    if (props.customFill === false) return 0;
    if (props.customFill === true) return 0.2;
    return 0.2;
}

export function getLayerFillOpacity(layer) {
    if (!(layer instanceof L.Polygon)) return 0;

    const props = layer.feature?.properties || {};
    const pattern = normalizeFillPattern(props.customFillPattern);
    if (pattern === 'none') return 0;
    if (Number.isFinite(Number(props.customFillOpacity))) {
        return getVisiblePolygonFillOpacity(pattern, props.customFillOpacity);
    }
    if (props.customFill === false) return 0;
    if (props.customFill === true) return 0.2;
    return 0;
}

function ensureLineColorPalette() {
    renderStyleColorPalette('style-line-color-palette', 'selectLineStyleColor', 'style-line-custom-color');
}

function ensureFillColorPalette() {
    renderStyleColorPalette('style-color-palette', 'selectStyleColor', 'style-custom-color');
}

function getSolidDotOverlayLayer() {
    if (!map.getPane('solidDotOverlayPane')) {
        map.createPane('solidDotOverlayPane');
        map.getPane('solidDotOverlayPane').style.zIndex = 620;
        map.getPane('solidDotOverlayPane').style.pointerEvents = 'none';
    }
    if (!solidDotOverlayRenderer) {
        solidDotOverlayRenderer = L.svg({ pane: 'solidDotOverlayPane', padding: 0.5 });
    }
    if (!solidDotOverlayLayer) {
        solidDotOverlayLayer = L.layerGroup().addTo(map);
    }
    return solidDotOverlayLayer;
}

function getFillPatternOverlayLayer() {
    if (!fillPatternOverlayLayer) {
        fillPatternOverlayLayer = L.layerGroup().addTo(map);
    }
    return fillPatternOverlayLayer;
}

function getFillPatternRenderer() {
    if (!fillPatternSvgRenderer) {
        fillPatternSvgRenderer = L.svg({ padding: 0.5 });
    }
    return fillPatternSvgRenderer;
}

function ensureFillPatternDefs(renderer) {
    const svg = renderer?._container;
    if (!svg || svg.querySelector('#ffield-fill-pattern-defs')) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.id = 'ffield-fill-pattern-defs';
    svg.insertBefore(defs, svg.firstChild);
}

function buildFillPatternMarkup(patternId, pattern, color, opacity) {
    const strokeColor = color || '#333333';
    const strokeOpacity = Math.min(1, Math.max(0, Number(opacity) || 0));
    const strokeAttrs = `stroke="${strokeColor}" stroke-opacity="${strokeOpacity}" fill="none"`;

    switch (pattern) {
    case 'horizontal':
        return `<pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
            <path d="M0 4 H8" ${strokeAttrs} stroke-width="1.4" />
        </pattern>`;
    case 'vertical':
        return `<pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
            <path d="M4 0 V8" ${strokeAttrs} stroke-width="1.4" />
        </pattern>`;
    case 'diagonal-right':
        return `<pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
            <path d="M-2 10 L10 -2" ${strokeAttrs} stroke-width="1.2" />
        </pattern>`;
    case 'diagonal-left':
        return `<pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
            <path d="M-2 -2 L10 10" ${strokeAttrs} stroke-width="1.2" />
        </pattern>`;
    case 'grid':
        return `<pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
            <path d="M0 4 H8 M4 0 V8" ${strokeAttrs} stroke-width="1.1" />
        </pattern>`;
    case 'crosshatch':
        return `<pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8">
            <path d="M-2 10 L10 -2 M-2 -2 L10 10" ${strokeAttrs} stroke-width="1" />
        </pattern>`;
    default:
        return '';
    }
}

function ensureLayerFillPattern(renderer, pattern, color, opacity) {
    const svg = renderer?._container;
    if (!svg) return null;

    ensureFillPatternDefs(renderer);
    const defs = svg.querySelector('#ffield-fill-pattern-defs');
    if (!defs) return null;

    const safeColor = String(color || '#333333').replace('#', '').toLowerCase();
    const opacityKey = Math.round(Math.min(1, Math.max(0, Number(opacity) || 0)) * 100);
    const patternId = `ffield-fill-${pattern}-${safeColor}-${opacityKey}`;
    if (!defs.querySelector(`#${patternId}`)) {
        const markup = buildFillPatternMarkup(patternId, pattern, color, opacity);
        if (!markup) return null;
        defs.insertAdjacentHTML('beforeend', markup);
    }
    return patternId;
}

function isLatLngPoint(value) {
    return value && typeof value.lat === 'number' && typeof value.lng === 'number';
}

function collectLatLngSegments(latlngs, segments = []) {
    if (!Array.isArray(latlngs) || latlngs.length === 0) return segments;
    if (isLatLngPoint(latlngs[0])) {
        if (latlngs.length > 1) segments.push(latlngs);
        return segments;
    }
    latlngs.forEach(child => collectLatLngSegments(child, segments));
    return segments;
}

function addSolidDotOverlayForLayer(layer) {
    if (!layer || layer instanceof L.Marker || typeof layer.getLatLngs !== 'function') return;
    const props = layer.feature?.properties || {};
    if (props.customLineStyle !== 'solid-dot' || props.isHidden === true) return;

    const weight = Math.min(5, Math.max(1, parseFloat(props.customWeight || layer.options?.weight || 3)));
    const color = props.customStrokeColor || props.customColor || layer.options?.color || '#333333';
    const dotWeight = Math.max(3, weight * 3);
    const dotLength = Math.max(0.01, dotWeight * 0.08);
    const gapLength = Math.max(48, dotWeight * 8);
    const overlay = getSolidDotOverlayLayer();
    const segments = collectLatLngSegments(layer.getLatLngs());
    const isPolygonLayer = layer instanceof L.Polygon;

    segments.forEach(segment => {
        if (!segment || segment.length < 2) return;
        const dotLineLatLngs = [...segment];
        if (isPolygonLayer && segment.length > 2) {
            const first = segment[0];
            const last = segment[segment.length - 1];
            if (first.lat !== last.lat || first.lng !== last.lng) dotLineLatLngs.push(first);
        }

        const dotLine = L.polyline(dotLineLatLngs, {
            pane: 'solidDotOverlayPane',
            renderer: solidDotOverlayRenderer,
            color,
            opacity: 1,
            weight: dotWeight,
            dashArray: `${dotLength}, ${gapLength}`,
            lineCap: 'round',
            lineJoin: 'round',
            fill: false,
            interactive: false,
            bubblingMouseEvents: false
        }).addTo(overlay);
        if (typeof dotLine.bringToFront === 'function') dotLine.bringToFront();
    });
}

export function syncSolidDotOverlays() {
    const overlay = getSolidDotOverlayLayer();
    overlay.clearLayers();
    drawnItems.getLayers().forEach(addSolidDotOverlayForLayer);
    if (solidDotOverlayRenderer?._container) {
        solidDotOverlayRenderer._container.style.zIndex = '620';
    }
}

function getFillPatternId(pattern) {
    const normalized = normalizeFillPattern(pattern);
    return normalized === 'solid' || normalized === 'none' ? null : `ffield-fill-${normalized}`;
}

function addFillPatternOverlayForLayer(layer) {
    if (!(layer instanceof L.Polygon) || typeof layer.getLatLngs !== 'function') return;
    const props = layer.feature?.properties || {};
    const pattern = normalizeFillPattern(props.customFillPattern);
    if (pattern === 'solid' || pattern === 'none' || props.isHidden === true) return;

    const fillOpacity = normalizeOpacityValue(props.customFillOpacity, 0);
    if (fillOpacity <= 0) return;
    const fillColor = props.customFillColor || props.customColor || layer.options?.fillColor || layer.options?.color || '#3388ff';

    const renderer = getFillPatternRenderer();
    const patternLayer = L.polygon(layer.getLatLngs(), {
        renderer,
        interactive: false,
        bubblingMouseEvents: false,
        stroke: false,
        fill: true,
        fillOpacity: 1,
        fillColor
    }).addTo(getFillPatternOverlayLayer());

    const applyPattern = () => {
        const patternId = ensureLayerFillPattern(renderer, pattern, fillColor, fillOpacity);
        if (patternLayer._path && patternId) {
            patternLayer._path.setAttribute('fill', `url(#${patternId})`);
            patternLayer._path.style.pointerEvents = 'none';
        }
    };
    if (patternLayer._path) applyPattern();
    else patternLayer.once('add', applyPattern);
}

export function syncFillPatternOverlays() {
    const overlay = getFillPatternOverlayLayer();
    overlay.clearLayers();
    drawnItems.getLayers().forEach(addFillPatternOverlayForLayer);
}

/**
 * [함수] openStyleModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openStyleModal(id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    ensureFillColorPalette();
    ensureLineColorPalette();
    resetStyleColorPalettes();
    resetStyleMoreOptions();

    externalStyleTarget = null;
    currentStyleLayerId = id;
    const props = layer.feature.properties || {};

    tempStyleColor = props.customColor || (layer instanceof L.Marker ? '#FF0000' : '#3388ff');
    tempFillColor = props.customFillColor || props.customColor || '#3388ff';
    tempLineColor = props.customStrokeColor || props.customColor || '#3388ff';
    tempLineColorMode = props.customStrokeColor ? 'custom' : 'same';
    tempLineStyle = props.customLineStyle || getLineStyleFromDashArray(props.customDashArray);
    tempLineWeight = Number.isFinite(Number(props.customWeight)) ? normalizeLineWeight(props.customWeight) : 3;
    tempMarkerStyle = normalizeMarkerStyle(props.customEmoji || '');
    tempMarkerSize = props.customMarkerSize || 3;
    tempFillPattern = normalizeFillPattern(props.customFillPattern);

    const overlay = document.getElementById('style-modal-overlay');
    const tabs = document.getElementById('style-polygon-tabs');
    const fillColorSec = document.getElementById('style-fill-color-section');
    const lineSec = document.getElementById('style-line-section');
    const lineColorSec = document.getElementById('style-line-color-section');
    const lineWeightSec = document.getElementById('style-line-weight-section');
    const markerSec = document.getElementById('style-marker-section');
    const polySec = document.getElementById('style-polygon-section');
    const fillPatternSec = document.getElementById('style-fill-pattern-section');
    const markerSizeSec = document.getElementById('style-marker-size-section');
    const tileOpacitySec = document.getElementById('style-tile-opacity-section');
    const tileEffectSec = document.getElementById('style-tile-effect-section');
    if (tileOpacitySec) tileOpacitySec.style.display = 'none';
    if (tileEffectSec) tileEffectSec.style.display = 'none';

    if (layer instanceof L.Marker) {
        currentStyleType = 'marker';
        currentStyleTab = 'fill';
        if (tabs) tabs.style.display = 'none';
        if (fillColorSec) fillColorSec.style.display = 'block';
        if (lineColorSec) lineColorSec.style.display = 'none';
        if (lineSec) lineSec.style.display = 'none';
        if (lineWeightSec) lineWeightSec.style.display = 'none';
        if (markerSec) markerSec.style.display = 'block';
        if (markerSizeSec) markerSizeSec.style.display = 'block';
        if (polySec) polySec.style.display = 'none';
    } else if (layer instanceof L.Polygon) {
        currentStyleType = 'polygon';
        currentStyleTab = 'fill';
        if (tabs) tabs.style.display = 'flex';
        if (fillColorSec) fillColorSec.style.display = 'block';
        if (lineColorSec) lineColorSec.style.display = 'none';
        if (lineSec) lineSec.style.display = 'none';
        if (lineWeightSec) lineWeightSec.style.display = 'none';
        if (markerSec) markerSec.style.display = 'none';
        if (markerSizeSec) markerSizeSec.style.display = 'none';
        if (polySec) polySec.style.display = 'block';
        tempFillOpacity = getLayerStoredFillOpacity(layer);
    } else {
        currentStyleType = 'line';
        currentStyleTab = 'line';
        if (tabs) tabs.style.display = 'none';
        if (fillColorSec) fillColorSec.style.display = 'block';
        if (lineColorSec) lineColorSec.style.display = 'none';
        if (lineSec) lineSec.style.display = 'block';
        if (lineWeightSec) lineWeightSec.style.display = 'block';
        if (markerSec) markerSec.style.display = 'none';
        if (markerSizeSec) markerSizeSec.style.display = 'none';
        if (polySec) polySec.style.display = 'none';
    }

    // 컬러피커 초기값 동기화
    const colorPicker = document.getElementById('style-custom-color');
    if (colorPicker && tempStyleColor.startsWith('#')) {
        colorPicker.value = tempStyleColor.substring(0, 7);
    }

    updateStyleModalUI();

    if (overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('visible'), 10);
    }
}

export function openStyleModalForExternalLayer({ id, type = 'polygon', style = {}, onApply }) {
    ensureFillColorPalette();
    ensureLineColorPalette();
    resetStyleColorPalettes();
    resetStyleMoreOptions();

    externalStyleTarget = { id, type, onApply, effectsEnabled: style.effectsEnabled !== false };
    currentStyleLayerId = id;
    currentStyleType = type === 'tile' ? 'tile' : (type === 'marker' ? 'marker' : (type === 'line' ? 'line' : 'polygon'));

    tempStyleColor = style.customColor || style.color || style.fillColor || '#3388ff';
    tempFillColor = style.customFillColor || style.fillColor || style.customColor || '#3388ff';
    tempLineColor = style.customStrokeColor || style.color || style.customColor || tempFillColor;
    tempLineColorMode = (style.customStrokeColor || (style.color && style.color !== tempFillColor)) ? 'custom' : 'same';
    tempLineStyle = style.stroke === false
        ? 'none'
        : (style.customLineStyle || getLineStyleFromDashArray(style.customDashArray || style.dashArray));
    tempLineWeight = Number.isFinite(Number(style.customWeight || style.weight))
        ? normalizeLineWeight(style.customWeight || style.weight)
        : 3;
    tempMarkerStyle = normalizeMarkerStyle(style.customEmoji || '');
    tempMarkerSize = Number.isFinite(Number(style.customMarkerSize))
        ? Math.min(5, Math.max(1, parseInt(style.customMarkerSize, 10)))
        : 3;
    tempFillOpacity = normalizeOpacityValue(style.customFillOpacity ?? style.fillOpacity, 0.2);
    tempFillPattern = normalizeFillPattern(style.customFillPattern);
    tempTileInvert = style.invert === true;
    tempTileColorAdjust = normalizeTileColorAdjust(style.colorAdjust);

    const overlay = document.getElementById('style-modal-overlay');
    const tabs = document.getElementById('style-polygon-tabs');
    const fillColorSec = document.getElementById('style-fill-color-section');
    const lineSec = document.getElementById('style-line-section');
    const lineColorSec = document.getElementById('style-line-color-section');
    const lineWeightSec = document.getElementById('style-line-weight-section');
    const markerSec = document.getElementById('style-marker-section');
    const polySec = document.getElementById('style-polygon-section');
    const markerSizeSec = document.getElementById('style-marker-size-section');
    const tileOpacitySec = document.getElementById('style-tile-opacity-section');
    const tileEffectSec = document.getElementById('style-tile-effect-section');

    tempTileOpacity = normalizeOpacityValue(style.opacity, 1);
    tempTileDefaultOpacity = normalizeOpacityValue(style.defaultOpacity, 1);
    currentStyleTab = currentStyleType === 'polygon' ? 'fill' : 'line';
    if (tabs) tabs.style.display = currentStyleType === 'polygon' ? 'flex' : 'none';
    if (fillColorSec) fillColorSec.style.display = currentStyleType === 'tile' ? 'none' : 'block';
    if (lineColorSec) lineColorSec.style.display = 'none';
    if (lineSec) lineSec.style.display = currentStyleType === 'line' ? 'block' : 'none';
    if (lineWeightSec) lineWeightSec.style.display = currentStyleType === 'line' ? 'block' : 'none';
    if (markerSec) markerSec.style.display = currentStyleType === 'marker' ? 'block' : 'none';
    if (markerSizeSec) markerSizeSec.style.display = currentStyleType === 'marker' ? 'block' : 'none';
    if (polySec) polySec.style.display = currentStyleType === 'polygon' ? 'block' : 'none';
    if (tileOpacitySec) tileOpacitySec.style.display = currentStyleType === 'tile' ? 'block' : 'none';
    if (tileEffectSec) tileEffectSec.style.display = currentStyleType === 'tile' && externalStyleTarget.effectsEnabled ? 'block' : 'none';

    const colorPicker = document.getElementById('style-custom-color');
    if (colorPicker && tempStyleColor.startsWith('#')) {
        colorPicker.value = tempStyleColor.substring(0, 7);
    }

    updateStyleModalUI();

    if (overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('visible'), 10);
    }
}

/**
 * [함수] closeStyleModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeStyleModal() {
    const overlay = document.getElementById('style-modal-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
        setTimeout(() => { if (!overlay.classList.contains('visible')) overlay.style.display = 'none'; }, 300);
    }
    externalStyleTarget = null;
}

/**
 * [함수] updateStyleModalUI
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
function updateStyleModalUI() {
    ensureFillColorPalette();
    ensureLineColorPalette();

    const isPolygon = currentStyleType === 'polygon';
    const isTile = currentStyleType === 'tile';
    const fillTabBtn = document.getElementById('style-fill-tab-btn');
    const lineTabBtn = document.getElementById('style-line-tab-btn');
    if (fillTabBtn) fillTabBtn.classList.toggle('selected', currentStyleTab === 'fill');
    if (lineTabBtn) lineTabBtn.classList.toggle('selected', currentStyleTab === 'line');

    const fillColorSec = document.getElementById('style-fill-color-section');
    const polySec = document.getElementById('style-polygon-section');
    const fillPatternSec = document.getElementById('style-fill-pattern-section');
    const lineColorSec = document.getElementById('style-line-color-section');
    const lineSec = document.getElementById('style-line-section');
    const lineWeightSec = document.getElementById('style-line-weight-section');
    const markerSec = document.getElementById('style-marker-section');
    const markerSizeSec = document.getElementById('style-marker-size-section');
    const tileOpacitySec = document.getElementById('style-tile-opacity-section');
    const tileEffectSec = document.getElementById('style-tile-effect-section');
    const colorTitle = document.getElementById('style-color-title');

    if (colorTitle) colorTitle.innerText = isPolygon ? '면 색상 선택' : '색상 선택';
    if (fillColorSec) fillColorSec.style.display = !isTile && (!isPolygon || currentStyleTab === 'fill') ? 'block' : 'none';
    if (polySec) polySec.style.display = !isTile && isPolygon && currentStyleTab === 'fill' ? 'block' : 'none';
    if (fillPatternSec) fillPatternSec.style.display = !isTile && isPolygon && currentStyleTab === 'fill' && !externalStyleTarget ? 'block' : 'none';
    if (lineColorSec) lineColorSec.style.display = !isTile && isPolygon && currentStyleTab === 'line' ? 'block' : 'none';
    if (lineSec) lineSec.style.display = !isTile && ((!isPolygon && currentStyleType !== 'marker') || (isPolygon && currentStyleTab === 'line')) ? 'block' : 'none';
    if (lineWeightSec) lineWeightSec.style.display = !isTile && ((!isPolygon && currentStyleType !== 'marker') || (isPolygon && currentStyleTab === 'line')) ? 'block' : 'none';
    if (markerSec) markerSec.style.display = currentStyleType === 'marker' ? 'block' : 'none';
    if (markerSizeSec) markerSizeSec.style.display = currentStyleType === 'marker' ? 'block' : 'none';
    if (tileOpacitySec) tileOpacitySec.style.display = isTile ? 'block' : 'none';
    if (tileEffectSec) tileEffectSec.style.display = isTile && externalStyleTarget?.effectsEnabled !== false ? 'block' : 'none';

    const activeFillColor = isPolygon ? tempFillColor : tempStyleColor;
    document.querySelectorAll('#style-color-palette .color-circle').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === activeFillColor);
    });
    document.querySelectorAll('#style-line-color-mode-choices .style-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.mode === tempLineColorMode);
    });
    const linePalette = document.getElementById('style-line-color-palette');
    if (linePalette) linePalette.style.display = tempLineColorMode === 'custom' ? 'flex' : 'none';
    document.querySelectorAll('#style-line-color-palette .color-circle').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === tempLineColor);
    });
    document.querySelectorAll('#style-line-choices .style-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.style === tempLineStyle);
    });
    const lineStyleChoices = document.getElementById('style-line-choices');
    const lineStyleMoreBtn = document.getElementById('style-line-more-btn');
    if (lineStyleMoreBtn) lineStyleMoreBtn.classList.toggle('expanded', lineStyleChoices?.classList.contains('expanded'));
    document.querySelectorAll('#style-fill-pattern-choices .style-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.pattern === tempFillPattern);
    });
    const fillPatternChoices = document.getElementById('style-fill-pattern-choices');
    const fillPatternMoreBtn = document.getElementById('style-fill-pattern-more-btn');
    if (fillPatternMoreBtn) fillPatternMoreBtn.classList.toggle('expanded', fillPatternChoices?.classList.contains('expanded'));
    document.querySelectorAll('#style-marker-section .emoji-btn').forEach(btn => {
        const markerStyle = btn.dataset.markerStyle ?? btn.dataset.emoji ?? '';
        btn.classList.toggle('selected', markerStyle === tempMarkerStyle);
    });
    const markerChoices = document.getElementById('style-marker-choices');
    const markerEmojiMoreBtn = document.getElementById('style-marker-emoji-more-btn');
    if (markerEmojiMoreBtn) markerEmojiMoreBtn.classList.toggle('expanded', markerChoices?.classList.contains('expanded'));
    const sizeInput = document.getElementById('style-marker-size');
    const sizeLabel = document.getElementById('style-marker-size-label');
    if (sizeInput) sizeInput.value = tempMarkerSize;
    if (sizeLabel) sizeLabel.innerText = tempMarkerSize;

    const tileOpacityInput = document.getElementById('style-tile-opacity');
    const tileOpacityLabel = document.getElementById('style-tile-opacity-label');
    if (tileOpacityInput) tileOpacityInput.value = tempTileOpacity;
    if (tileOpacityLabel) tileOpacityLabel.innerText = formatSliderValue(tempTileOpacity);
    const tileInvertInput = document.getElementById('style-tile-invert');
    if (tileInvertInput) tileInvertInput.checked = tempTileInvert;
    Object.entries(tempTileColorAdjust).forEach(([channel, value]) => {
        const input = document.getElementById(`style-tile-${channel}`);
        const label = document.getElementById(`style-tile-${channel}-label`);
        if (input) input.value = value;
        if (label) label.innerText = String(value);
    });

    const weightInput = document.getElementById('style-line-weight');
    const weightLabel = document.getElementById('style-line-weight-label');
    const isNoLineStyle = tempLineStyle === 'none';
    if (weightInput) {
        weightInput.value = tempLineWeight;
        weightInput.disabled = isNoLineStyle;
        weightInput.style.opacity = isNoLineStyle ? '0.45' : '1';
        weightInput.style.cursor = isNoLineStyle ? 'not-allowed' : '';
    }
    if (weightLabel) {
        weightLabel.innerText = isNoLineStyle ? '-' : formatSliderValue(tempLineWeight);
        weightLabel.style.color = isNoLineStyle ? '#9ca3af' : '';
    }

    const fillOpacityInput = document.getElementById('style-fill-opacity');
    const fillOpacityLabel = document.getElementById('style-fill-opacity-label');
    const isNoFillPattern = tempFillPattern === 'none';
    if (fillOpacityInput) {
        fillOpacityInput.value = isNoFillPattern ? 0 : tempFillOpacity;
        fillOpacityInput.disabled = isNoFillPattern;
        fillOpacityInput.style.opacity = isNoFillPattern ? '0.45' : '1';
        fillOpacityInput.style.cursor = isNoFillPattern ? 'not-allowed' : '';
    }
    if (fillOpacityLabel) {
        fillOpacityLabel.innerText = isNoFillPattern ? '0' : formatSliderValue(tempFillOpacity);
        fillOpacityLabel.style.color = isNoFillPattern ? '#9ca3af' : '';
    }

    const colorPicker = document.getElementById('style-custom-color');
    if (colorPicker && activeFillColor.startsWith('#')) colorPicker.value = activeFillColor.substring(0, 7);
    const lineColorPicker = document.getElementById('style-line-custom-color');
    if (lineColorPicker && tempLineColor.startsWith('#')) lineColorPicker.value = tempLineColor.substring(0, 7);
}

/**
 * [함수] selectStyleColor
 * [역할] 선택값을 임시 상태로 반영하고 UI를 동기화한다.
 * [원리] 사용자 선택값을 임시 상태(temp*)에 기록하고,
 *        선택 UI를 다시 칠해 현재 선택 항목이 시각적으로 즉시 반영되게 한다.
 */
export function selectStyleColor(color) {
    if (currentStyleType === 'polygon') {
        tempFillColor = color;
        if (tempLineColorMode === 'same') tempLineColor = color;
    } else {
        tempStyleColor = color;
    }
    updateStyleModalUI();
    if (color && color.startsWith('#')) {
        const picker = document.getElementById('style-custom-color');
        if (picker) picker.value = color.substring(0, 7);
    }
}

export function selectStyleTab(tab) {
    currentStyleTab = tab === 'line' ? 'line' : 'fill';
    updateStyleModalUI();
}

export function selectLineColorMode(mode) {
    tempLineColorMode = mode === 'custom' ? 'custom' : 'same';
    if (tempLineColorMode === 'same') tempLineColor = tempFillColor;
    updateStyleModalUI();
}

export function selectLineStyleColor(color) {
    tempLineColorMode = 'custom';
    tempLineColor = color;
    updateStyleModalUI();
}

export function toggleStylePalette(paletteId) {
    const palette = document.getElementById(paletteId);
    if (!palette) return;
    palette.classList.toggle('expanded');
}

export function openStyleColorPicker(pickerId) {
    const picker = document.getElementById(pickerId);
    if (!picker) return;
    picker.click();
}

/**
 * [함수] selectLineStyle
 * [역할] 선택값을 임시 상태로 반영하고 UI를 동기화한다.
 * [원리] 사용자 선택값을 임시 상태(temp*)에 기록하고,
 *        선택 UI를 다시 칠해 현재 선택 항목이 시각적으로 즉시 반영되게 한다.
 */
export function selectLineStyle(style) {
    tempLineStyle = style;
    updateStyleModalUI();
}

export function toggleLineStyleOptions() {
    const lineStyleChoices = document.getElementById('style-line-choices');
    const lineStyleMoreBtn = document.getElementById('style-line-more-btn');
    if (!lineStyleChoices) return;
    lineStyleChoices.classList.toggle('expanded');
    if (lineStyleMoreBtn) lineStyleMoreBtn.classList.toggle('expanded', lineStyleChoices.classList.contains('expanded'));
}

/**
 * [함수] updateLineWeightLabel
 * [역할] 선 굵기 슬라이더 값을 화면 라벨에 반영한다.
 * [원리] 임시 선택값을 1~5 범위 숫자로 정규화한 뒤 표시값과 상태를 함께 갱신한다.
 */
export function updateLineWeightLabel(val) {
    tempLineWeight = normalizeLineWeight(val);
    const weightLabel = document.getElementById('style-line-weight-label');
    if (weightLabel) weightLabel.innerText = formatSliderValue(tempLineWeight);
}

/**
 * [함수] selectLineWeight
 * [역할] 선택한 선 굵기를 임시 상태로 저장한다.
 * [원리] 슬라이더 입력값을 1~5 범위로 제한해 적용 시 레이어 스타일에 사용한다.
 */
export function selectLineWeight(val) {
    tempLineWeight = normalizeLineWeight(val);
    updateStyleModalUI();
}

/**
 * [함수] updateFillOpacityLabel
 * [역할] 면 투명도 슬라이더 값을 화면 라벨에 반영한다.
 * [원리] 입력값을 0~1 범위의 0.1 단위 값으로 정규화해 임시 상태와 라벨을 함께 갱신한다.
 */
export function updateFillOpacityLabel(val) {
    tempFillOpacity = normalizeOpacityValue(val, 0);
    const fillOpacityLabel = document.getElementById('style-fill-opacity-label');
    if (fillOpacityLabel) fillOpacityLabel.innerText = formatSliderValue(tempFillOpacity);
}

/**
 * [함수] selectFillOpacity
 * [역할] 선택한 면 투명도를 임시 상태로 저장한다.
 * [원리] 슬라이더 입력값을 정규화한 뒤 스타일 모달 UI와 적용 대기 상태를 동기화한다.
 */
export function selectFillOpacity(val) {
    tempFillOpacity = normalizeOpacityValue(val, 0);
    updateStyleModalUI();
}

export function updateTileOpacityLabel(val) {
    tempTileOpacity = normalizeOpacityValue(val, 1);
    const tileOpacityLabel = document.getElementById('style-tile-opacity-label');
    if (tileOpacityLabel) tileOpacityLabel.innerText = formatSliderValue(tempTileOpacity);
}

export function selectTileOpacity(val) {
    tempTileOpacity = normalizeOpacityValue(val, 1);
    updateStyleModalUI();
}

export function toggleTileInvert(checked) {
    tempTileInvert = checked === true || checked === 'true';
    updateStyleModalUI();
}

export function updateTileColorAdjust(channel, value) {
    if (!['red', 'green', 'blue', 'yellow'].includes(channel)) return;
    tempTileColorAdjust = normalizeTileColorAdjust({
        ...tempTileColorAdjust,
        [channel]: value
    });
    updateStyleModalUI();
}

export function resetTileStyleSettings() {
    tempTileOpacity = tempTileDefaultOpacity;
    tempTileInvert = false;
    tempTileColorAdjust = normalizeTileColorAdjust();
    updateStyleModalUI();
}

export function selectFillPattern(pattern) {
    tempFillPattern = normalizeFillPattern(pattern);
    if (tempFillPattern === 'none') tempFillOpacity = 0;
    else if (tempFillOpacity === 0) tempFillOpacity = 0.2;
    updateStyleModalUI();
}

export function toggleFillPatternOptions() {
    const fillPatternChoices = document.getElementById('style-fill-pattern-choices');
    const fillPatternMoreBtn = document.getElementById('style-fill-pattern-more-btn');
    if (!fillPatternChoices) return;
    fillPatternChoices.classList.toggle('expanded');
    if (fillPatternMoreBtn) fillPatternMoreBtn.classList.toggle('expanded', fillPatternChoices.classList.contains('expanded'));
}

/**
 * [함수] selectMarkerStyle
 * [역할] 선택값을 임시 상태로 반영하고 UI를 동기화한다.
 * [원리] 사용자 선택값을 임시 상태(temp*)에 기록하고,
 *        선택 UI를 다시 칠해 현재 선택 항목이 시각적으로 즉시 반영되게 한다.
 */
export function selectMarkerStyle(markerStyle) {
    tempMarkerStyle = normalizeMarkerStyle(markerStyle);
    updateStyleModalUI();
}

export function toggleMarkerEmojiOptions() {
    const markerChoices = document.getElementById('style-marker-choices');
    const markerEmojiMoreBtn = document.getElementById('style-marker-emoji-more-btn');
    if (!markerChoices) return;
    markerChoices.classList.toggle('expanded');
    if (markerEmojiMoreBtn) markerEmojiMoreBtn.classList.toggle('expanded', markerChoices.classList.contains('expanded'));
}

/**
 * [함수] updateMarkerSizeLabel
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
export function updateMarkerSizeLabel(val) {
    const sizeLabel = document.getElementById('style-marker-size-label');
    if (sizeLabel) sizeLabel.innerText = val;
}

/**
 * [함수] selectMarkerSize
 * [역할] 선택값을 임시 상태로 반영하고 UI를 동기화한다.
 * [원리] 사용자 선택값을 임시 상태(temp*)에 기록하고,
 *        선택 UI를 다시 칠해 현재 선택 항목이 시각적으로 즉시 반영되게 한다.
 */
export function selectMarkerSize(val) {
    tempMarkerSize = parseInt(val, 10);
}

/**
 * [함수] applyStyleSettings
 * [역할] 임시 설정값을 실제 상태와 화면에 확정 반영한다.
 * [원리] 임시 상태로 보관한 설정값을 실제 데이터/레이어 속성에 커밋한 뒤,
 *        저장과 목록 재렌더를 수행해 적용 결과를 전체 UI에 동기화한다.
 */
export function applyStyleSettings() {
    if (externalStyleTarget && currentStyleType === 'tile') {
        externalStyleTarget.onApply?.({
            opacity: tempTileOpacity,
            invert: tempTileInvert,
            colorAdjust: tempTileColorAdjust
        });
        closeStyleModal();
        return;
    }

    const appliedFillColor = currentStyleType === 'polygon' ? tempFillColor : tempStyleColor;
    const appliedLineColor = currentStyleType === 'polygon'
        ? (tempLineColorMode === 'same' ? tempFillColor : tempLineColor)
        : tempStyleColor;
    const appliedFillOpacity = currentStyleType === 'polygon'
        ? getVisiblePolygonFillOpacity(tempFillPattern, tempFillOpacity)
        : 0;

    if (externalStyleTarget) {
        if (currentStyleType === 'marker') {
            externalStyleTarget.onApply?.({
                color: tempStyleColor,
                customColor: tempStyleColor,
                customEmoji: tempMarkerStyle,
                customMarkerSize: tempMarkerSize
            });
            closeStyleModal();
            return;
        }

        const customDashArray = getLineStyleDashArray(tempLineStyle, tempLineWeight);

        externalStyleTarget.onApply?.({
            color: appliedLineColor,
            fillColor: appliedFillColor,
            weight: tempLineWeight,
            opacity: 0.8,
            fillOpacity: appliedFillOpacity,
            dashArray: customDashArray === 'none' ? null : customDashArray,
            lineCap: 'round',
            lineJoin: 'round',
            stroke: customDashArray !== 'none',
            customColor: appliedFillColor,
            customFillColor: appliedFillColor,
            customStrokeColor: currentStyleType === 'polygon' && tempLineColorMode === 'custom' ? appliedLineColor : null,
            customWeight: tempLineWeight,
            customLineStyle: tempLineStyle,
            customDashArray,
            customFillOpacity: currentStyleType === 'polygon' ? tempFillOpacity : 0
        });
        closeStyleModal();
        return;
    }

    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === currentStyleLayerId);
    if (!layer) return;

    const props = layer.feature.properties;
    props.customColor = appliedFillColor;

    if (currentStyleType === 'marker') {
        props.customEmoji = tempMarkerStyle;
        props.customMarkerSize = tempMarkerSize;
        layer.setIcon(createColoredMarkerIcon(tempStyleColor, tempMarkerStyle, tempMarkerSize));
    } else {
        props.customWeight = tempLineWeight;

        props.customLineStyle = tempLineStyle;
        props.customDashArray = getLineStyleDashArray(tempLineStyle, tempLineWeight);

        if (currentStyleType === 'polygon') {
            props.customFillColor = appliedFillColor;
            if (tempLineColorMode === 'custom') props.customStrokeColor = appliedLineColor;
            else delete props.customStrokeColor;
            props.customFillOpacity = tempFillOpacity;
            props.customFillPattern = tempFillPattern;
            delete props.customFill;
        }

        layer.setStyle({
            color: appliedLineColor,
            fillColor: appliedFillColor,
            weight: tempLineWeight,
            dashArray: props.customDashArray === 'none' ? null : props.customDashArray,
            lineCap: 'round',
            lineJoin: 'round',
            stroke: props.customDashArray !== 'none',
            fillOpacity: appliedFillOpacity,
            opacity: 0.8
        });
    }

    saveToStorage();
    renderSurveyList();
    syncSolidDotOverlays();
    syncFillPatternOverlays();
    scheduleViewportVectorOptimization();
    closeStyleModal();
}
