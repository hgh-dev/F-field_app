/* ==========================================================================
   [모듈] 기록 상세 바텀시트 (ui-bottomsheet.js)
   [역할]
   - 선택한 기록의 상세 정보, 사진, 메모, 스타일, 구멍 편집 메뉴를 바텀시트로 표시합니다.
   - 모바일/데스크톱에서 상세 패널 열기, 닫기, 드래그, 내용 갱신을 관리합니다.
   [참고]
   - 기록 상세 화면이나 바텀시트 표시 문제가 생기면 확인합니다.
   ========================================================================== */
import { VWORLD_API_KEY, SVG_ICONS } from './config.js';
import { AppState } from './state.js';
import { map, updateLayerOrder } from './map.js';
import { drawnItems, enableSingleLayerEdit } from './draw.js';
import { getTimestampString, getRandomColor, createColoredMarkerIcon, copyText, formatCoordinate, getRecordName, setRecordName, calculateProjectedAreaM2 } from './utils.js';
import { saveToStorage } from './data.js';
import { updateLayerInfo, deleteLayerById, scheduleViewportVectorOptimization } from './ui-core.js';
import { renderSurveyList } from './ui-project.js';
import { showAppConfirm } from './app-dialog.js';

export let currentBottomSheetLayerId = null;

/**
 * [함수] setCurrentBottomSheetLayerId
 * [역할] 외부 입력값으로 내부 상태를 설정한다.
 * [원리] 외부에서 전달된 값을 내부 상태 변수에 직접 반영해,
 *        후속 UI 로직이 같은 기준 상태를 참조하도록 만든다.
 */
export function setCurrentBottomSheetLayerId(id) { currentBottomSheetLayerId = id; }

export function getBottomSheetVisibleHeight() {
    const bottomSheet = document.getElementById('bottom-sheet');
    if (!bottomSheet?.classList.contains('open')) return 0;
    const rect = bottomSheet.getBoundingClientRect();
    return Math.max(0, Math.min(window.innerHeight, rect.height || 0));
}

function getTopProjectBadgeVisibleHeight() {
    const badge = document.getElementById('map-active-project-badge');
    if (!badge) return 0;

    const style = window.getComputedStyle(badge);
    if (style.display === 'none' || style.visibility === 'hidden') return 0;

    const rect = badge.getBoundingClientRect();
    return Math.max(0, Math.min(window.innerHeight, rect.bottom || 0));
}

export function getBottomSheetAwareFitOptions(options = {}) {
    const { basePadding: rawBasePadding, ...fitOptions } = options;
    const basePadding = Number(rawBasePadding ?? 60);
    const bottomSheetHeight = getBottomSheetVisibleHeight();
    const topProjectBadgeHeight = bottomSheetHeight ? getTopProjectBadgeVisibleHeight() : 0;
    return {
        ...fitOptions,
        paddingTopLeft: [basePadding, basePadding + topProjectBadgeHeight],
        paddingBottomRight: [basePadding, basePadding + bottomSheetHeight]
    };
}

export function getBottomSheetAwareCenter(latlng, zoom = map.getZoom()) {
    const point = L.latLng(latlng);
    const bottomSheetHeight = getBottomSheetVisibleHeight();
    if (!bottomSheetHeight) return point;
    const topProjectBadgeHeight = getTopProjectBadgeVisibleHeight();
    return map.unproject(map.project(point, zoom).add([0, (bottomSheetHeight - topProjectBadgeHeight) / 2]), zoom);
}

export function flyToWithBottomSheet(latlng, zoom = map.getZoom(), options = {}) {
    const targetZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : map.getZoom();
    map.flyTo(getBottomSheetAwareCenter(latlng, targetZoom), targetZoom, options);
}

function centerBottomSheetTargetOnFullMap(layerId) {
    const recordLayer = layerId !== null && layerId !== undefined
        ? drawnItems.getLayers().find(layer => layer.feature?.properties?.id === layerId)
        : null;

    if (recordLayer instanceof L.Marker) {
        map.flyTo(recordLayer.getLatLng(), Math.max(map.getZoom(), 17), { duration: 0.3 });
        return;
    }

    if (recordLayer && typeof recordLayer.getBounds === 'function') {
        const bounds = recordLayer.getBounds();
        if (bounds?.isValid?.()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 19 });
        return;
    }

    if (AppState.currentBoundaryLayer && typeof AppState.currentBoundaryLayer.getBounds === 'function') {
        const bounds = AppState.currentBoundaryLayer.getBounds();
        if (bounds?.isValid?.()) {
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 19 });
            return;
        }
    }

    if (AppState.currentSearchMarker && typeof AppState.currentSearchMarker.getLatLng === 'function') {
        map.flyTo(AppState.currentSearchMarker.getLatLng(), map.getZoom(), { duration: 0.3 });
    }
}

