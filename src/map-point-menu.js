/* ==========================================================================
   [모듈] 지도 지점 선택 메뉴 (map-point-menu.js)
   [역할]
   - 지도 우클릭/롱프레스 지점에 임시 마커와 선택 메뉴를 표시합니다.
   - 위치 조회, 사용자지도 feature 속성 조회, 기록 바텀시트 조회를 연결합니다.
   [참고]
   - 지도 특정 지점에서 겹친 도형 선택 동작을 바꿀 때 확인합니다.
   ========================================================================== */
import { L } from './vendor-globals.js';
import { drawnItems, getUniqueRecordName, recordSvgRenderer } from './draw.js';
import { map } from './map.js';
import { SVG_ICONS } from './config.js';
import { copyText, createColoredMarkerIcon, getRecordName, setRecordName } from './utils.js';
import { AppState } from './state.js';
import { closeBottomSheet, fetchAndHighlightBoundary, flyToWithBottomSheet, getBottomSheetAwareFitOptions, openBottomSheet, setCurrentBottomSheetLayerId, showInfoPopup, suppressBottomSheetCloseOnMapMove } from './ui-bottomsheet.js';
import { updateLayerInfo } from './ui-layer-detail.js';
import { saveToStorage } from './data.js';
import { openSidebar, switchSidebarTab } from './ui-sidebar.js';
import { renderSurveyList } from './ui-project.js';
import { isLatLngHitLayer } from './map-hit-test.js';
import { escapeHtml } from './user-maps/utils.js';
import { findUserMapFeatureHitsAtLatLng } from './user-maps.js';

let pointMenuEl = null;
let pointMenuMarker = null;
let pointMenuLatLng = null;
let pointMenuRepositionBound = false;
let latestUserMapHits = [];
let latestRecordHits = [];
let currentUserMapFeatureHit = null;
let attributeModalEl = null;

const USER_MAP_LABEL_MAX_CHARS = 24;
const USER_MAP_PRIMARY_VALUE_MAX_CHARS = 12;
const POINT_MENU_MARKER_HEIGHT_PX = 36;

function ensurePointMenu() {
    if (pointMenuEl) return pointMenuEl;

    pointMenuEl = document.createElement('div');
    pointMenuEl.id = 'map-point-context-menu';
    pointMenuEl.style.cssText = [
        'position:fixed',
        'z-index:10050',
        'display:none',
        'visibility:hidden',
        'width:min(204px, calc(100vw - 24px))',
        'max-height:min(340px, calc(100vh - 96px))',
        'overflow:auto',
        'background:#fff',
        'border:1px solid rgba(15,23,42,0.12)',
        'border-radius:8px',
        'box-shadow:0 14px 34px rgba(15,23,42,0.22)',
        'padding:4px',
        'box-sizing:border-box',
        '-webkit-overflow-scrolling:touch'
    ].join(';');
    document.body.appendChild(pointMenuEl);
    const style = document.createElement('style');
    style.textContent = `
        #map-point-context-menu .map-point-menu-icon svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
            display: block;
        }
    `;
    document.head.appendChild(style);

    document.addEventListener('click', event => {
        if (pointMenuEl?.style.display === 'none') return;
        if (pointMenuEl.contains(event.target)) return;
        closeMapPointMenu({ removeMarker: false });
    }, true);

    return pointMenuEl;
}

function getMarkerScreenPosition(latlng) {
    const point = map.latLngToContainerPoint(latlng);
    const rect = map.getContainer().getBoundingClientRect();
    return { x: rect.left + point.x, y: rect.top + point.y };
}

function positionPointMenu(menu, position) {
    menu.style.display = 'block';
    menu.style.visibility = 'hidden';
    const margin = 8;
    const gap = 8;
    const width = menu.offsetWidth || 204;
    const height = menu.offsetHeight || 240;
    const left = Math.min(Math.max(margin, position.x - (width / 2)), window.innerWidth - width - margin);
    const topAbove = position.y - POINT_MENU_MARKER_HEIGHT_PX - height - gap;
    const topBelow = position.y + gap;
    const preferredTop = topAbove >= margin ? topAbove : topBelow;
    const top = Math.min(Math.max(margin, preferredTop), window.innerHeight - height - margin);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = 'visible';
}

