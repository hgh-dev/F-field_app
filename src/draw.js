/* ==========================================================================
   [모듈] 기록 그리기와 편집 (draw.js)
   [역할]
   - 지도에서 점/선/면 기록을 새로 만들고, 기존 기록을 단건 편집합니다.
   - Leaflet.Draw 상태, 그리기 완료/취소, GPS 좌표 주입, 기록 저장 호출을 관리합니다.
   [참고]
   - 사용자가 직접 그리는 기록의 생성/편집 흐름을 바꿀 때 확인합니다.
   ========================================================================== */
import { map } from './map.js';
import { AppState } from './state.js';
import { updateLayerInfo, renderSurveyList, switchSidebarTab, highlightButton, resetButtonStyles, openBottomSheet, closeBottomSheet, currentBottomSheetLayerId, setCurrentBottomSheetLayerId, syncFillPatternOverlays, syncSolidDotOverlays } from './ui.js';
import { getRandomColor, getTimestampString, createColoredMarkerIcon, setRecordingModeActive, setRecordName } from './utils.js';
import { saveToStorage } from './data.js';
import { requestWakeLock, releaseWakeLock } from './wake-lock.js';
import { showAppConfirm, showTextPrompt } from './app-dialog.js';
import {
    clearSnapGuide,
    configureDrawSnap,
    getSnapResult,
    getSnappedLatLng,
    normalizeLatLng,
    setSnapEnabled,
    syncSnapToggleButtons,
    updateSnapGuide
} from './draw-snap.js';

export { setSnapEnabled, syncSnapToggleButtons };



/* ==========================================================================
   1) 초기화/공용 상태
   ========================================================================== */
// 모바일 환경에서 Polyline 터치 이벤트가 중복 처리되는 문제를 막기 위한 패치입니다.
// 원리: 내부 _onTouch 핸들러를 noop으로 바꿔 터치 드로잉 오작동을 우회합니다.
L.Draw.Polyline.prototype._onTouch = function (e) { return; };

// Leaflet.draw 1.0.x가 더 이상 권장되지 않는 L.Polyline._flat을 참조해 경고를 내는 문제를
// 현재 Leaflet API로 연결합니다.
if (L.LineUtil?.isFlat && L.Polyline && L.Polyline._flat !== L.LineUtil.isFlat) {
    L.Polyline._flat = L.LineUtil.isFlat;
}

// Leaflet.draw 기본 영문 툴팁/버튼 문구를 한국어로 덮어씁니다.
if (L.drawLocal?.draw?.toolbar?.buttons) {
    L.drawLocal.draw.toolbar.buttons.polyline = '선 기록';
    L.drawLocal.draw.toolbar.buttons.polygon = '면 기록';
    L.drawLocal.draw.toolbar.buttons.marker = '점 기록';
}

if (L.drawLocal?.draw?.handlers?.marker?.tooltip) {
    L.drawLocal.draw.handlers.marker.tooltip.start = '지도를 눌러 점을 기록하세요.';
}

if (L.drawLocal?.draw?.handlers?.polyline?.tooltip) {
    L.drawLocal.draw.handlers.polyline.tooltip.start = '지도를 눌러 선 기록을 시작하세요.';
    L.drawLocal.draw.handlers.polyline.tooltip.cont = '지도를 눌러 다음 점을 추가하세요.';
    L.drawLocal.draw.handlers.polyline.tooltip.end = '마지막 점을 다시 누르거나 기록 완료를 눌러 저장하세요.';
}

if (L.drawLocal?.draw?.handlers?.polygon?.tooltip) {
    L.drawLocal.draw.handlers.polygon.tooltip.start = '지도를 눌러 면 기록을 시작하세요.';
    L.drawLocal.draw.handlers.polygon.tooltip.cont = '지도를 눌러 다음 점을 추가하세요.';
    L.drawLocal.draw.handlers.polygon.tooltip.end = '첫 점을 다시 누르거나 기록 완료를 눌러 저장하세요.';
}

if (L.drawLocal?.draw?.handlers?.simpleshape?.tooltip) {
    L.drawLocal.draw.handlers.simpleshape.tooltip.end = '마우스를 놓아 그리기를 마치세요.';
}


// 앱에서 관리하는 모든 사용자 도형이 모이는 레이어 그룹입니다.
// 원리: 개별 레이어 대신 그룹 단위로 add/remove/edit 대상을 통일하면 제어가 단순해집니다.
export const drawnItems = new L.FeatureGroup();
// 현재 편집 중인 레이어 ID (없으면 null)
export let currentEditLayerId = null;
// 편집 취소/되돌리기용 원본 좌표 스냅샷
export let editLayerOriginalLatLng = null;
let selectedEditVertex = null;
let isEditMapClickBound = false;
map.addLayer(drawnItems);
configureDrawSnap({ drawnItems });