/**
 * [함수] openBottomSheet
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openBottomSheet(title, bodyHtml) {
    document.getElementById('bottom-sheet-body').innerHTML = bodyHtml;
    document.getElementById('bottom-sheet').classList.remove('full-open');
    document.getElementById('bottom-sheet').classList.add('open');
}

/**
 * [함수] closeBottomSheet
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeBottomSheet(options = {}) {
    const bs = document.getElementById('bottom-sheet');
    if (!bs) return;
    const shouldRecenter = options.recenter !== false && bs.classList.contains('open');
    const closingLayerId = currentBottomSheetLayerId;
    bs.classList.remove('open');
    bs.classList.remove('full-open');
    const moreMenu = document.getElementById('bottom-sheet-more-menu');
    if (moreMenu) {
        moreMenu.style.display = 'none';
        moreMenu.classList.remove('visible');
    }
    if (shouldRecenter) centerBottomSheetTargetOnFullMap(closingLayerId);
    currentBottomSheetLayerId = null;
}

/**
 * [함수] toggleBottomSheetState
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleBottomSheetState() {
    const bottomSheet = document.getElementById('bottom-sheet');
    if (bottomSheet.classList.contains('open')) {
        bottomSheet.classList.toggle('full-open');
    }
}

/**
 * [함수] toggleBottomSheetMoreMenu
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleBottomSheetMoreMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('bottom-sheet-more-menu');
    const moreBtn = document.getElementById('bottom-sheet-more-btn');
    if (!menu) return;

    if (menu.parentElement !== document.body) {
        document.body.appendChild(menu);
    }

    if (menu.style.display === 'none' || menu.style.display === '') {
        if (moreBtn) {
            const rect = moreBtn.getBoundingClientRect();
            menu.style.display = 'flex';
            menu.style.visibility = 'hidden';
            menu.classList.remove('visible');

            const menuWidth = menu.offsetWidth || 140;
            const viewportPadding = 8;
            const bottomGap = getBottomViewportGap();
            const left = Math.min(
                Math.max(viewportPadding, rect.right - menuWidth),
                window.innerWidth - menuWidth - viewportPadding
            );
            const top = Math.min(
                rect.bottom + 6,
                window.innerHeight - menu.offsetHeight - bottomGap
            );

            menu.style.left = `${left}px`;
            menu.style.top = `${Math.max(viewportPadding, top)}px`;
            menu.style.right = 'auto';
            menu.style.visibility = 'visible';
        } else {
            menu.style.display = 'flex';
        }
        setTimeout(() => menu.classList.add('visible'), 10);
    } else {
        menu.classList.remove('visible');
        setTimeout(() => menu.style.display = 'none', 100);
    }
}

function getBottomViewportGap() {
    const cssValue = getComputedStyle(document.documentElement).getPropertyValue('--app-bottom-gap-roomy').trim();
    const parsed = parseFloat(cssValue);
    if (Number.isFinite(parsed)) return Math.max(72, parsed + 42);

    const isRoomyFoldableViewport = (
        (window.innerWidth >= 700 && window.innerWidth <= 1100 && window.innerHeight >= window.innerWidth) ||
        (window.innerWidth >= 700 && window.innerWidth > window.innerHeight)
    );
    return isRoomyFoldableViewport ? 84 : 72;
}

/**
 * [함수] isLeafletLatLngPoint
 * [역할] 입력 대상이 조건을 만족하는지 불리언으로 판별한다.
 * [원리] 입력 객체의 타입과 필수 필드를 순서대로 검사해,
 *        후속 로직 분기에서 재사용할 불리언 판정 결과를 반환한다.
 */
function isLeafletLatLngPoint(point) {
    return !!point && typeof point.lat === 'number' && typeof point.lng === 'number';
}

/**
 * [함수] isSimplePolygonLayer
 * [역할] 입력 대상이 조건을 만족하는지 불리언으로 판별한다.
 * [원리] 입력 객체의 타입과 필수 필드를 순서대로 검사해,
 *        후속 로직 분기에서 재사용할 불리언 판정 결과를 반환한다.
 */
function isSimplePolygonLayer(layer) {
    if (!(layer instanceof L.Polygon)) return false;
    const latlngs = layer.getLatLngs();
    return Array.isArray(latlngs)
        && latlngs.length > 0
        && Array.isArray(latlngs[0])
        && latlngs[0].length > 0
        && isLeafletLatLngPoint(latlngs[0][0]);
}