function repositionOpenPointMenu() {
    if (!pointMenuEl || pointMenuEl.style.display === 'none' || !pointMenuLatLng) return;
    positionPointMenu(pointMenuEl, getMarkerScreenPosition(pointMenuLatLng));
}

function bindPointMenuRepositionEvents() {
    if (pointMenuRepositionBound) return;
    pointMenuRepositionBound = true;
    map.on('move zoom', repositionOpenPointMenu);
    window.addEventListener('resize', repositionOpenPointMenu);
}

function setPointMarker(latlng) {
    if (pointMenuMarker && map.hasLayer(pointMenuMarker)) map.removeLayer(pointMenuMarker);
    pointMenuMarker = L.marker(latlng, {
        icon: createColoredMarkerIcon('#FF0000'),
        interactive: false,
        keyboard: false
    }).addTo(map);
}

function getRecordHitsAtLatLng(latlng, options = {}) {
    const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 30;
    const hits = [];
    [...drawnItems.getLayers()].reverse().some(layer => {
        if (!layer?.feature?.properties || layer.feature.properties.isHidden === true) return false;
        if (!isLatLngHitLayer(layer, latlng, options)) return false;
        hits.push({ id: layer.feature.properties.id, layer });
        return hits.length >= limit;
    });
    return hits;
}

function getFeaturePrimaryValue(feature, item) {
    const props = feature?.properties || {};
    const representativeField = item?.representativeField;
    if (representativeField) {
        const representativeValue = props[representativeField];
        return representativeValue !== null && representativeValue !== undefined && String(representativeValue).trim() !== ''
            ? String(representativeValue)
            : '(값 없음)';
    }

    const ignoredFields = new Set([item?.categoryField, '__bbox'].filter(Boolean));
    const preferredFields = [
        'name', 'NAME', 'Name',
        '명칭', '이름', '지번', '주소',
        'pnu', 'PNU', 'JIBUN', 'A1'
    ].filter(field => field && !ignoredFields.has(field));

    for (const field of preferredFields) {
        const value = props[field];
        if (value !== null && value !== undefined && String(value).trim() !== '') return String(value);
    }

    const entry = Object.entries(props).find(([key, value]) =>
        !ignoredFields.has(key) &&
        value !== null &&
        value !== undefined &&
        typeof value !== 'object' &&
        String(value).trim() !== ''
    );
    return entry ? String(entry[1]) : '속성 정보';
}

function createUserMapHitLabel(hit, options = {}) {
    const primary = options.truncatePrimary
        ? truncateMenuLabel(getFeaturePrimaryValue(hit.feature, hit.item), USER_MAP_PRIMARY_VALUE_MAX_CHARS)
        : getFeaturePrimaryValue(hit.feature, hit.item);
    return `${hit.item?.name || '사용자지도'}_${primary}`;
}

function truncateMenuLabel(label, maxChars = USER_MAP_LABEL_MAX_CHARS) {
    const chars = Array.from(String(label || ''));
    if (chars.length <= maxChars) return chars.join('');
    return `${chars.slice(0, maxChars).join('')}...`;
}

function createRecordHitLabel(hit) {
    return getRecordName(hit.layer.feature?.properties || {}) || '기록';
}

function getGeometryIconFromType(type) {
    const normalizedType = String(type || '').toLowerCase();
    if (normalizedType.includes('point')) return SVG_ICONS.marker;
    if (normalizedType.includes('line')) return SVG_ICONS.ruler;
    if (normalizedType.includes('polygon')) return SVG_ICONS.polygon;
    return SVG_ICONS.polygon;
}

function getUserMapHitGeometryIcon(hit) {
    return getGeometryIconFromType(hit?.feature?.geometry?.type || hit?.item?.geometryType);
}