// Leaflet.draw 가상 버텍스(중간점) 아이콘 커스터마이징
// 원리: _createMiddleMarker를 감싸 middle marker를 "+" 형태로 바꿔
// "새 버텍스 추가 지점"임을 시각적으로 구분합니다.
(function () {
    if (L.Edit && L.Edit.PolyVerticesEdit) {
        const origCreateMiddleMarker = L.Edit.PolyVerticesEdit.prototype._createMiddleMarker;
        L.Edit.PolyVerticesEdit.prototype._createMiddleMarker = function (marker1, marker2) {
            origCreateMiddleMarker.call(this, marker1, marker2);
            // Leaflet.draw 1.0.x에서는 생성된 middle marker 참조가 marker1._middleRight에 들어갑니다.
            const middleMarker = marker1._middleRight;
            if (middleMarker) {
                const vertexIcon = this.options?.icon || new L.DivIcon({
                    iconSize: new L.Point(10, 10),
                    className: 'leaflet-div-icon leaflet-editing-icon'
                });
                const restorePromotedMarkerIcon = () => {
                    middleMarker.off('dragstart click touchmove', restorePromotedMarkerIcon);
                    requestAnimationFrame(() => {
                        if (!middleMarker._map) return;
                        middleMarker.setIcon(vertexIcon);
                        middleMarker.setOpacity(1);
                    });
                };

                middleMarker.setIcon(L.divIcon({
                    html: '+',
                    iconSize: new L.Point(14, 14),
                    className: 'leaflet-div-icon leaflet-editing-icon leaflet-middle-icon'
                }));
                // icon 교체 직후 스타일이 즉시 반영되도록 opacity를 다시 적용합니다.
                middleMarker.setOpacity(1);
                middleMarker.on('click', event => {
                    if (event?.originalEvent) L.DomEvent.stop(event.originalEvent);
                });
                middleMarker.on('dragstart click touchmove', restorePromotedMarkerIcon);
            }
        };
    }
})();


// 기본 점 기록 아이콘(파란색)입니다.
const defaultSurveyIcon = createColoredMarkerIcon('#0040ff');
const DRAW_PATH_WEIGHT = 3;
const DRAW_PATH_OPACITY = 0.85;

function getDrawPathStyle(color) {
    return {
        color,
        fillColor: color,
        weight: DRAW_PATH_WEIGHT,
        opacity: DRAW_PATH_OPACITY,
        lineCap: 'round',
        lineJoin: 'round',
        fillOpacity: 0
    };
}

function getDefaultPolygonFillProperties() {
    return { customFillPattern: 'none', customFillOpacity: 0 };
}

// Leaflet.Draw 툴바 설정입니다.
// 원리: draw 옵션에서 사용 가능한 도형 타입을 제한해 앱 요구사항(점/선/면)만 노출합니다.
const drawControl = new L.Control.Draw({
    edit: { featureGroup: drawnItems },
    draw: {
        polygon: true,
        polyline: true,
        marker: { icon: defaultSurveyIcon },
        circle: false,
        rectangle: false,
        circlemarker: false
    }
});
map.addControl(drawControl);

// 그리기 중 액션 버튼(완료/취소 등) 하단 툴바 DOM 참조
const actionToolbar = document.getElementById('action-toolbar');
const completeDrawingBtn = actionToolbar ? actionToolbar.querySelector('.btn-done') : null;
function getRawPointerLatLng(drawHandler, e) {
    if (e && e.originalEvent && drawHandler && drawHandler._map) {
        return normalizeLatLng(drawHandler._map.mouseEventToLatLng(e.originalEvent));
    }
    return normalizeLatLng(e && e.latlng ? e.latlng : null);
}

function shouldSkipDuplicateSnapMove(drawHandler, e) {
    if (!drawHandler || !drawHandler._map || !e || !e.originalEvent) return false;
    const containerPoint = drawHandler._map.mouseEventToContainerPoint(e.originalEvent);
    const pointKey = `${Math.round(containerPoint.x)}:${Math.round(containerPoint.y)}`;
    if (drawHandler._lastSnapMousePointKey === pointKey) return true;
    drawHandler._lastSnapMousePointKey = pointKey;
    return false;
}

const originalPolylineAddVertex = L.Draw.Polyline.prototype.addVertex;
L.Draw.Polyline.prototype.addVertex = function (latlng) {
    return originalPolylineAddVertex.call(this, getSnappedLatLng(latlng));
};

const originalPolylineMouseMove = L.Draw.Polyline.prototype._onMouseMove;
L.Draw.Polyline.prototype._onMouseMove = function (e) {
    const originalLatLng = getRawPointerLatLng(this, e);
    if (!originalLatLng) return originalPolylineMouseMove.call(this, e);
    if (shouldSkipDuplicateSnapMove(this, e)) return;

    const snapResult = getSnapResult(originalLatLng);
    const snappedLatLng = snapResult.latlng;
    updateSnapGuide(snappedLatLng, snapResult.isSnapped);

    const newPos = this._map.latLngToLayerPoint(snappedLatLng);
    this._currentLatLng = snappedLatLng;
    this._updateTooltip(snappedLatLng);
    this._updateGuide(newPos);
    this._mouseMarker.setLatLng(snappedLatLng);

    if (e && e.originalEvent) L.DomEvent.preventDefault(e.originalEvent);
};