/**
 * [함수] cloneRing
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function cloneRing(ring) {
    return ring.map(point => L.latLng(point.lat, point.lng));
}

/**
 * [함수] normalizeRing
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function normalizeRing(ring) {
    if (!Array.isArray(ring)) return [];
    const normalized = cloneRing(ring);
    if (normalized.length > 1) {
        const first = normalized[0];
        const last = normalized[normalized.length - 1];
        if (first.lat === last.lat && first.lng === last.lng) {
            normalized.pop();
        }
    }
    return normalized;
}

/**
 * [함수] getNormalizedPolygonRings
 * [역할] 현재 조건에 맞는 값을 조회해 반환한다.
 * [원리] 현재 활성 탭/상태를 기준으로 조회 키를 계산하고,
 *        해당 키에 대응하는 값을 읽어 호출자에 반환한다.
 */
function getNormalizedPolygonRings(layer) {
    if (!isSimplePolygonLayer(layer)) return [];
    const latlngs = layer.getLatLngs();
    return latlngs
        .map(ring => normalizeRing(ring))
        .filter(ring => ring.length >= 3);
}

/**
 * [함수] hasHoleRings
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function hasHoleRings(layer) {
    const rings = getNormalizedPolygonRings(layer);
    return rings.length > 1;
}

/**
 * [함수] getRingOrientationSign
 * [역할] 현재 조건에 맞는 값을 조회해 반환한다.
 * [원리] 현재 활성 탭/상태를 기준으로 조회 키를 계산하고,
 *        해당 키에 대응하는 값을 읽어 호출자에 반환한다.
 */
function getRingOrientationSign(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return 0;
    let signedArea2 = 0;
    for (let i = 0; i < ring.length; i++) {
        const curr = ring[i];
        const next = ring[(i + 1) % ring.length];
        signedArea2 += (curr.lng * next.lat) - (next.lng * curr.lat);
    }
    if (Math.abs(signedArea2) < 1e-12) return 0;
    return signedArea2 > 0 ? 1 : -1;
}

/**
 * [함수] hideBottomSheetMoreMenu
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function hideBottomSheetMoreMenu() {
    const menu = document.getElementById('bottom-sheet-more-menu');
    if (!menu) return;
    menu.classList.remove('visible');
    setTimeout(() => menu.style.display = 'none', 100);
}

function reorderDrawnLayers(nextLayers) {
    nextLayers.forEach((layer, index) => {
        if (!layer.feature) layer.feature = { type: "Feature", properties: {} };
        if (!layer.feature.properties) layer.feature.properties = {};
        layer.feature.properties.displayOrder = index;
    });

    nextLayers.forEach(layer => drawnItems.removeLayer(layer));
    nextLayers.forEach(layer => drawnItems.addLayer(layer));
    updateLayerOrder();
    saveToStorage();
    renderSurveyList();
    scheduleViewportVectorOptimization();
}

export function moveLayerById(layerId, position) {
    if (layerId === null || layerId === undefined) return;

    const layers = getDisplayOrderedLayers();
    if (layers.length < 2) return;

    const currentIndex = layers.findIndex(layer => layer.feature?.properties?.id === layerId);
    if (currentIndex < 0) return;

    let targetIndex = currentIndex;
    if (position === 'front') {
        targetIndex = layers.length - 1;
    } else if (position === 'forward') {
        targetIndex = Math.min(currentIndex + 1, layers.length - 1);
    } else if (position === 'back') {
        targetIndex = 0;
    } else if (position === 'backward') {
        targetIndex = Math.max(currentIndex - 1, 0);
    }

    if (targetIndex === currentIndex) return;

    const nextLayers = [...layers];
    const [targetLayer] = nextLayers.splice(currentIndex, 1);
    nextLayers.splice(targetIndex, 0, targetLayer);
    reorderDrawnLayers(nextLayers);
}

function moveCurrentBottomSheetLayer(position) {
    hideBottomSheetMoreMenu();
    moveLayerById(currentBottomSheetLayerId, position);
}

function getDisplayOrderedLayers() {
    return [...drawnItems.getLayers()].sort((a, b) => {
        const orderA = Number(a.feature?.properties?.displayOrder);
        const orderB = Number(b.feature?.properties?.displayOrder);
        const hasOrderA = Number.isFinite(orderA);
        const hasOrderB = Number.isFinite(orderB);

        if (hasOrderA && hasOrderB && orderA !== orderB) return orderA - orderB;
        if (hasOrderA !== hasOrderB) return hasOrderA ? -1 : 1;

        return (a.feature?.properties?.id || 0) - (b.feature?.properties?.id || 0);
    });
}

/**
 * [함수] syncBottomSheetHoleMenuForLayer
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function syncBottomSheetHoleMenuForLayer(layer) {
    const holeItem = document.getElementById('bottom-sheet-hole-item');
    const holeFillItem = document.getElementById('bottom-sheet-hole-fill-item');
    const rings = getNormalizedPolygonRings(layer);

    if (holeItem) {
        if (rings.length === 0) {
            holeItem.style.display = 'none';
            holeItem.classList.remove('disabled');
            holeItem.setAttribute('aria-disabled', 'true');
        } else {
            let canDrawHole = false;
            if (rings.length === 1) {
                try {
                    canDrawHole = Boolean(findContainingPolygonForHole(layer, layer.toGeoJSON()));
                } catch (_error) {
                    canDrawHole = false;
                }
            }
            holeItem.style.display = 'flex';
            holeItem.classList.toggle('disabled', !canDrawHole);
            holeItem.setAttribute('aria-disabled', canDrawHole ? 'false' : 'true');
        }
    }
    if (holeFillItem) {
        holeFillItem.style.display = rings.length > 1 ? 'flex' : 'none';
    }
}

/**
 * [함수] findContainingPolygonForHole
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
function findContainingPolygonForHole(sourceLayer, sourceGeoJson) {
    const sourceOuterCoords = sourceGeoJson?.geometry?.coordinates?.[0] || [];
    let bestLayer = null;
    let bestArea = Infinity;

    drawnItems.getLayers().forEach(candidate => {
        if (candidate === sourceLayer) return;
        if (!isSimplePolygonLayer(candidate)) return;
        if (candidate?.feature?.properties?.isHidden) return;

        const candidateGeoJson = candidate.toGeoJSON();
        let isInside = false;

        try {
            isInside = turf.booleanWithin(sourceGeoJson, candidateGeoJson);
        } catch (err) {
            isInside = false;
        }

        if (!isInside && Array.isArray(sourceOuterCoords) && sourceOuterCoords.length > 0) {
            try {
                isInside = sourceOuterCoords.every(coord =>
                    turf.booleanPointInPolygon(turf.point(coord), candidateGeoJson, { ignoreBoundary: false })
                );
            } catch (err) {
                isInside = false;
            }
        }

        if (!isInside) return;

        let area = Infinity;
        try {
            area = calculateProjectedAreaM2(candidateGeoJson);
        } catch (err) {
            area = Infinity;
        }

        if (area < bestArea) {
            bestArea = area;
            bestLayer = candidate;
        }
    });

    return bestLayer;
}

/**
 * [함수] handleBottomSheetEdit
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 이벤트 컨텍스트를 해석해 예외/가드 조건을 먼저 처리하고,
 *        조건에 맞는 작업 함수로 분기해 사용자 의도에 맞는 동작을 실행한다.
 */