function getRecordHitGeometryIcon(hit) {
    const layer = hit?.layer;
    if (layer instanceof L.Marker) return SVG_ICONS.marker;
    if (layer instanceof L.Polygon) return SVG_ICONS.polygon;
    if (layer instanceof L.Polyline) return SVG_ICONS.ruler;
    return getGeometryIconFromType(layer?.feature?.geometry?.type);
}

function createMenuIcon(icon) {
    if (!icon) return '';
    return `<span class="map-point-menu-icon" aria-hidden="true"
        style="width:16px; height:16px; display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; color:#64748b;">${icon}</span>`;
}

function createMenuSection(title, itemsHtml, icon = '') {
    if (!itemsHtml) return '';
    return `
        <div class="map-point-menu-section" style="border-top:1px solid #eef2f7; margin-top:4px; padding-top:4px;">
            <div style="padding:6px 7px 3px; font-size:13px; line-height:1.35; font-weight:500; color:#111827; display:flex; align-items:center; gap:6px;">
                ${createMenuIcon(icon)}
                <span>${escapeHtml(title)}</span>
            </div>
            <div style="padding-left:14px;">
                ${itemsHtml}
            </div>
        </div>
    `;
}

function createMenuButton(label, action, index = '', options = {}) {
    const isChild = options.child === true;
    return `
        <button type="button" class="map-point-menu-item" data-action="${escapeHtml(action)}" data-index="${escapeHtml(index)}"
            title="${escapeHtml(options.title || label)}"
            style="width:100%; min-height:${isChild ? '27px' : '32px'}; border:0; border-radius:6px; background:#fff; color:#111827; padding:${isChild ? '4px 7px' : '6px 7px'}; text-align:left; font-size:${isChild ? '12px' : '13px'}; line-height:1.35; cursor:pointer; display:flex; align-items:center; gap:6px; overflow:hidden; white-space:nowrap;">
            ${createMenuIcon(options.icon || '')}
            <span style="min-width:0; overflow:hidden; text-overflow:ellipsis; font-weight:${isChild ? '400' : '500'};">${escapeHtml(label)}</span>
        </button>
    `;
}

function renderPointMenu() {
    const userMapItems = latestUserMapHits
        .map((hit, index) => {
            const label = createUserMapHitLabel(hit, { truncatePrimary: true });
            const fullLabel = createUserMapHitLabel(hit);
            return createMenuButton(truncateMenuLabel(label), 'user-map', String(index), {
                child: true,
                title: fullLabel,
                icon: getUserMapHitGeometryIcon(hit)
            });
        })
        .join('');
    const recordItems = latestRecordHits
        .map((hit, index) => createMenuButton(createRecordHitLabel(hit), 'record', String(index), {
            child: true,
            icon: getRecordHitGeometryIcon(hit)
        }))
        .join('');

    return `
        ${createMenuButton('위치 조회', 'location', '', { icon: SVG_ICONS.marker })}
        ${createMenuSection('사용자지도 조회', userMapItems, SVG_ICONS.map_layer)}
        ${createMenuSection('기록 조회', recordItems, SVG_ICONS.memo)}
    `;
}

function bindPointMenuActions(latlng) {
    pointMenuEl.querySelectorAll('.map-point-menu-item').forEach(button => {
        button.onmouseenter = () => { button.style.background = '#f3f4f6'; };
        button.onmouseleave = () => { button.style.background = '#fff'; };
        button.onclick = () => {
            const action = button.dataset.action;
            const index = Number(button.dataset.index);
            if (action === 'location') {
                closeMapPointMenu({ removeMarker: true });
                runLocationLookup(latlng);
            } else if (action === 'user-map') {
                const hit = latestUserMapHits[index];
                closeMapPointMenu({ removeMarker: true });
                if (hit) openUserMapFeatureBottomSheet(hit, latlng);
            } else if (action === 'record') {
                const hit = latestRecordHits[index];
                closeMapPointMenu({ removeMarker: true });
                if (hit?.layer?.openPopup) hit.layer.openPopup();
            }
        };
    });
}