const originalMarkerMouseMove = L.Draw.Marker.prototype._onMouseMove;
L.Draw.Marker.prototype._onMouseMove = function (e) {
    const originalLatLng = getRawPointerLatLng(this, e);
    if (!originalLatLng) return originalMarkerMouseMove.call(this, e);
    if (shouldSkipDuplicateSnapMove(this, e)) return;

    const snapResult = getSnapResult(originalLatLng);
    const snappedLatLng = snapResult.latlng;
    updateSnapGuide(snappedLatLng, snapResult.isSnapped);
    this._tooltip.updatePosition(snappedLatLng);
    this._mouseMarker.setLatLng(snappedLatLng);

    if (!this._marker) {
        this._marker = this._createMarker(snappedLatLng);
        this._marker.on('click', this._onClick, this);
        this._map
            .on('click', this._onClick, this)
            .addLayer(this._marker);
    } else {
        this._marker.setLatLng(this._mouseMarker.getLatLng());
    }
};

const originalEditPolyMarkerDrag = L.Edit.PolyVerticesEdit.prototype._onMarkerDrag;
L.Edit.PolyVerticesEdit.prototype._onMarkerDrag = function (e) {
    const marker = e.target;
    const originalLatLng = normalizeLatLng(marker.getLatLng());
    const snapResult = getSnapResult(originalLatLng, this._poly);

    if (snapResult.isSnapped) {
        marker.setLatLng(snapResult.latlng);
        updateSnapGuide(snapResult.latlng, true);
    } else {
        updateSnapGuide(null, false);
    }
    syncSelectedVertexHighlightFromDrag(marker);

    return originalEditPolyMarkerDrag.call(this, e);
};

const originalEditPolyFireEdit = L.Edit.PolyVerticesEdit.prototype._fireEdit;
L.Edit.PolyVerticesEdit.prototype._fireEdit = function () {
    clearSnapGuide();
    return originalEditPolyFireEdit.call(this);
};

const originalEditPolyMarkerClick = L.Edit.PolyVerticesEdit.prototype._onMarkerClick;
L.Edit.PolyVerticesEdit.prototype._onMarkerClick = function (e) {
    const marker = e.target;
    if (currentEditLayerId !== null && this._poly?.feature?.properties?.id === currentEditLayerId) {
        if (e?.originalEvent) L.DomEvent.stop(e.originalEvent);
        selectEditVertex(this._poly, marker, this);
        return;
    }
    return originalEditPolyMarkerClick.call(this, e);
};

function handleEditableMarkerDrag(e) {
    const marker = e.target;
    const originalLatLng = normalizeLatLng(marker.getLatLng());
    const snapResult = getSnapResult(originalLatLng, marker);
    if (snapResult.isSnapped) {
        marker.setLatLng(snapResult.latlng);
        updateSnapGuide(snapResult.latlng, true);
    } else {
        updateSnapGuide(null, false);
    }
}

function clearSnapGuideOnEditEnd() {
    clearSnapGuide();
}

function bindMarkerEditSnap(layer) {
    if (!layer || !(layer instanceof L.Marker)) return;
    if (!layer._snapEditDragHandler) layer._snapEditDragHandler = handleEditableMarkerDrag;
    if (!layer._snapEditDragEndHandler) layer._snapEditDragEndHandler = clearSnapGuideOnEditEnd;
    layer.on('drag', layer._snapEditDragHandler);
    layer.on('dragend', layer._snapEditDragEndHandler);
}

function unbindMarkerEditSnap(layer) {
    if (!layer || !(layer instanceof L.Marker)) return;
    if (layer._snapEditDragHandler) layer.off('drag', layer._snapEditDragHandler);
    if (layer._snapEditDragEndHandler) layer.off('dragend', layer._snapEditDragEndHandler);
}

/**
 * 현재 그리기 타입별 "완료 가능 최소 버텍스 수"를 반환합니다.
 */
function getRequiredVertexCountForCurrentDrawer() {
    if (AppState.currentDrawer instanceof L.Draw.Polygon) return 3;
    if (AppState.currentDrawer instanceof L.Draw.Polyline) return 2;
    return 0;
}

/**
 * 현재 그리기 스케치의 버텍스 수를 반환합니다.
 */
function getCurrentDrawingVertexCount() {
    if (!AppState.currentDrawer) return 0;
    if (Array.isArray(AppState.currentDrawer._markers)) return AppState.currentDrawer._markers.length;

    if (AppState.currentDrawer._poly && typeof AppState.currentDrawer._poly.getLatLngs === 'function') {
        const latlngs = AppState.currentDrawer._poly.getLatLngs();
        if (!Array.isArray(latlngs)) return 0;
        if (latlngs.length > 0 && Array.isArray(latlngs[0])) return latlngs[0].length;
        return latlngs.length;
    }
    return 0;
}

/**
 * 그리기 진행 상태에 맞춰 "기록 완료" 버튼 활성 상태를 갱신합니다.
 */
function updateDrawingCompleteButtonState() {
    if (!completeDrawingBtn) return;
    if (AppState.currentDrawer instanceof L.Draw.Marker) {
        completeDrawingBtn.disabled = true;
        return;
    }
    const requiredVertexCount = getRequiredVertexCountForCurrentDrawer();
    if (requiredVertexCount === 0) {
        completeDrawingBtn.disabled = false;
        return;
    }
    completeDrawingBtn.disabled = getCurrentDrawingVertexCount() < requiredVertexCount;
}