export function handleBottomSheetEdit() {
    const layerId = currentBottomSheetLayerId;
    closeBottomSheet();
    if (layerId !== null) {
        enableSingleLayerEdit(layerId);
    }
}

/**
 * [함수] handleBottomSheetStyle
 * [역할] 현재 선택한 기록의 스타일 설정 모달을 연다.
 * [원리] 바텀시트 더보기 메뉴만 닫고, 공통 스타일 모달 진입점을 현재 레이어 ID로 호출한다.
 */
export function handleBottomSheetStyle() {
    hideBottomSheetMoreMenu();

    if (currentBottomSheetLayerId !== null && window.openStyleModal) {
        window.openStyleModal(currentBottomSheetLayerId);
    }
}

/**
 * [함수] handleBottomSheetDelete
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 이벤트 컨텍스트를 해석해 예외/가드 조건을 먼저 처리하고,
 *        조건에 맞는 작업 함수로 분기해 사용자 의도에 맞는 동작을 실행한다.
 */
export function handleBottomSheetDelete() {
    if (currentBottomSheetLayerId !== null) {
        deleteLayerById(currentBottomSheetLayerId);
    } else {
        closeBottomSheet();
    }
}

/**
 * [함수] handleBottomSheetHole
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 선택 폴리곤과 포함 관계를 turf로 판정해 대상 폴리곤을 찾고,
 *        링 방향(orientation)을 보정해 hole ring을 삽입한 뒤 저장/리스트/UI를 연쇄 갱신한다.
 */