export function runLocationLookup(latlng) {
    showInfoPopup(latlng.lat, latlng.lng);
    fetchAndHighlightBoundary(latlng.lng, latlng.lat);
}

function createAttributeRows(feature) {
    const props = feature?.properties || {};
    return Object.entries(props)
        .filter(([key]) => key !== '__bbox')
        .map(([key, value]) => {
            const textValue = value ?? '';
            return `
            <div style="display:grid; grid-template-columns:minmax(72px, 36%) 1fr; gap:8px; padding:8px 0; border-bottom:1px solid #f3f4f6;">
                <div style="font-size:12px; font-weight:700; color:#4b5563; word-break:break-all;">${escapeHtml(key)}</div>
                <div class="user-map-attribute-copy-value" data-copy-value="${escapeHtml(textValue)}"
                    title="클릭해서 복사"
                    style="font-size:13px; color:#111827; line-height:1.45; word-break:break-all; white-space:pre-wrap; cursor:pointer;">${escapeHtml(textValue)}</div>
            </div>
        `;
        })
        .join('');
}

function getDisplayPropertyEntries(feature, limit = 3) {
    const props = feature?.properties || {};
    const entries = Object.entries(props).filter(([key, value]) =>
        key !== '__bbox' &&
        value !== null &&
        value !== undefined &&
        typeof value !== 'object' &&
        String(value).trim() !== ''
    );

    const preferredNames = ['name', 'NAME', 'Name', '명칭', '이름', '지번', '주소', 'pnu', 'PNU', 'JIBUN', 'A1'];
    const preferred = [];
    const rest = [];
    entries.forEach(entry => {
        if (preferredNames.includes(entry[0])) preferred.push(entry);
        else rest.push(entry);
    });
    return [...preferred, ...rest].slice(0, limit);
}

function createSummaryRow(label, value) {
    return `
        <div style="display:grid; grid-template-columns:74px 1fr; gap:8px; align-items:start; padding:4px 0;">
            <div style="font-size:12px; font-weight:700; color:#4b5563;">${escapeHtml(label)}</div>
            <div style="font-size:13px; color:#111827; line-height:1.4; word-break:break-all;">${escapeHtml(value || '-')}</div>
        </div>
    `;
}

function createPropertyPreview(feature) {
    const entries = getDisplayPropertyEntries(feature, 3);
    if (!entries.length) {
        return '<div style="font-size:12px; color:#9ca3af; padding:4px 0;">미리볼 속성이 없습니다.</div>';
    }

    return entries.map(([key, value]) => createSummaryRow(key, value)).join('');
}

function ensureAttributeModal() {
    if (attributeModalEl) return attributeModalEl;

    attributeModalEl = document.createElement('div');
    attributeModalEl.id = 'user-map-feature-attribute-modal';
    attributeModalEl.className = 'nav-modal-overlay';
    attributeModalEl.style.zIndex = '10070';
    attributeModalEl.style.alignItems = 'center';
    attributeModalEl.style.justifyContent = 'center';
    attributeModalEl.innerHTML = `
        <div id="user-map-feature-attribute-panel" onclick="event.stopPropagation()"
            style="width:min(420px, calc(100vw - 32px)); max-height:60vh; overflow:auto; background:#fff; border-radius:10px; padding:16px; box-sizing:border-box;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px;">
                <div id="user-map-feature-attribute-title" style="font-size:16px; font-weight:800; color:#111827;">속성 정보</div>
                <button type="button" id="user-map-feature-attribute-close"
                    style="width:32px; height:32px; border:0; border-radius:50%; background:#f3f4f6; color:#6b7280; font-size:20px; line-height:1; cursor:pointer;">&times;</button>
            </div>
            <div id="user-map-feature-attribute-body"></div>
        </div>
    `;
    document.body.appendChild(attributeModalEl);
    attributeModalEl.onclick = closeUserMapFeatureAttributeModal;
    attributeModalEl.querySelector('#user-map-feature-attribute-close').onclick = closeUserMapFeatureAttributeModal;
    return attributeModalEl;
}