function handleCompletionVertexClick(e) {
    const drawer = AppState.currentDrawer;
    if (!(drawer instanceof L.Draw.Polygon) && !(drawer instanceof L.Draw.Polyline)) return;

    const requiredVertexCount = getRequiredVertexCountForCurrentDrawer();
    if (getCurrentDrawingVertexCount() < requiredVertexCount) return;

    if (e?.originalEvent) {
        L.DomEvent.stop(e.originalEvent);
    }
    completeDrawing();
}

function syncCompletionVertexClickTarget() {
    const drawer = AppState.currentDrawer;
    if (!(drawer instanceof L.Draw.Polygon) && !(drawer instanceof L.Draw.Polyline)) return;

    const markers = Array.isArray(drawer._markers) ? drawer._markers : null;
    if (!markers || markers.length === 0) return;

    const targetMarker = drawer instanceof L.Draw.Polygon ? markers[0] : markers[markers.length - 1];
    if (!targetMarker) return;

    if (drawer._completionVertexMarker && drawer._completionVertexMarker !== targetMarker) {
        drawer._completionVertexMarker.off('click', handleCompletionVertexClick);
        drawer._completionVertexMarker = null;
    }

    if (drawer._completionVertexMarker === targetMarker) return;

    targetMarker.on('click', handleCompletionVertexClick);
    drawer._completionVertexMarker = targetMarker;
}


/* ==========================================================================
   2) 그리기 제어
   ========================================================================== */
/**
 * 선택한 타입(point/line/polygon)의 그리기 모드를 시작합니다.
 * 동작 원리: Drawer 인스턴스를 생성해 enable()하고, 완료/취소 UI를 함께 활성화합니다.
 */
export function startDraw(type) {
    // 이미 그리기/편집 모드라면 중복 진입을 막습니다.
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    closeBottomSheet();

    // 도형 1개 단위로 기본 색상을 먼저 고정해 생성/스타일/저장 단계에서 일관되게 사용합니다.
    const randomColor = getRandomColor();
    AppState.currentDrawColor = randomColor;

    const options = {
        touchIcon: null,
        showLength: true,
        allowIntersection: true,
        shapeOptions: {
            ...getDrawPathStyle(randomColor)
        }
    };

    if (type === 'polygon') {
        AppState.currentDrawer = new L.Draw.Polygon(map, options);
        highlightButton('btn-poly');
    } else if (type === 'polyline') {
        AppState.currentDrawer = new L.Draw.Polyline(map, options);
        highlightButton('btn-line');
    } else if (type === 'marker') {
        AppState.currentDrawer = new L.Draw.Marker(map, { icon: createColoredMarkerIcon(randomColor, 'circle') });
        highlightButton('btn-point');
    }

    // 기록 모드 시각 상태(비네팅/버튼 강조)를 적용합니다.
    setRecordingModeActive(true);
    requestWakeLock();

    // 수동 완료 버튼으로만 종료되게 _finishShape를 감싸서 제어합니다.
    // 원리: 자동 finish 호출을 AppState.isManualFinish 플래그로 게이트합니다.
    if (AppState.currentDrawer && (type === 'polygon' || type === 'polyline')) {
        AppState.currentDrawer._originalFinishShape = AppState.currentDrawer._finishShape;
        AppState.currentDrawer._finishShape = function () {
            if (AppState.isManualFinish) { this._originalFinishShape(); }
        };
    }
    AppState.currentDrawer.enable();
    AppState.currentDrawer._lastSnapMousePointKey = null;
    actionToolbar.style.display = 'flex';
    updateDrawingCompleteButtonState();
    syncCompletionVertexClickTarget();
}

/**
 * 현재 그리기를 완료 처리합니다.
 * 동작 원리: Drawer 구현별 complete API 차이를 순차 fallback으로 흡수합니다.
 */
export function completeDrawing() {
    if (AppState.currentDrawer) {
        const shouldWaitForCreatedEvent = (
            AppState.currentDrawer instanceof L.Draw.Polygon ||
            AppState.currentDrawer instanceof L.Draw.Polyline
        );
        // 수동 완료 구간에서만 _finishShape가 동작하도록 임시 플래그를 켭니다.
        AppState.isManualFinish = true;
        if (AppState.currentDrawer.completeShape) AppState.currentDrawer.completeShape();
        else if (AppState.currentDrawer._finishShape) AppState.currentDrawer._finishShape();
        else AppState.currentDrawer.disable();
        AppState.isManualFinish = false;
        // 선/면은 draw:created 핸들러에서 기록명 입력 후 색상/저장/상태 정리를 끝냅니다.
        // 여기서 먼저 초기화하면 currentDrawColor가 사라져 완료 후 색상이 바뀝니다.
        if (shouldWaitForCreatedEvent) return;
    }
    resetDrawingState();
}

/**
 * 현재 그리기를 취소하고 입력 중 상태를 정리합니다.
 */
export function cancelDrawing() {
    if (AppState.currentDrawer) {
        AppState.currentDrawer.disable();
        AppState.currentDrawer._lastSnapMousePointKey = null;
        AppState.currentDrawer = null;
    }
    resetDrawingState();
}

/**
 * 그리기 UI/임시 상태를 기본값으로 되돌립니다.
 * 동작 원리: Drawer 외부 상태(UI class, pendingPhotos, 색상 캐시)를 한 곳에서 정리합니다.
 */