export async function handleBottomSheetHole() {
    hideBottomSheetMoreMenu();

    if (currentBottomSheetLayerId === null) {
        closeBottomSheet();
        return;
    }

    const sourceLayer = drawnItems.getLayers().find(l => l.feature?.properties?.id === currentBottomSheetLayerId);
    if (!sourceLayer) {
        alert("선택한 도형을 찾을 수 없습니다.");
        closeBottomSheet();
        return;
    }

    const sourceRings = getNormalizedPolygonRings(sourceLayer);
    if (sourceRings.length !== 1) {
        return;
    }

    const sourceOuterRing = sourceRings[0];
    if (sourceOuterRing.length < 3) {
        alert("구멍으로 변환할 폴리곤 좌표가 올바르지 않습니다.");
        return;
    }

    const sourceGeoJson = sourceLayer.toGeoJSON();
    const targetLayer = findContainingPolygonForHole(sourceLayer, sourceGeoJson);

    if (!targetLayer) {
        alert("현재 폴리곤을 포함하는 배경 폴리곤을 찾지 못했습니다.");
        return;
    }

    if (!await showAppConfirm("선택한 폴리곤의 모양으로 배경 폴리곤에 구멍을 그립니다. 선택한 폴리곤은 기록에서 삭제됩니다.", { title: '구멍 만들기' })) return;

    const targetLatLngs = targetLayer.getLatLngs();
    if (!Array.isArray(targetLatLngs) || targetLatLngs.length === 0 || !Array.isArray(targetLatLngs[0])) {
        alert("배경 폴리곤 좌표를 읽을 수 없습니다.");
        return;
    }

    const targetOuterRing = normalizeRing(targetLatLngs[0]);
    if (targetOuterRing.length < 3) {
        alert("배경 폴리곤 좌표가 올바르지 않습니다.");
        return;
    }

    const holeRing = cloneRing(sourceOuterRing);
    const outerSign = getRingOrientationSign(targetOuterRing);
    const holeSign = getRingOrientationSign(holeRing);
    if (outerSign !== 0 && holeSign !== 0 && outerSign === holeSign) {
        holeRing.reverse();
    }

    const nextLatLngs = targetLatLngs.map(ring => normalizeRing(ring));
    nextLatLngs.push(holeRing);

    targetLayer.setLatLngs(nextLatLngs);
    updateLayerInfo(targetLayer);
    drawnItems.removeLayer(sourceLayer);

    closeBottomSheet();
    saveToStorage();
    renderSurveyList();
    scheduleViewportVectorOptimization();
    targetLayer.openPopup();
}

/**
 * [함수] handleBottomSheetHoleFill
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 홀 링 목록을 분리해 개별 면 레이어를 생성하고 속성을 상속한 뒤,
 *        원본 폴리곤은 외곽 링만 남겨 복구하면서 저장·렌더·최적화를 함께 실행한다.
 */
export async function handleBottomSheetHoleFill() {
    hideBottomSheetMoreMenu();

    if (currentBottomSheetLayerId === null) {
        closeBottomSheet();
        return;
    }

    const sourceLayer = drawnItems.getLayers().find(l => l.feature?.properties?.id === currentBottomSheetLayerId);
    if (!sourceLayer) {
        alert("선택한 도형을 찾을 수 없습니다.");
        closeBottomSheet();
        return;
    }

    if (!hasHoleRings(sourceLayer)) {
        alert("채울 수 있는 구멍이 없습니다.");
        return;
    }

    const rings = getNormalizedPolygonRings(sourceLayer);
    const outerRing = rings[0];
    const holeRings = rings.slice(1);
    const holeCount = holeRings.length;

    if (!await showAppConfirm(`현재 폴리곤의 구멍 ${holeCount}개를 면 기록으로 생성하고, 원본 폴리곤의 구멍은 채웁니다.`, { title: '구멍 채우기' })) return;

    const parentProps = sourceLayer.feature?.properties || {};
    const parentMemo = getRecordName(parentProps, getTimestampString());
    const parentColor = parentProps.customColor || getRandomColor();

    const existingIds = new Set(
        drawnItems.getLayers()
            .map(layer => layer?.feature?.properties?.id)
            .filter(id => id !== undefined && id !== null)
    );

    const makeUniqueId = () => {
        let id = Date.now() + Math.floor(Math.random() * 1000000);
        while (existingIds.has(id)) {
            id += 1;
        }
        existingIds.add(id);
        return id;
    };

    const newLayers = [];

    holeRings.forEach((holeRing, index) => {
        const newLayer = L.polygon(cloneRing(holeRing));
        const customFill = Object.prototype.hasOwnProperty.call(parentProps, 'customFill')
            ? parentProps.customFill
            : undefined;
        const parentWeight = Number.isFinite(Number(parentProps.customWeight))
            ? Math.min(5, Math.max(1, parseInt(parentProps.customWeight, 10)))
            : 3;
        const customDashArray = parentProps.customDashArray === 'none'
            ? 'none'
            : (parentProps.customDashArray || null);

        const fillMemo = holeCount === 1
            ? `${parentMemo} (구멍 채움)`
            : `${parentMemo} (구멍 채움 ${index + 1})`;

        newLayer.feature = {
            type: "Feature",
            properties: setRecordName({
                id: makeUniqueId(),
                isHidden: false,
                customColor: parentColor,
                customWeight: parentWeight,
                customLineStyle: parentProps.customLineStyle || null,
                customDashArray: customDashArray,
                ...(customFill === undefined ? {} : { customFill: customFill })
            }, fillMemo)
        };

        const fillOpacity = customFill === false
            ? 0
            : (customFill === true ? 0.2 : (AppState.isPolygonFill ? 0.2 : 0));

        newLayer.setStyle({
            color: parentColor,
            fillColor: parentColor,
            weight: parentWeight,
            dashArray: customDashArray === 'none' ? null : customDashArray,
            lineCap: 'round',
            lineJoin: 'round',
            stroke: customDashArray !== 'none',
            fillOpacity: fillOpacity
        });

        updateLayerInfo(newLayer);
        drawnItems.addLayer(newLayer);
        newLayers.push(newLayer);
    });

    sourceLayer.setLatLngs([cloneRing(outerRing)]);
    updateLayerInfo(sourceLayer);

    closeBottomSheet();
    saveToStorage();
    renderSurveyList();
    scheduleViewportVectorOptimization();

    if (newLayers.length > 0) {
        newLayers[0].openPopup();
    } else {
        sourceLayer.openPopup();
    }
}