function closeUserMapFeatureAttributeModal() {
    if (!attributeModalEl) return;
    attributeModalEl.classList.remove('visible');
    attributeModalEl.style.display = 'none';
}

function openUserMapFeatureAttributeModal(hit) {
    const modal = ensureAttributeModal();
    const title = modal.querySelector('#user-map-feature-attribute-title');
    const body = modal.querySelector('#user-map-feature-attribute-body');
    if (title) title.textContent = createUserMapHitLabel(hit);
    if (body) {
        const rows = createAttributeRows(hit.feature);
        body.innerHTML = rows || '<div style="font-size:13px; color:#6b7280; padding:10px 0;">표시할 속성 정보가 없습니다.</div>';
        body.querySelectorAll('.user-map-attribute-copy-value').forEach(el => {
            el.onclick = () => copyText(el.dataset.copyValue || el.innerText, false, '속성값');
        });
    }
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));
}

function highlightUserMapFeature(feature) {
    if (!feature?.geometry) return null;
    if (AppState.currentBoundaryLayer && map.hasLayer(AppState.currentBoundaryLayer)) {
        map.removeLayer(AppState.currentBoundaryLayer);
    }

    AppState.currentBoundaryLayer = L.geoJSON(feature, {
        pointToLayer: (_feature, pointLatLng) => L.circleMarker(pointLatLng, {
            radius: 8,
            color: '#FF0000',
            weight: 4,
            opacity: 0.9,
            fillColor: '#FF0000',
            fillOpacity: 0.15,
            interactive: false
        }),
        style: {
            renderer: recordSvgRenderer,
            color: '#FF0000',
            weight: 4,
            opacity: 0.9,
            fillColor: '#FF0000',
            fillOpacity: 0,
            interactive: false
        }
    }).addTo(map);

    if (typeof AppState.currentBoundaryLayer.bringToFront === 'function') {
        AppState.currentBoundaryLayer.bringToFront();
    }
    return AppState.currentBoundaryLayer;
}

async function addUserMapFeatureAsRecord(hit) {
    if (!hit?.feature?.geometry) return;
    const recordName = getUniqueRecordName(createUserMapHitLabel(hit));
    const feature = JSON.parse(JSON.stringify(hit.feature));
    feature.properties = setRecordName({
        ...(feature.properties || {}),
        id: Date.now() + Math.floor(Math.random() * 1000),
        customColor: '#FF0000',
        customStrokeColor: null,
        customFillColor: '#FF0000',
        customWeight: 3,
        customLineStyle: 'solid',
        customDashArray: null,
        customFillPattern: 'none',
        customFillOpacity: 0,
        isHidden: false
    }, recordName);
    delete feature.properties.__bbox;

    const createdLayers = [];
    L.geoJSON(feature, {
        pointToLayer: (_feature, latlng) => L.marker(latlng, { icon: createColoredMarkerIcon('#FF0000') }),
        style: {
            color: '#FF0000',
            weight: 3,
            opacity: 0.8,
            fillColor: '#FF0000',
            fillOpacity: 0,
            lineCap: 'round',
            lineJoin: 'round'
        },
        onEachFeature: (createdFeature, layer) => {
            layer.feature = createdFeature;
            updateLayerInfo(layer);
            drawnItems.addLayer(layer);
            createdLayers.push(layer);
        }
    });

    await saveToStorage();
    renderSurveyList();
    openSidebar();
    switchSidebarTab('record');
    if (createdLayers[0]?.openPopup) createdLayers[0].openPopup();
}

function centerUserMapFeatureHighlight(highlightLayer, fallbackLatLng) {
    if (highlightLayer?.getBounds) {
        const bounds = highlightLayer.getBounds();
        if (bounds?.isValid?.()) {
            suppressBottomSheetCloseOnMapMove();
            map.fitBounds(bounds, getBottomSheetAwareFitOptions({ basePadding: 70, maxZoom: 19 }));
            return;
        }
    }

    flyToWithBottomSheet(fallbackLatLng, map.getZoom(), { animate: true, duration: 0.25 });
}

