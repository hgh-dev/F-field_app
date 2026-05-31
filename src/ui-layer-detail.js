/* ==========================================================================
   [모듈] 기록 상세 정보 렌더링 (ui-layer-detail.js)
   [역할]
   - 선택한 점/선/면 기록의 이름, 좌표, 길이, 면적, 사진 정보를 화면에 그립니다.
   - 바텀시트와 목록에서 사용하는 상세 표시 내용을 구성합니다.
   [참고]
   - 기록 상세 정보 값이나 표시 형식이 이상할 때 확인합니다.
   ========================================================================== */
import { SVG_ICONS } from './config.js';
import { AppState } from './state.js';
import { map } from './map.js';
import { drawnItems, currentEditLayerId } from './draw.js';
import { convertToDms, ensureRecordNameAlias, getRecordName, getTmCoords, calculateProjectedLengthMeters, calculateProjectedAreaM2 } from './utils.js';
import { saveToStorage } from './data.js';
import { scheduleViewportVectorOptimization } from './ui-viewport.js';
import { getLayerFillOpacity, syncFillPatternOverlays, syncSolidDotOverlays } from './ui-style-modal.js';
import { createLayerPhotoSection } from './ui-photo.js';
import { flyToWithBottomSheet, getBottomSheetAwareFitOptions, setCurrentBottomSheetLayerId, openBottomSheet, closeBottomSheet, syncBottomSheetHoleMenuForLayer } from './ui-bottomsheet.js';
import { renderSurveyList } from './ui-project.js';

/* --------------------------------------------------------------------------
   7. 레이어 상세 및 관리 (Layer Detail & Management)
   -------------------------------------------------------------------------- */
/* 7-1. 상세 팝업, 가시성, 이동, 공유 */

/**
 * 숨김/표시 상태에 따라 레이어 상호작용 가능 여부를 동기화합니다.
 */
function setLayerInteractivity(layer, isInteractive) {
    if (layer instanceof L.Marker) {
        layer.options.interactive = isInteractive;
        const pointerEvents = isInteractive ? 'auto' : 'none';
        const applyMarkerPointerEvents = () => {
            if (layer._icon) layer._icon.style.pointerEvents = pointerEvents;
            if (layer._shadow) layer._shadow.style.pointerEvents = pointerEvents;
        };
        if (layer._icon || layer._shadow) applyMarkerPointerEvents();
        else layer.once('add', applyMarkerPointerEvents);
        return;
    }

    const pointerEvents = isInteractive ? 'visiblePainted' : 'none';
    if (layer._path) layer._path.style.pointerEvents = pointerEvents;
    else layer.once('add', () => { if (layer._path) layer._path.style.pointerEvents = pointerEvents; });
}

/**
 * 레이어 설정(채우기/선표시)에 맞는 가시 상태를 계산해 반영합니다.
 */
export function applyLayerVisibilityState(layer, isHidden = layer?.feature?.properties?.isHidden === true) {
    if (!layer || !layer.feature?.properties) return;
    layer.feature.properties.isHidden = isHidden;

    if (isHidden) {
        if (layer instanceof L.Marker) {
            layer.setOpacity(0);
        } else {
            layer.setStyle({ opacity: 0, fillOpacity: 0, stroke: false });
        }
        layer.closePopup();
        setLayerInteractivity(layer, false);
        syncSolidDotOverlays();
        syncFillPatternOverlays();
        return;
    }

    if (layer instanceof L.Marker) {
        layer.setOpacity(1);
    } else {
        const fillOpacity = getLayerFillOpacity(layer);
        const stroke = layer.feature?.properties?.customDashArray !== 'none';
        layer.setStyle({ opacity: 1, fillOpacity, stroke });
    }
    setLayerInteractivity(layer, true);
    syncSolidDotOverlays();
    syncFillPatternOverlays();
}


/**
 * [함수] updateLayerInfo
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 레이어 타입(점/선/면)에 따라 좌표·거리·면적 표시값을 계산하고,
 *        팝업 이벤트와 바텀시트 동작을 재바인딩해 선택/편집 흐름을 일관되게 유지한다.
 */