/**
 * [함수] handleBottomSheetBringToFront
 * [역할] 선택한 기록 레이어를 현재 프로젝트의 최상단으로 이동한다.
 * [원리] drawnItems 레이어 배열에서 현재 레이어를 끝으로 재배치한 뒤 저장과 화면 갱신을 동기화한다.
 */
export function handleBottomSheetBringToFront() {
    moveCurrentBottomSheetLayer('front');
}

/**
 * [함수] handleBottomSheetBringForward
 * [역할] 선택한 기록 레이어를 한 단계 위로 이동한다.
 * [원리] drawnItems 레이어 배열에서 현재 레이어 인덱스를 1 증가시켜 재배치한 뒤 저장 상태를 맞춘다.
 */
export function handleBottomSheetBringForward() {
    moveCurrentBottomSheetLayer('forward');
}

/**
 * [함수] handleBottomSheetSendToBack
 * [역할] 선택한 기록 레이어를 현재 프로젝트의 최하단으로 이동한다.
 * [원리] drawnItems 레이어 배열에서 현재 레이어를 시작 위치로 재배치한 뒤 저장과 렌더를 갱신한다.
 */
export function handleBottomSheetSendToBack() {
    moveCurrentBottomSheetLayer('back');
}

/**
 * [함수] handleBottomSheetSendBackward
 * [역할] 선택한 기록 레이어를 한 단계 아래로 이동한다.
 * [원리] drawnItems 레이어 배열에서 현재 레이어 인덱스를 1 감소시켜 재배치한 뒤 저장 상태를 반영한다.
 */
export function handleBottomSheetSendBackward() {
    moveCurrentBottomSheetLayer('backward');
}

/**
 * [함수] createAddressInfoSection
 * [역할] 주소 정보 영역 HTML을 생성한다.
 * [원리] 지번과 도로명 주소 블록을 조건부로 조합해 반환한다.
 */
function createAddressInfoSection(parcelAddr, roadAddr) {
    return `<div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:5px;">
                    <b onclick="copyText(this.innerText, false, '지번 주소')" style="color:#3B82F6; font-size: 16px; line-height: 1.2; word-break: keep-all; cursor: pointer;">${parcelAddr}</b>
                </div>
            </div>
            <hr style="margin: 12px 0; border: none; border-top: 1px solid #f0f0f0;">
            ${roadAddr ? `
            <div style="display:flex; align-items:baseline; font-size: 14px; color: #555; margin-bottom: 8px;">
                <span class="badge-road" style="flex-shrink:0; width:33px; display:inline-block; text-align:center;">도로명</span>
                <span onclick="copyText(this.innerText, false, '도로명 주소')" style="margin-left: 5px; line-height: 1.5; word-break: keep-all; cursor: pointer;">${roadAddr}</span>
            </div>` : ''}`;
}

/**
 * [함수] createCoordInfoSection
 * [역할] 좌표 정보 영역 HTML을 생성한다.
 * [원리] 우편번호 존재 여부에 따라 하단 여백을 조정하면서 좌표 블록을 반환한다.
 */
function createCoordInfoSection(infoText, zipcode) {
    return `<div style="display:flex; align-items:baseline; font-size: 14px; color: #555; margin-bottom: ${zipcode ? '8px' : '30px'};">
                <span class="badge-coord" style="flex-shrink:0; width:33px; display:inline-block; text-align:center;">좌표</span>
                <div onclick="copyText(this.innerText, false, '좌표')" style="margin-left: 5px; line-height: 1.5; cursor: pointer;">${infoText}</div>
            </div>`;
}

/**
 * [함수] createZipcodeInfoSection
 * [역할] 우편번호 정보 영역 HTML을 생성한다.
 * [원리] 우편번호가 있을 때만 기존 스타일을 유지한 채 하단 블록으로 반환한다.
 */