function openUserMapFeatureBottomSheet(hit, latlng) {
    currentUserMapFeatureHit = hit;
    const title = createUserMapHitLabel(hit);
    const typeIcon = getUserMapHitGeometryIcon(hit);
    const body = `
        <div style="min-width:210px;">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px; padding-right:40px;">
                <span style="width:20px; height:18px; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:#3B82F6;">${typeIcon}</span>
                <span style="font-size:16px; color:#3B82F6; font-weight:bold; line-height:1.25; word-break:break-all;">${escapeHtml(title)}</span>
            </div>
            <div style="margin-bottom:12px;">
                ${createPropertyPreview(hit.feature)}
            </div>
            <div style="display:flex; gap:8px;">
                <button type="button" id="user-map-feature-attribute-btn" class="popup-btn"
                    style="flex:1; background:#fff; color:#555; border:1px solid #ddd;">전체 속성 확인</button>
                <button type="button" id="user-map-feature-add-record-btn" class="popup-btn"
                    style="flex:1; background:#007bff; color:#fff; border:1px solid #007bff;">기록으로 추가</button>
            </div>
        </div>
    `;

    setCurrentBottomSheetLayerId(null);
    const moreBtn = document.getElementById('bottom-sheet-more-btn');
    if (moreBtn) moreBtn.style.display = 'none';
    const highlightLayer = highlightUserMapFeature(hit.feature);
    openBottomSheet(title, body);
    const attributeBtn = document.getElementById('user-map-feature-attribute-btn');
    const addRecordBtn = document.getElementById('user-map-feature-add-record-btn');
    if (attributeBtn) attributeBtn.onclick = () => openUserMapFeatureAttributeModal(currentUserMapFeatureHit);
    if (addRecordBtn) addRecordBtn.onclick = async () => {
        addRecordBtn.disabled = true;
        addRecordBtn.textContent = '추가 중...';
        try {
            await addUserMapFeatureAsRecord(currentUserMapFeatureHit);
        } catch (error) {
            console.error(error);
            alert(`기록으로 추가하지 못했습니다.\n${error.message || error}`);
            addRecordBtn.disabled = false;
            addRecordBtn.textContent = '기록으로 추가';
        }
    };
    centerUserMapFeatureHighlight(highlightLayer, latlng);
}

export function openMapPointMenu(event, latlng) {
    if (!latlng) return;
    const sourceEvent = event?.originalEvent || event;
    if (sourceEvent) {
        if (typeof sourceEvent.preventDefault === 'function') L.DomEvent.preventDefault(sourceEvent);
        if (typeof sourceEvent.stopPropagation === 'function') L.DomEvent.stopPropagation(sourceEvent);
    }

    const menu = ensurePointMenu();
    bindPointMenuRepositionEvents();
    closeBottomSheet({ recenter: false });
    pointMenuLatLng = L.latLng(latlng);
    setPointMarker(latlng);
    latestUserMapHits = findUserMapFeatureHitsAtLatLng(latlng, { limit: 30 });
    latestRecordHits = getRecordHitsAtLatLng(latlng, { limit: 30 });
    menu.innerHTML = renderPointMenu();
    bindPointMenuActions(latlng);
    positionPointMenu(menu, getMarkerScreenPosition(pointMenuLatLng));
}

export function closeMapPointMenu(options = {}) {
    if (pointMenuEl) {
        pointMenuEl.style.display = 'none';
        pointMenuEl.style.visibility = 'hidden';
    }
    pointMenuLatLng = null;
    latestUserMapHits = [];
    latestRecordHits = [];
    if (options.removeMarker === true && pointMenuMarker && map.hasLayer(pointMenuMarker)) {
        map.removeLayer(pointMenuMarker);
        pointMenuMarker = null;
    }
}