function resetDrawingState() {
    setRecordingModeActive(false);
    actionToolbar.style.display = 'none';
    if (completeDrawingBtn) completeDrawingBtn.disabled = false;
    clearSnapGuide();
    resetButtonStyles();
    releaseWakeLock();

    // 점 생성 직전에 보관하던 첨부 사진 임시 버퍼를 비웁니다.
    if (AppState.pendingPhotos) {
        AppState.pendingPhotos = null;
    }
    // 다음 그리기 시작 시 새 색상을 뽑도록 초기화
    AppState.currentDrawColor = null;
}



/* ==========================================================================
   3) GPS 입력
   ========================================================================== */
/**
 * 현재 GPS 좌표를 그리기 도구에 추가합니다.
 * 동작 원리:
 * - 마커 모드면 즉시 CREATED 이벤트를 강제로 발생시켜 일반 생성 플로우를 재사용합니다.
 * - 선/면 모드면 addVertex로 꼭짓점만 추가합니다.
 */
export function addGpsVertex() {
    if (!AppState.currentDrawer) return;
    if (!navigator.geolocation) { alert("GPS 미지원"); return; }

    // 브라우저 위치 API로 1회 좌표를 가져옵니다.
    navigator.geolocation.getCurrentPosition(function (pos) {
        const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);

        if (AppState.currentDrawer instanceof L.Draw.Marker) {
            const markerColor = AppState.currentDrawColor || '#0040ff';
            const marker = L.marker(latlng, { icon: createColoredMarkerIcon(markerColor) });
            // Marker는 "점 1개=완료"이므로 Drawer를 종료한 뒤 CREATED 이벤트로 후속 처리 통일
            AppState.currentDrawer.disable();
            AppState.currentDrawer._lastSnapMousePointKey = null;
            AppState.currentDrawer = null;
            map.fire(L.Draw.Event.CREATED, { layer: marker, layerType: 'marker' });
        } else {
            // Polyline/Polygon은 현재 스케치에 버텍스만 누적
            AppState.currentDrawer.addVertex(latlng);
            updateDrawingCompleteButtonState();
            syncCompletionVertexClickTarget();
        }
        // 입력 지점으로 화면 중심을 이동해 현장 사용성을 높입니다.
        map.panTo(latlng);
    }, function () {
        alert("GPS 수신 실패");
    // 고정밀 옵션은 느릴 수 있지만 위치 정확도를 우선합니다.
    }, { enableHighAccuracy: true });
}

/**
 * 현재 스케치의 마지막 버텍스를 삭제합니다.
 */
export function deleteLastVertex() {
    if (AppState.currentDrawer && AppState.currentDrawer.deleteLastVertex) {
        AppState.currentDrawer.deleteLastVertex();
        updateDrawingCompleteButtonState();
        syncCompletionVertexClickTarget();
    }
}

/* ==========================================================================
   4) 도형 편집
   ========================================================================== */
function getCurrentEditLayer() {
    if (currentEditLayerId === null) return null;
    return drawnItems.getLayers().find(l => l.feature?.properties?.id === currentEditLayerId) || null;
}

function setEditVertexActionButtons({ isMarker = false, hasSelection = false } = {}) {
    const gpsBtn = document.getElementById('btn-edit-move-gps');
    const deleteBtn = document.getElementById('btn-edit-delete-vertex');
    const clearBtn = document.getElementById('btn-edit-clear-vertex');
    const toolbar = document.getElementById('edit-action-toolbar');
    if (gpsBtn) gpsBtn.disabled = !isMarker && !hasSelection;
    if (deleteBtn) {
        deleteBtn.style.display = isMarker ? 'none' : '';
        deleteBtn.disabled = !hasSelection;
    }
    if (clearBtn) {
        clearBtn.style.display = isMarker ? 'none' : '';
        clearBtn.disabled = !hasSelection;
    }
    if (toolbar) {
        toolbar.classList.toggle('marker-edit', isMarker);
        toolbar.classList.toggle('vertex-selected', !isMarker && hasSelection);
    }
}

function setEditVertexMarkerSelected(marker, isSelected) {
    const el = marker?.getElement?.() || marker?._icon;
    if (!el) return;
    el.classList.toggle('edit-selected-vertex', isSelected);
}

function clearSelectedEditVertexVisual() {
    if (selectedEditVertex?.type === 'poly') {
        setEditVertexMarkerSelected(selectedEditVertex.marker, false);
    }
}

function clearSelectedEditVertex() {
    clearSelectedEditVertexVisual();
    selectedEditVertex = null;
    const layer = getCurrentEditLayer();
    setEditVertexActionButtons({ isMarker: layer instanceof L.Marker, hasSelection: false });
}

export function clearSelectedEditVertexSelection() {
    const layer = getCurrentEditLayer();
    if (layer instanceof L.Marker) return;
    clearSelectedEditVertex();
}

function selectEditVertex(layer, marker, handler) {
    if (!layer || !marker || !handler) return;
    clearSelectedEditVertexVisual();
    selectedEditVertex = { type: 'poly', layer, marker, handler };
    setEditVertexMarkerSelected(marker, true);
    setEditVertexActionButtons({ isMarker: false, hasSelection: true });
}