function createZipcodeInfoSection(zipcode) {
    if (!zipcode) return '';

    return `<div style="display:flex; align-items:baseline; font-size: 14px; color: #555; margin-bottom: 30px;">
                <span style="background:#f3f4f6; color:#4b5563; padding:2px 4px; border-radius:3px; font-size:10px; width:33px; display:inline-block; text-align:center; flex-shrink:0;">우편</span>
                <span onclick="copyText(this.innerText, false, '우편번호')" style="margin-left: 5px; line-height: 1.5; cursor: pointer;">${zipcode}</span>
            </div>`;
}

/**
 * [함수] createPrimaryActionButtonsSection
 * [역할] 상단 액션 버튼 영역 HTML을 생성한다.
 * [원리] 위치 저장/영역 저장/공유/검색/길찾기 버튼을 기존 순서와 인라인 이벤트로 조합해 반환한다.
 */
function createPrimaryActionButtonsSection(parcelAddr, lat, lng) {
    return `<div style="display:flex; gap:5px; justify-content:center;">
                <button class="popup-btn" style="flex:1; background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="saveCurrentPoint(${lat}, ${lng}, '${parcelAddr}')">
                    <div style="width:16px; height:16px;">${SVG_ICONS.marker}</div>
                </button>
                <button class="popup-btn" style="flex:1; background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="saveCurrentBoundary('${parcelAddr}')">
                    <div style="width:16px; height:16px;">${SVG_ICONS.polygon}</div>
                </button>
                <button class="popup-btn" style="flex:1; background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="shareLocationText('${parcelAddr}', '${lat}', '${lng}')">
                    <svg viewBox="0 0 24 24" style="width:16px; height:16px; fill:currentColor;"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.66 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                </button>
                <button class="popup-btn" style="flex:1; background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="openSearchModal('${parcelAddr}')">
                    <div style="width:16px; height:16px;">${SVG_ICONS.search}</div>
                </button>
                <button class="popup-btn" style="flex:1; background:#fff; color:#555; border:1px solid #ddd; display:flex; align-items:center; justify-content:center; gap:4px;" onclick="openNavModal('${parcelAddr}', ${lat}, ${lng})">
                    <div style="width:16px; height:16px;">${SVG_ICONS.car}</div>
                </button>
            </div>`;
}

/**
 * [함수] createSecondaryActionButtonsSection
 * [역할] 하단 외부 연계 버튼 영역 HTML을 생성한다.
 * [원리] 토지e음 조회 버튼과 K-GeoP 조회 버튼을 기존 인라인 이벤트 그대로 묶어 반환한다.
 */
function createSecondaryActionButtonsSection(parcelAddr, lat, lng) {
    return `<div style="display:flex; gap:5px; justify-content:center;">
                <button id="btn-landeum-popup" class="popup-btn disabled" style="flex:1;" onclick="fetchAndHighlightBoundary(${lng}, ${lat})">토지e음 조회</button>
                <button class="popup-btn" style="flex:1; background:#007bff; color:#fff; border:1px solid #007bff;" onclick="
                    copyText('${parcelAddr}', true);
                    setTimeout(() => {
                        alert('주소가 복사되었습니다.\\nK-GeoP 검색창에 붙여넣기 하세요.');
                        window.open('https://kgeop.go.kr/info/infoMap.do?initMode=L', '_blank');
                    }, 500);
                ">K-GeoP 조회</button>
            </div>`;
}

/**
 * [함수] createActionButtonsSection
 * [역할] 액션 버튼 전체 영역 HTML을 생성한다.
 * [원리] 상단/하단 버튼 그룹을 세로로 묶어 바텀시트 액션 영역 전체를 반환한다.
 */
function createActionButtonsSection(parcelAddr, lat, lng) {
    return `<div style="margin-top: 10px; display:flex; flex-direction:column; gap:5px;">
                ${createPrimaryActionButtonsSection(parcelAddr, lat, lng)}
                ${createSecondaryActionButtonsSection(parcelAddr, lat, lng)}
            </div>`;
}

/**
 * [함수] createInfoPopupContent
 * [역할] 위치 정보 바텀시트 본문 HTML을 생성한다.
 * [원리] 주소/좌표/버튼 영역 생성 함수를 조합해 기존 본문 구조를 유지한 채 반환한다.
 */
function createInfoPopupContent(parcelAddr, roadAddr, zipcode, infoText, lat, lng) {
    return `<div style="min-width: 210px;">
                ${createAddressInfoSection(parcelAddr, roadAddr)}
                ${createCoordInfoSection(infoText, zipcode)}
                ${createZipcodeInfoSection(zipcode)}
            </div>
            ${createActionButtonsSection(parcelAddr, lat, lng)}`;
}

/**
 * [함수] showInfoPopup
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 역지오코딩 JSONP 결과에서 지번/도로명/우편번호를 추출하고,
 *        현재 좌표 표시 모드에 맞는 텍스트를 구성해 바텀시트 콘텐츠로 조립한다.
 */