export function updateLayerInfo(layer) {
    ensureRecordNameAlias(layer.feature.properties);
    const memo = getRecordName(layer.feature.properties, "");
    const typeIcon = (layer instanceof L.Marker)
        ? SVG_ICONS.marker
        : (layer instanceof L.Polygon ? SVG_ICONS.polygon : (layer.feature.properties?.isTrack ? SVG_ICONS.track : SVG_ICONS.ruler));
    let infoText = "";
    if (layer instanceof L.Marker) {
        const pos = layer.getLatLng();
        if (AppState.coordMode === 2) infoText = "X:" + getTmCoords(pos.lat, pos.lng).x + ", Y:" + getTmCoords(pos.lat, pos.lng).y;
        else if (AppState.coordMode === 1) infoText = "N " + pos.lat.toFixed(4) + "° , E " + pos.lng.toFixed(4) + "°";
        else infoText = convertToDms(pos.lat, 'lat') + ", " + convertToDms(pos.lng, 'lng');
    } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
        infoText = "<b>거리:</b> " + calculateProjectedLengthMeters(layer.toGeoJSON()).toFixed(2) + " m";
    } else if (layer instanceof L.Polygon) {
        const areaM2 = calculateProjectedAreaM2(layer.toGeoJSON());
        const areaPyeong = areaM2 * 0.3025;
        infoText = "<b>면적:</b> " + areaM2.toFixed(2) + " ㎡ (" + areaPyeong.toFixed(2) + "평)";
    }

    let popupContent = `<div style="display:flex; align-items:center; gap:6px; margin-bottom:5px;">
        <span style="width:20px; height:18px; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:#3B82F6;">${typeIcon}</span>
        <span style="font-size:16px; color:#3B82F6; font-weight:bold;">${memo}</span>
        <button onclick="editLayerMemo(${layer.feature.properties.id})" title="기록명 수정" style="background:none; border:none; padding:0; cursor:pointer; color:#3B82F6; opacity:0.7; display:flex; align-items:center;">
            <svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:#3B82F6;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
    </div><hr style="margin: 12px 0; border: none; border-top: 1px solid #f0f0f0;">`;

    if (infoText) {
        if (layer instanceof L.Marker) {
            popupContent += `<div style="display:flex; align-items:baseline; font-size: 14px; color: #555; margin-bottom: 15px;"><span class="badge-coord" style="flex-shrink:0; width:36px; display:inline-block; text-align:center;">좌표</span><div style="margin-left: 5px; line-height: 1.5;">${infoText}</div></div>`;
        } else {
            popupContent += `<div style="font-size:14px; color:#666; line-height:1.5; margin-bottom:15px;">${infoText}</div>`;
        }
    }

    const id = layer.feature.properties.id;
    popupContent += `<div class="bottom-sheet-extra"><div class="extra-inner">`;
    const description = layer.feature.properties.description || "";
    if (description) popupContent += `<div style="background:#f8f9fa; padding:8px; border-radius:6px; white-space:pre-wrap; font-size:14px; color:#333; line-height:1.5; margin: 15px 0;">${description}</div>`;

    const photos = layer.feature.properties.photos || [];
    const photoSection = createLayerPhotoSection(id, photos);
    popupContent += photoSection.thumbnailsHtml;

    popupContent += `<div style="${photoSection.gridStyle}">
        ${photoSection.inputElementsHtml}
        <button onclick="editLayerDescription(${id})" class="popup-btn" style="background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;">
            <svg viewBox="0 0 24 24" style="width:14px; height:14px; fill:#555;"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>메모
        </button>
        ${photoSection.actionButtonHtml}
    </div></div></div>`;

    applyLayerVisibilityState(layer, layer.feature?.properties?.isHidden === true);

    layer.off('click').on('click', function (e) {
        if (layer.feature?.properties?.isHidden === true) return;
        if (AppState.currentDrawer || currentEditLayerId !== null) return;
        AppState.isLayerClicked = true;
        setTimeout(() => { AppState.isLayerClicked = false; }, 50);
        if (e && e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
        setCurrentBottomSheetLayerId(id);
        const moreBtn = document.getElementById('bottom-sheet-more-btn');
        if (moreBtn) moreBtn.style.display = 'flex';
        syncBottomSheetHoleMenuForLayer(layer);
        openBottomSheet(memo || '측량 기록', popupContent);
        document.getElementById('bottom-sheet').classList.add('full-open');
        if (layer instanceof L.Marker) flyToWithBottomSheet(layer.getLatLng(), Math.max(map.getZoom(), 17), { duration: 0.5 });
        else map.fitBounds(layer.getBounds(), getBottomSheetAwareFitOptions({ basePadding: 60, maxZoom: 19 }));
    });


    layer.openPopup = function () {
        setCurrentBottomSheetLayerId(id);
        const moreBtn = document.getElementById('bottom-sheet-more-btn');
        if (moreBtn) moreBtn.style.display = 'flex';
        syncBottomSheetHoleMenuForLayer(layer);
        openBottomSheet(memo || '측량 기록', popupContent);
        document.getElementById('bottom-sheet').classList.add('full-open');
        if (layer instanceof L.Marker) flyToWithBottomSheet(layer.getLatLng(), Math.max(map.getZoom(), 17), { duration: 0.5 });
        else map.fitBounds(layer.getBounds(), getBottomSheetAwareFitOptions({ basePadding: 60, maxZoom: 19 }));
        return this;
    };
    layer.closePopup = function () { closeBottomSheet(); return this; };
}
/**
 * [함수] toggleLayerVisibility
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleLayerVisibility(id) {
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (layer) {
        const isHidden = !layer.feature.properties.isHidden;
        applyLayerVisibilityState(layer, isHidden);
        saveToStorage();
        renderSurveyList();
        scheduleViewportVectorOptimization();
    }
}