function selectMarkerEditLayer(layer) {
    if (!layer) return;
    clearSelectedEditVertexVisual();
    selectedEditVertex = { type: 'marker', layer };
    setEditVertexActionButtons({ isMarker: true, hasSelection: true });
}

function syncSelectedVertexHighlightFromDrag(marker) {
    if (selectedEditVertex?.type === 'poly' && selectedEditVertex.marker === marker) setEditVertexMarkerSelected(marker, true);
}

function refreshEditLayerOverlays() {
    syncSolidDotOverlays();
    syncFillPatternOverlays();
}

function movePolyEditVertex(selection, latlng) {
    const { marker, handler } = selection;
    if (!marker || !handler) return;
    const nextLatLng = normalizeLatLng(latlng);
    if (!nextLatLng) return;

    marker.setLatLng(nextLatLng);
    L.extend(marker._origLatLng, nextLatLng);
    if (marker._middleLeft) marker._middleLeft.setLatLng(handler._getMiddleLatLng(marker._prev, marker));
    if (marker._middleRight) marker._middleRight.setLatLng(handler._getMiddleLatLng(marker, marker._next));
    handler._poly._bounds._southWest = L.latLng(Infinity, Infinity);
    handler._poly._bounds._northEast = L.latLng(-Infinity, -Infinity);
    const latlngs = handler._poly.getLatLngs();
    handler._poly._convertLatLngs(latlngs, true);
    handler._poly.redraw();
    handler._fireEdit();
    refreshEditLayerOverlays();
}

function moveMarkerEditLayer(selection, latlng) {
    const layer = selection?.layer;
    const nextLatLng = normalizeLatLng(latlng);
    if (!layer || !nextLatLng) return;
    layer.setLatLng(nextLatLng);
}

function moveSelectedEditVertexTo(latlng) {
    if (!selectedEditVertex) {
        const layer = getCurrentEditLayer();
        if (layer instanceof L.Marker) selectMarkerEditLayer(layer);
    }
    if (!selectedEditVertex) return;
    if (selectedEditVertex.type === 'marker') moveMarkerEditLayer(selectedEditVertex, latlng);
    else {
        movePolyEditVertex(selectedEditVertex, latlng);
        clearSelectedEditVertex();
    }
}