export function showInfoPopup(lat, lng, options = {}) {
    const callbackName = 'vworld_popup_' + Math.floor(Math.random() * 100000);
    window[callbackName] = function (data) {
        let parcelAddr = "주소 정보 없음";
        let roadAddr = "";
        let zipcode = "";

        if (data.response.status === "OK") {
            const results = data.response.result;
            let tempParcelZip = "";
            let tempRoadZip = "";

            results.forEach(item => {
                if (item.type === 'parcel') {
                    parcelAddr = item.text;
                    if (item.zipcode) tempParcelZip = item.zipcode;
                }
                else if (item.type === 'road') {
                    roadAddr = item.text;
                    if (item.zipcode) tempRoadZip = item.zipcode;
                }
            });

            zipcode = tempRoadZip || tempParcelZip || "";

            if (parcelAddr === "주소 정보 없음" && roadAddr !== "") {
                parcelAddr = roadAddr;
                roadAddr = "";
            }
        }

        if (AppState.currentSearchMarker) map.removeLayer(AppState.currentSearchMarker);
        AppState.currentSearchMarker = L.marker([lat, lng], { icon: createColoredMarkerIcon('#FF0000') }).addTo(map);

        const infoText = formatCoordinate(lat, lng, AppState.coordMode, {
            separator: ', ',
            tmSeparator: ' | '
        });

        const content = createInfoPopupContent(parcelAddr, roadAddr, zipcode, infoText, lat, lng);
        if (document.getElementById('bottom-sheet-more-btn')) {
            document.getElementById('bottom-sheet-more-btn').style.display = 'none';
        }
        openBottomSheet(parcelAddr, content);
        const targetZoom = Number.isFinite(Number(options.zoom)) ? Number(options.zoom) : map.getZoom();
        flyToWithBottomSheet([lat, lng], targetZoom, { animate: true, duration: 0.3 });
        delete window[callbackName];
        document.getElementById(callbackName)?.remove();
    };
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lng},${lat}&format=jsonp&type=BOTH&zipcode=true&simple=false&key=${VWORLD_API_KEY}&callback=${callbackName}`;
    document.body.appendChild(script);
}

/**
 * [함수] fetchAndHighlightBoundary
 * [역할] 외부 데이터를 조회해 결과를 지도/화면에 반영한다.
 * [원리] 외부 API 응답 상태와 결과 유효성을 검증하고,
 *        성공 시 지도 레이어/버튼을 갱신하고 실패 시 재시도 가능한 상태로 되돌린다.
 */
export function fetchAndHighlightBoundary(x, y) {
    const callbackName = 'vworld_boundary_' + Math.floor(Math.random() * 100000);
    const btn = document.getElementById('btn-landeum-popup');
    if (btn) {
        btn.innerText = "로딩 중...";
        btn.classList.add('disabled');
    }
    window[callbackName] = function (data) {
        delete window[callbackName];
        document.getElementById(callbackName)?.remove();
        if (data.response.status === "OK" && data.response.result.featureCollection.features.length > 0) {
            const feature = data.response.result.featureCollection.features[0];
            if (AppState.currentBoundaryLayer) map.removeLayer(AppState.currentBoundaryLayer);
            AppState.currentBoundaryLayer = L.geoJSON(feature, {
                style: {
                    color: '#FF0000', weight: 4, opacity: 0.8,
                    fillColor: '#FF0000', fillOpacity: 0
                }
            }).addTo(map);
            if (feature.properties && feature.properties.pnu) {
                updatePopupLandEumButton(feature.properties.pnu);
            }
        } else {
            if (btn) {
                btn.innerText = "재시도";
                btn.classList.remove('disabled');
                btn.disabled = false;
                btn.style.backgroundColor = "#999";
                btn.style.color = "white";
                btn.onclick = () => fetchAndHighlightBoundary(x, y);
            }
        }
    };
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_API_KEY}&domain=${window.location.hostname}&geomFilter=POINT(${x} ${y})&format=json&errorformat=json&callback=${callbackName}`;
    document.body.appendChild(script);
}

/**
 * [함수] updatePopupLandEumButton
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
export function updatePopupLandEumButton(pnu) {
    const btn = document.getElementById('btn-landeum-popup');
    if (btn) {
        btn.classList.remove('disabled');
        btn.disabled = false;
        btn.onclick = () => {
            window.open(`https://www.eum.go.kr/web/ar/lu/luLandDet.jsp?pnu=${pnu}&mode=search&isNoScr=script&add=land`, '_blank');
        };
        btn.innerText = "토지e음 조회";
        btn.style.backgroundColor = "#007bff";
        btn.style.color = "#fff";
        btn.style.border = "1px solid #007bff";
    }
}