function getCurrentGpsLatLng() {
    const lat = Number(AppState.lastGpsLat);
    const lng = Number(AppState.lastGpsLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return L.latLng(lat, lng);
}

export function moveSelectedEditVertexToGps() {
    const latlng = getCurrentGpsLatLng();
    if (!latlng) {
        alert('현재 GPS 위치를 확인할 수 없습니다.');
        return;
    }
    moveSelectedEditVertexTo(latlng);
}

function removePolyEditVertex(selection) {
    const { marker, handler } = selection;
    if (!marker || !handler) return;
    const minPoints = L.Polygon && (handler._poly instanceof L.Polygon) ? 4 : 3;
    if (handler._defaultShape().length < minPoints) {
        alert('도형을 유지하기 위해 더 이상 버텍스를 삭제할 수 없습니다.');
        return;
    }

    handler._removeMarker(marker);
    handler._updatePrevNext(marker._prev, marker._next);
    if (marker._middleLeft) handler._markerGroup.removeLayer(marker._middleLeft);
    if (marker._middleRight) handler._markerGroup.removeLayer(marker._middleRight);
    if (marker._prev && marker._next) {
        handler._createMiddleMarker(marker._prev, marker._next);
    } else if (!marker._prev && marker._next) {
        marker._next._middleLeft = null;
    } else if (marker._prev && !marker._next) {
        marker._prev._middleRight = null;
    }
    handler._fireEdit();
    clearSelectedEditVertex();
    refreshEditLayerOverlays();
}

export function deleteSelectedEditVertex() {
    if (!selectedEditVertex || selectedEditVertex.type !== 'poly') return;
    removePolyEditVertex(selectedEditVertex);
}

function handleEditMapClick(e) {
    const layer = getCurrentEditLayer();
    if (!layer) return;
    if (layer instanceof L.Marker && selectedEditVertex?.type !== 'marker') {
        selectMarkerEditLayer(layer);
    }
    if (!selectedEditVertex) return;
    moveSelectedEditVertexTo(e.latlng);
}

function bindEditMapClick() {
    if (isEditMapClickBound) return;
    map.on('click', handleEditMapClick);
    isEditMapClickBound = true;
}

function unbindEditMapClick() {
    if (!isEditMapClickBound) return;
    map.off('click', handleEditMapClick);
    isEditMapClickBound = false;
}

function resetEditActionToolbarForLayer(layer) {
    clearSelectedEditVertex();
    if (layer instanceof L.Marker) {
        selectMarkerEditLayer(layer);
        setEditVertexActionButtons({ isMarker: true, hasSelection: true });
    } else {
        setEditVertexActionButtons({ isMarker: false, hasSelection: false });
    }
}

/**
 * 목록에서 선택한 단일 레이어를 편집 모드로 전환합니다.
 * 동작 원리: 레이어 타입(마커/선면)에 따라 편집기(Dragging 또는 L.Edit.Poly)를 다르게 적용합니다.
 */
export function enableSingleLayerEdit(id) {

    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
    if (!layer) return;

    if (layer instanceof L.Marker) {
        // 마커는 좌표 1개만 관리하므로 원본 LatLng를 그대로 백업합니다.
        editLayerOriginalLatLng = layer.getLatLng();
        layer.dragging.enable();
        bindMarkerEditSnap(layer);
    } else {
        if (!layer.editing) {
            // 폴리곤/폴리라인은 Leaflet 편집 모듈 인스턴스를 생성해 편집 핸들을 붙입니다.
            if (L.Edit && L.Edit.Poly) layer.editing = new L.Edit.Poly(layer);
            else { alert("수정 모듈 오류"); return; }
        }
        if (layer.editing) layer.editing.enable();
        else { alert("수정 불가 도형"); return; }
        // getLatLngs()는 참조가 섞일 수 있어 깊은 복사본(JSON)으로 원본 상태를 고정합니다.
        editLayerOriginalLatLng = JSON.parse(JSON.stringify(layer.getLatLngs()));
    }

    layer.closePopup();
    const editGuideMessage = layer instanceof L.Marker
        ? "측량한 점 기록을 수정합니다. 마커를 드래그하거나 현 위치 또는 클릭한 위치로 기록을 옮길 수 있습니다. 수정이 완료되면 하단의 [수정 완료] 버튼을 누르세요."
        : "측량한 면 또는 선 기록을 수정합니다. 버텍스를 드래그하거나 선택한 후 현 위치 또는 클릭한 위치로 옮길 수 있습니다. 수정이 완료되면 하단의 [수정 완료] 버튼을 누르세요.";
    alert(editGuideMessage);
    closeBottomSheet();
    setRecordingModeActive(true);

    // 현재 편집 대상과 편집용 툴바를 함께 활성화합니다.
    currentEditLayerId = id;
    resetEditActionToolbarForLayer(layer);
    bindEditMapClick();
    document.getElementById('edit-action-toolbar').style.display = 'flex';
};

/**
 * 편집을 확정하고 저장/화면을 갱신합니다.
 * 동작 원리: 편집 종료 -> 속성 갱신 -> 저장 -> UI 복원 순서로 처리합니다.
 */
export function completeSingleEdit() {

    if (currentEditLayerId === null) return;

    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === currentEditLayerId);
    if (!layer) {
        document.getElementById('edit-action-toolbar').style.display = 'none';
        setRecordingModeActive(false);
        unbindEditMapClick();
        clearSelectedEditVertex();
        currentEditLayerId = null;
        return;
    }

    // 편집 핸들러를 비활성화해 좌표 수정을 종료합니다.
    if (layer instanceof L.Marker) {
        unbindMarkerEditSnap(layer);
        layer.dragging.disable();
    } else if (layer.editing) layer.editing.disable();

    // 좌표 변경분을 feature 정보로 재계산하고 즉시 저장합니다.
    updateLayerInfo(layer);
    saveToStorage();
    renderSurveyList();

    // 편집 모드 UI/임시 상태를 정리합니다.
    setRecordingModeActive(false);
    document.getElementById('edit-action-toolbar').style.display = 'none';
    clearSnapGuide();
    unbindEditMapClick();
    clearSelectedEditVertex();
    editLayerOriginalLatLng = null;
    currentEditLayerId = null;

    // 편집 완료 직후 상세 바텀시트를 다시 열어 결과 확인 흐름을 유지합니다.
    layer.fire('click');
};

/**
 * 편집 내용을 원본으로 되돌리되, 편집 모드는 유지합니다.
 * 동작 원리: 원본 스냅샷(editLayerOriginalLatLng)을 다시 적용합니다.
 */
export function revertSingleEdit() {

    if (currentEditLayerId === null) return;
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === currentEditLayerId);
    if (!layer) return;

    if (layer instanceof L.Marker) {
        // 마커는 단일 좌표 복원만으로 되돌리기가 완료됩니다.
        if (editLayerOriginalLatLng) layer.setLatLng(editLayerOriginalLatLng);
        clearSnapGuide();
        selectMarkerEditLayer(layer);
    } else if (editLayerOriginalLatLng) {
        // 선/면은 편집기 내부 캐시가 있어 "disable -> 좌표복원 -> 편집기 재생성" 순서가 안전합니다.
        if (layer.editing) layer.editing.disable();
        layer.setLatLngs(editLayerOriginalLatLng);
        layer.editing = new L.Edit.Poly(layer);
        layer.editing.enable();
        clearSelectedEditVertex();
    }
    refreshEditLayerOverlays();
};

/**
 * 편집 내용을 원복하고 편집 모드를 종료합니다.
 * 동작 원리: revert 동작 후 툴바/모드 상태까지 함께 닫습니다.
 */
export function cancelSingleEdit() {

    if (currentEditLayerId === null) return;
    const layer = drawnItems.getLayers().find(l => l.feature.properties.id === currentEditLayerId);
    if (!layer) {
        document.getElementById('edit-action-toolbar').style.display = 'none';
        setRecordingModeActive(false);
        unbindEditMapClick();
        clearSelectedEditVertex();
        currentEditLayerId = null;
        return;
    }

    if (layer instanceof L.Marker) {
        // 마커: 위치 원복 후 드래그 종료
        if (editLayerOriginalLatLng) layer.setLatLng(editLayerOriginalLatLng);
        unbindMarkerEditSnap(layer);
        layer.dragging.disable();
    } else {
        // 선/면: 원본 좌표 적용 후 편집 종료
        if (layer.editing) layer.editing.disable();
        if (editLayerOriginalLatLng) {
            layer.setLatLngs(editLayerOriginalLatLng);
            // 다음 편집 시작 시 깨끗한 상태를 보장하도록 편집기를 재생성합니다.
            layer.editing = new L.Edit.Poly(layer);
        }
    }

    // 편집 UI 상태를 초기화합니다.
    setRecordingModeActive(false);
    document.getElementById('edit-action-toolbar').style.display = 'none';
    clearSnapGuide();
    unbindEditMapClick();
    clearSelectedEditVertex();
    editLayerOriginalLatLng = null;
    currentEditLayerId = null;

    layer.openPopup();
};

/* ==========================================================================
   5) 이벤트 처리
   ========================================================================== */
// 선/면 버텍스가 추가될 때마다 완료 버튼 상태를 즉시 재평가합니다.
map.on(L.Draw.Event.DRAWVERTEX, function () {
    updateDrawingCompleteButtonState();
    syncCompletionVertexClickTarget();
});

map.on(L.Draw.Event.EDITVERTEX, function () {
    syncSolidDotOverlays();
    syncFillPatternOverlays();
});

/**
 * draw:created
 * 동작 원리: Leaflet.Draw가 생성한 레이어를 앱 표준 feature 구조로 보강한 뒤
 * drawnItems/AppState/UI 저장 흐름으로 연결합니다.
 */
map.on(L.Draw.Event.CREATED, async function (event) {
    const layer = event.layer;
    let memo = null;
    // 실수로 취소를 눌렀을 때를 대비해, 취소 의사를 한 번 더 확인합니다.
    while (memo === null) {
        memo = await showTextPrompt("기록명 입력:", getTimestampString());
        if (memo !== null) break;

        const shouldCancelSave = await showAppConfirm("기록 저장을 취소하시겠습니까?\n측량한 기록이 사라집니다.", { title: '기록 저장 취소' });
        if (shouldCancelSave) {
            if (AppState.currentDrawer) {
                AppState.currentDrawer.disable();
                AppState.currentDrawer._lastSnapMousePointKey = null;
                AppState.currentDrawer = null;
            }
            resetDrawingState();
            return;
        }
    }
    if (!memo) memo = getTimestampString();

    // 생성 직후 feature 메타를 붙여 앱 내부 식별/필터/스타일 기준을 통일합니다.
    const randomColor = AppState.currentDrawColor || getRandomColor();
    const isPolygonLayer = event.layerType === 'polygon' || layer instanceof L.Polygon;
    const baseProperties = {
        id: Date.now(),
        isHidden: false,
        customColor: randomColor,
        customWeight: DRAW_PATH_WEIGHT,
        ...(isPolygonLayer ? getDefaultPolygonFillProperties() : {})
    };
    layer.feature = {
        type: "Feature",
        properties: setRecordName(baseProperties, memo)
    };

    // 점 생성 전 임시 보관했던 사진 목록이 있으면 이 레이어에 1회 귀속시킵니다.
    if (AppState.pendingPhotos && AppState.pendingPhotos.length > 0) {
        layer.feature.properties.photos = AppState.pendingPhotos;
        AppState.pendingPhotos = null;
        
        // 사진 기반 포인트임을 바로 구분할 수 있게 카메라 이모지를 기본값으로 사용합니다.
        layer.feature.properties.customEmoji = '📷';
        layer.feature.properties.customMarkerSize = 3;
    } else if (event.layerType === 'marker') {
        layer.feature.properties.customEmoji = 'circle';
        layer.feature.properties.customMarkerSize = 3;
    }

    if (event.layerType === 'marker') {
        // 마커는 아이콘 기반 스타일(색상/이모지/크기)을 적용합니다.
        const emoji = layer.feature.properties.customEmoji || null;
        const size = layer.feature.properties.customMarkerSize || 3;
        layer.setIcon(createColoredMarkerIcon(randomColor, emoji, size));
    } else {
        // 선/면은 path 스타일(color/fill)을 적용합니다.
        layer.setStyle(getDrawPathStyle(randomColor));
    }

    // 속성 반영 -> 그룹 추가 -> 저장 순으로 처리해 상태를 일관되게 유지합니다.
    updateLayerInfo(layer);
    drawnItems.addLayer(layer);
    saveToStorage();

    // 그리기 모드를 종료하고 UI를 기본 상태로 복원합니다.
    resetDrawingState();
    if (AppState.currentDrawer) AppState.currentDrawer._lastSnapMousePointKey = null;
    AppState.currentDrawer = null;

    // 생성된 레이어의 상세 확인 흐름을 바로 열어 사용자 피드백을 빠르게 제공합니다.
    layer.openPopup();
    switchSidebarTab('record');
    renderSurveyList();
});

/**
 * draw:edited
 * 동작 원리: 다중 편집 결과 레이어 집합(e.layers)을 순회해 정보 재계산 후 저장합니다.
 */
map.on('draw:edited', function (e) {
    e.layers.eachLayer(updateLayerInfo);
    saveToStorage();
    renderSurveyList();
    syncSolidDotOverlays();
    syncFillPatternOverlays();
});
