/* ==========================================================================
   [모듈] 위치 추적과 트랙 기록 (features/tracking.js)
   [역할]
   - 현재 위치 표시, 내 위치 이동, 이동 경로 트랙 기록 시작/완료/취소를 관리합니다.
   - 트랙 중 사진 지점 추가, 거리 계산, Android 백그라운드 기록 연동을 처리합니다.
   [참고]
   - GPS 추적, 트랙 기록, 현재 위치 버튼 문제가 생기면 확인합니다.
   ========================================================================== */
import { L } from '../vendor-globals.js';
import { AUTH_FEATURES } from '../auth-policy.js';
import { AppState } from '../state.js';
import { map } from '../map.js';
import { currentEditLayerId, drawnItems, getUniqueRecordName, recordSvgRenderer } from '../draw.js';
import { getAddressFromCoords, saveToStorage } from '../data.js';
import {
    closeBottomSheet,
    highlightButton,
    openPhotoSelectMenu,
    renderSurveyList,
    resetButtonStyles,
    switchSidebarTab,
    updateCoordDisplay,
    updateLayerInfo
} from '../ui.js';
import {
    calculateProjectedDistanceMeters,
    createColoredMarkerIcon,
    getRandomColor,
    getTimestampString,
    setRecordName,
    setRecordingModeActive,
    resizeImage
} from '../utils.js';
import { showAppConfirm, showTextPrompt } from '../app-dialog.js';
import { getTrackLocationProvider, nativeTrackLocationProvider } from '../track-location-provider.js';
import { readTrackPoint, shouldAppendTrackPoint } from '../track-point-filter.js';
import { webTrackSessionStore } from '../web-track-session-store.js';

const LOCATION_VECTOR_PANE = 'locationVectorPane';
if (!map.getPane(LOCATION_VECTOR_PANE)) {
    map.createPane(LOCATION_VECTOR_PANE);
    map.getPane(LOCATION_VECTOR_PANE).style.zIndex = '590';
    map.getPane(LOCATION_VECTOR_PANE).style.pointerEvents = 'none';
}
const locationSvgRenderer = L.svg({ pane: LOCATION_VECTOR_PANE, padding: 0.15 });

let isLocationMapMoving = false;
let isLocationMapZooming = false;
let pendingLocationPosition = null;
let locationRenderFrame = null;
let hasReportedTrackLocationError = false;
let activeTrackLocationProvider = null;
let isWebResumePromptOpen = false;
let isTrackCompletionInProgress = false;

function handleTrackPosition(position) {
    const point = readTrackPoint(position);
    const shouldAppend = shouldAppendTrackPoint({
        point,
        previousPoint: AppState.lastTrackPoint,
        minimumDistanceMeters: AppState.trackInterval,
        distanceBetween: calculateProjectedDistanceMeters
    });

    if (!shouldAppend || !AppState.trackPolyline) return;

    const newLatLng = L.latLng(point.latitude, point.longitude);
    AppState.trackPolyline.addLatLng(newLatLng);
    AppState.lastTrackLatLng = newLatLng;
    AppState.lastTrackPoint = point;
    if (!AppState.isNativeTrackRecording) {
        webTrackSessionStore.appendPoint(point).catch(error => {
            console.warn('[Track] 웹 임시 좌표 저장 실패', error);
        });
    }
    if (document.visibilityState !== 'hidden') map.panTo(newLatLng);
}

function handleTrackLocationError(error) {
    console.warn('[Track] 위치 정보를 수신하지 못했습니다.', error);
    if (hasReportedTrackLocationError) return;
    hasReportedTrackLocationError = true;

    if (error?.code === 1 || error?.code === 'LOCATION_PERMISSION_DENIED') {
        alert('위치 권한이 없어 트랙을 기록할 수 없습니다. 기기 설정에서 위치 권한을 허용해 주세요.');
    }
}

async function clearNativeTrackSessionSafely() {
    try {
        await nativeTrackLocationProvider.clearPendingSession();
    } catch (error) {
        console.warn('[Track] 임시 트랙 삭제 실패', error);
    }
}

function getFilteredSessionLatLngs(session) {
    const accepted = [];
    let previousPoint = null;

    for (const rawPoint of session?.points || []) {
        const point = readTrackPoint(rawPoint);
        if (!shouldAppendTrackPoint({
            point,
            previousPoint,
            minimumDistanceMeters: AppState.trackInterval,
            distanceBetween: calculateProjectedDistanceMeters
        })) continue;

        accepted.push(L.latLng(point.latitude, point.longitude));
        previousPoint = point;
    }
    return { accepted, previousPoint };
}

async function syncNativeTrackPolyline() {
    if (!AppState.isNativeTrackRecording || !AppState.trackPolyline) return;
    const result = await nativeTrackLocationProvider.getPendingSession();
    const { accepted, previousPoint } = getFilteredSessionLatLngs(result?.session);
    AppState.trackPolyline.setLatLngs(accepted);
    AppState.lastTrackPoint = previousPoint;
    AppState.lastTrackLatLng = accepted.length ? accepted[accepted.length - 1] : null;
}

function activateTrackUi(initialLatLngs = []) {
    AppState.currentDrawer = 'track';
    closeBottomSheet();
    highlightButton('btn-track');
    setRecordingModeActive(true);
    AppState.lastTrackLatLng = initialLatLngs.length ? initialLatLngs[initialLatLngs.length - 1] : null;
    AppState.lastTrackPoint = AppState.lastTrackLatLng
        ? { latitude: AppState.lastTrackLatLng.lat, longitude: AppState.lastTrackLatLng.lng }
        : null;

    const randomColor = getRandomColor();
    AppState.trackPolyline = L.polyline(initialLatLngs, {
        renderer: recordSvgRenderer,
        color: randomColor,
        weight: 3,
        opacity: 0.85
    }).addTo(map);
    document.getElementById('track-action-toolbar').style.display = 'flex';
}

function handleNativeTrackStatus(status) {
    if (status?.running === false && status?.message) {
        console.info(`[Track] ${status.message}`);
    }
}

function renderLocationMarker(pos) {
    const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);

    if (!AppState.trackingCircle) {
        AppState.trackingCircle = L.circle(latlng, {
            renderer: locationSvgRenderer,
            pane: LOCATION_VECTOR_PANE,
            radius: pos.coords.accuracy,
            weight: 1,
            color: 'blue',
            opacity: 0.3,
            fillOpacity: 0.1,
            interactive: false
        }).addTo(map);
    } else {
        AppState.trackingCircle.setLatLng(latlng).setRadius(pos.coords.accuracy);
    }

    const arrowSvg = `<div style="transform: rotate(${AppState.lastHeading}deg); transform-origin: center center; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 100 100" width="20" height="20" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));">
                            <path d="M50 0 L100 100 L50 80 L0 100 Z" fill="#007bff" stroke="white" stroke-width="10" />
                        </svg>
                    </div>`;
    const arrowIcon = L.divIcon({ className: '', html: arrowSvg, iconSize: [20, 20], iconAnchor: [10, 10] });

    if (!AppState.trackingMarker) {
        AppState.trackingMarker = L.marker(latlng, { icon: arrowIcon, zIndexOffset: 1000 }).addTo(map);
    } else {
        AppState.trackingMarker.setLatLng(latlng).setIcon(arrowIcon);
    }
}

function scheduleLocationRenderAfterMapGesture() {
    if (isLocationMapMoving || isLocationMapZooming || locationRenderFrame !== null) return;

    locationRenderFrame = window.requestAnimationFrame(() => {
        locationRenderFrame = null;
        if (isLocationMapMoving || isLocationMapZooming) return;
        if (pendingLocationPosition) {
            const latestPosition = pendingLocationPosition;
            pendingLocationPosition = null;
            renderLocationMarker(latestPosition);
        }
        if (typeof AppState.trackingCircle?.redraw === 'function') {
            AppState.trackingCircle.redraw();
        }
    });
}

map.on('movestart', () => { isLocationMapMoving = true; });
map.on('zoomstart', () => { isLocationMapZooming = true; });
map.on('moveend', () => {
    isLocationMapMoving = false;
    scheduleLocationRenderAfterMapGesture();
});
map.on('zoomend', () => {
    isLocationMapZooming = false;
    scheduleLocationRenderAfterMapGesture();
});

/**
 * 위치 추적 성공 콜백입니다.
 * 동작 원리: 위치 마커/좌표 UI 갱신 후, 팔로우 모드일 때만 지도 중심을 이동합니다.
 */
export function onTrackSuccess(pos) {
    updateLocationMarker(pos);
    if (AppState.isFollowing) map.panTo([pos.coords.latitude, pos.coords.longitude]);
}

/**
 * 현재 위치 관련 시각 요소(정확도 원/방향 마커/좌표/주소)를 갱신합니다.
 * 동작 원리: heading 값을 회전 아이콘에 반영해 이동 방향을 직관적으로 표시합니다.
 */
function updateLocationMarker(pos) {
    if (pos.coords.accuracy === 0) return;
    if (typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading)) { AppState.lastHeading = pos.coords.heading; }

    getAddressFromCoords(pos.coords.latitude, pos.coords.longitude);
    AppState.lastGpsLat = pos.coords.latitude;
    AppState.lastGpsLng = pos.coords.longitude;
    updateCoordDisplay();

    if (isLocationMapMoving || isLocationMapZooming) {
        pendingLocationPosition = pos;
        return;
    }
    renderLocationMarker(pos);
}

/**
 * 내 위치 자동 추적(팔로우) 모드를 토글합니다.
 */
export function toggleTracking() {
    const btn = document.getElementById('toggle-track-btn');
    if (!navigator.geolocation) { alert("GPS 미지원"); return; }

    if (AppState.isFollowing) {
        AppState.isFollowing = false;
        btn.classList.remove('tracking-btn-on');
        btn.classList.remove('tracking-active');
    } else {
        AppState.isFollowing = true;
        navigator.geolocation.getCurrentPosition(onTrackSuccess, null, { enableHighAccuracy: true });
        btn.classList.add('tracking-btn-on');
        btn.classList.add('tracking-active');
    }
}

/**
 * 현재 위치로 한 번 이동합니다.
 * 동작 원리: 그리기/편집 중에는 작업 중단을 피하기 위해 동작을 막습니다.
 */
export function findMe() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    if (!navigator.geolocation) { alert("지역 위치 서비스가 지원되지 않는 디바이스입니다."); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
        map.setView([pos.coords.latitude, pos.coords.longitude], 19);
    }, function () { alert("위치 정보를 가져오는 데 실패했습니다."); }, { enableHighAccuracy: true });
}

/**
 * GPS 트랙 기록을 시작합니다.
 * 동작 원리:
 * - watchPosition으로 연속 좌표를 수집합니다.
 * - 직전 좌표와의 거리가 trackInterval 이상일 때만 선분 점을 추가합니다.
 */
export async function startTrackRecording({ ensureFeatureAccess }) {
    if (!ensureFeatureAccess(AUTH_FEATURES.TRACK_RECORDING, '트랙 기록은 인증된 회원과 관리자 계정만 사용할 수 있습니다.')) return;
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    const provider = getTrackLocationProvider();
    if (!provider.isAvailable()) { alert('그리기 GPS가 지원되지 않는 기기입니다.'); return; }

    const isNative = provider === nativeTrackLocationProvider;
    const confirmMsg = isNative
        ? "트랙 기록을 시작합니다.\n\n1. 화면을 끄거나 다른 앱을 실행해도 알림이 표시되는 동안 GPS 트랙을 계속 기록합니다.\n\n2. 기록 중 [사진 추가] 버튼으로 현재 위치에 사진 기록을 추가할 수 있습니다.\n\n3. 트랙 기록이 비정상적으로 종료될 경우 기록이 임시 저장되며, 다시 트랙 기록을 시작하면 이어서 기록할 수 있습니다.\n\n계속하시겠습니까?"
        : "트랙 기록을 시작합니다.\n\n1. 웹 브라우저에서는 화면을 끄거나 다른 앱을 실행하면 GPS 기록이 중단될 수 있습니다.\n\n2. 기록 중 [사진 추가] 버튼으로 현재 위치에 사진 기록을 추가할 수 있습니다.\n\n3. 트랙 기록이 비정상적으로 종료될 경우 기록이 임시 저장되며, 다시 트랙 기록을 시작하면 이어서 기록할 수 있습니다.\n\n계속하시겠습니까?";

    if (!await showAppConfirm(confirmMsg, { title: '트랙 기록 시작' })) return;

    let initialLatLngs = [];
    if (isNative) {
        const pending = await provider.getPendingSession();
        if (pending?.session?.points?.length) {
            const shouldResume = await showAppConfirm(
                `완료되지 않은 트랙 좌표 ${pending.session.points.length}개가 있습니다. 이어서 기록하시겠습니까?`,
                { title: '트랙 기록 복구', okText: '이어서 기록', cancelText: '취소' }
            );
            if (!shouldResume) return;
            initialLatLngs = getFilteredSessionLatLngs(pending.session).accepted;
        }
    } else {
        const pending = await webTrackSessionStore.getSession();
        if (pending?.points?.length) {
            const shouldResume = await showAppConfirm(
                `웹에 완료되지 않은 트랙 좌표 ${pending.points.length}개가 있습니다. 이어서 기록하시겠습니까?`,
                { title: '트랙 기록 복구', okText: '이어서 기록', cancelText: '취소' }
            );
            if (!shouldResume) return;
            initialLatLngs = getFilteredSessionLatLngs(pending).accepted;
        }
        await webTrackSessionStore.beginOrResume();
    }

    activateTrackUi(initialLatLngs);
    AppState.isNativeTrackRecording = isNative;
    hasReportedTrackLocationError = false;
    activeTrackLocationProvider = provider;

    try {
        AppState.trackLocationSubscription = await provider.start({
            onPosition: handleTrackPosition,
            onError: handleTrackLocationError,
            onStatus: handleNativeTrackStatus,
            minimumDistanceMeters: isNative ? AppState.trackInterval : 0
        });
    } catch (error) {
        if (AppState.trackPolyline) map.removeLayer(AppState.trackPolyline);
        AppState.trackPolyline = null;
        resetTrackUI();
    }
}

/**
 * 동작 중인 GPS watchPosition 구독을 중지합니다.
 */
async function stopTrackWatch() {
    if (AppState.trackLocationSubscription !== null) {
        await activeTrackLocationProvider?.stop(AppState.trackLocationSubscription);
        AppState.trackLocationSubscription = null;
    }
    activeTrackLocationProvider = null;
}

/**
 * 트랙 기록을 취소하고 임시 폴리라인을 제거합니다.
 */
export async function cancelTrackRecording() {
    const wasNative = AppState.isNativeTrackRecording;
    try {
        await stopTrackWatch();
    } catch (error) {
        console.warn('[Track] 위치 수신 중지 실패', error);
    }
    if (wasNative) await clearNativeTrackSessionSafely();
    else await webTrackSessionStore.clear().catch(error => console.warn('[Track] 웹 임시 트랙 삭제 실패', error));
    if (AppState.trackPolyline) { map.removeLayer(AppState.trackPolyline); AppState.trackPolyline = null; }
    resetTrackUI();
}

/**
 * 트랙 기록 UI/상태를 기본값으로 되돌립니다.
 * 동작 원리: 드로어 상태와 트랙 툴바를 한 번에 정리합니다.
 */
function resetTrackUI() {
    AppState.currentDrawer = null;
    AppState.lastTrackLatLng = null;
    AppState.lastTrackPoint = null;
    AppState.isNativeTrackRecording = false;
    setRecordingModeActive(false);
    document.getElementById('track-action-toolbar').style.display = 'none';
    resetButtonStyles();
}

/**
 * 트랙 기록을 확정해 일반 레이어(Polyline)로 저장합니다.
 * 동작 원리: 임시 trackPolyline을 feature가 있는 영구 레이어로 변환한 뒤 저장합니다.
 */
export async function completeTrackRecording() {
    if (isTrackCompletionInProgress || AppState.currentDrawer !== 'track') return false;
    isTrackCompletionInProgress = true;

    try {
        const wasNative = AppState.isNativeTrackRecording;
        if (wasNative) await syncNativeTrackPolyline();

        const currentLatLngs = AppState.trackPolyline ? AppState.trackPolyline.getLatLngs() : [];
        if (currentLatLngs.length < 2) {
            alert('기록된 좌표가 너무 적습니다.');
            await cancelTrackRecording();
            return false;
        }

        // 기록명이 확정되기 전에는 위치 수신과 임시 트랙을 유지합니다.
        // 사용자가 취소하면 아무 상태도 초기화하지 않고 즉시 기록 화면으로 돌아갑니다.
        const memo = await showTextPrompt('기록명 입력:', '트랙_' + getTimestampString());
        if (memo === null) return false;

        let trackGapCount = 0;
        await stopTrackWatch();
        if (wasNative) await syncNativeTrackPolyline();
        else {
            await webTrackSessionStore.markStopped();
            const pending = await webTrackSessionStore.getSession();
            trackGapCount = Array.isArray(pending?.gaps) ? pending.gaps.length : 0;
            const { accepted, previousPoint } = getFilteredSessionLatLngs(pending);
            if (AppState.trackPolyline) AppState.trackPolyline.setLatLngs(accepted);
            AppState.lastTrackPoint = previousPoint;
            AppState.lastTrackLatLng = accepted.length ? accepted[accepted.length - 1] : null;
        }

        const latlngs = AppState.trackPolyline ? AppState.trackPolyline.getLatLngs() : [];
        const trackColor = AppState.trackPolyline ? AppState.trackPolyline.options.color : getRandomColor();
        if (AppState.trackPolyline) { map.removeLayer(AppState.trackPolyline); AppState.trackPolyline = null; }

        const layer = L.polyline(latlngs, { renderer: recordSvgRenderer, color: trackColor, weight: 3, opacity: 0.85 });
        layer.feature = {
            type: 'Feature',
            properties: setRecordName({
                id: Date.now(),
                isHidden: false,
                customColor: trackColor,
                customWeight: 3,
                isTrack: true,
                trackGapCount
            }, getUniqueRecordName(memo || getTimestampString()))
        };

        updateLayerInfo(layer);
        drawnItems.addLayer(layer);
        saveToStorage();
        if (wasNative) await clearNativeTrackSessionSafely();
        else await webTrackSessionStore.clear().catch(error => console.warn('[Track] 웹 임시 트랙 삭제 실패', error));
        renderSurveyList();
        switchSidebarTab('record');
        resetTrackUI();
        return true;
    } finally {
        isTrackCompletionInProgress = false;
    }
}

export async function initializeNativeTrackRecovery() {
    try {
        if (!nativeTrackLocationProvider.isAvailable() || AppState.currentDrawer) return;
        const status = await nativeTrackLocationProvider.getStatus();
        if (!status?.running || !status?.hasPendingSession) return;

        const pending = await nativeTrackLocationProvider.getPendingSession();
        const initialLatLngs = getFilteredSessionLatLngs(pending?.session).accepted;
        activateTrackUi(initialLatLngs);
        AppState.isNativeTrackRecording = true;
        activeTrackLocationProvider = nativeTrackLocationProvider;
        AppState.trackLocationSubscription = await nativeTrackLocationProvider.start({
            onPosition: handleTrackPosition,
            onError: handleTrackLocationError,
            onStatus: handleNativeTrackStatus,
            minimumDistanceMeters: AppState.trackInterval
        });
    } catch (error) {
        console.warn('[Track] 진행 중인 네이티브 트랙 복구 실패', error);
    }
}

export async function initializeTrackRecordingRecovery() {
    await initializeNativeTrackRecovery();
    if (nativeTrackLocationProvider.isAvailable() || AppState.currentDrawer) return;

    try {
        const pending = await webTrackSessionStore.getSession();
        if (!pending?.points?.length) return;

        const shouldContinue = await showAppConfirm(
            `웹에서 완료하지 못한 트랙 좌표 ${pending.points.length}개를 찾았습니다.\n\n계속 기록하지 않으면 지금까지의 좌표를 기록으로 저장할 수 있습니다.`,
            { title: '트랙 기록 복구', okText: '계속 기록', cancelText: '지금 완료' }
        );
        const initialLatLngs = getFilteredSessionLatLngs(pending).accepted;
        activateTrackUi(initialLatLngs);
        AppState.isNativeTrackRecording = false;

        await webTrackSessionStore.beginOrResume();
        activeTrackLocationProvider = getTrackLocationProvider();
        AppState.trackLocationSubscription = await activeTrackLocationProvider.start({
            onPosition: handleTrackPosition,
            onError: handleTrackLocationError
        });

        if (!shouldContinue) {
            await completeTrackRecording();
            return;
        }
    } catch (error) {
        console.warn('[Track] 웹 임시 트랙 복구 실패', error);
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && AppState.isNativeTrackRecording) {
        syncNativeTrackPolyline().catch(error => console.warn('[Track] 백그라운드 좌표 동기화 실패', error));
        return;
    }

    if (AppState.currentDrawer !== 'track' || AppState.isNativeTrackRecording) return;
    if (document.visibilityState === 'hidden') {
        webTrackSessionStore.markHidden().catch(error => console.warn('[Track] 화면 이탈 기록 실패', error));
        return;
    }

    if (document.visibilityState === 'visible' && !isWebResumePromptOpen) {
        isWebResumePromptOpen = true;
        webTrackSessionStore.markVisible()
            .then(() => showAppConfirm(
                '화면을 벗어난 동안 브라우저의 GPS가 중단됐을 수 있어 경로에 공백이 생길 수 있습니다.',
                { title: '트랙 기록 확인', okText: '계속 기록', cancelText: '지금 완료' }
            ))
            .then(shouldContinue => {
                if (!shouldContinue && AppState.currentDrawer === 'track') return completeTrackRecording();
                return undefined;
            })
            .catch(error => console.warn('[Track] 웹 트랙 복귀 처리 실패', error))
            .finally(() => { isWebResumePromptOpen = false; });
    }
});

/**
 * 트랙 기록 중 현재 위치에 사진 포인트를 추가합니다.
 * 동작 원리: 파일 선택이 실제 완료된 뒤에만 현재 track 색상의 사진 마커를 생성합니다.
 */
export function addTrackPhotoPoint(event, { ensureFeatureAccess }) {
    if (!ensureFeatureAccess(AUTH_FEATURES.PHOTO_RECORDING, '사진 추가는 인증된 회원과 관리자 계정만 사용할 수 있습니다.')) return;
    if (!AppState.lastTrackLatLng) { alert('GPS 위치 수신 대기 중...'); return; }
    const trackColor = AppState.trackPolyline ? AppState.trackPolyline.options.color : '#3388ff';
    const markerId = Date.now();
    const latlng = L.latLng(AppState.lastTrackLatLng.lat, AppState.lastTrackLatLng.lng);

    const tempId = `temp-inputs-${markerId}`;
    if (!document.getElementById(tempId)) {
        const div = document.createElement('div');
        div.id = tempId; div.style.display = 'none';
        div.innerHTML = `<input type="file" id="input-cam-${markerId}" accept="image/*" capture="environment">
                         <input type="file" id="input-gal-${markerId}" accept="image/*" multiple>`;
        document.body.appendChild(div);

        const handleTrackPhotoFiles = (input) => {
            processTrackPhotoPointFiles(input, markerId, latlng, trackColor, { ensureFeatureAccess });
        };
        div.querySelector(`#input-cam-${markerId}`)?.addEventListener('change', (e) => handleTrackPhotoFiles(e.target));
        div.querySelector(`#input-gal-${markerId}`)?.addEventListener('change', (e) => handleTrackPhotoFiles(e.target));
    }
    openPhotoSelectMenu(event, markerId);
}

function processTrackPhotoPointFiles(input, markerId, latlng, trackColor, { ensureFeatureAccess }) {
    if (!ensureFeatureAccess(AUTH_FEATURES.PHOTO_RECORDING, '사진 추가는 인증된 회원과 관리자 계정만 사용할 수 있습니다.')) {
        input.value = '';
        return;
    }
    const files = input.files;
    if (!files || files.length === 0) return;
    if (files.length > 5) {
        alert('사진은 최대 5장까지만 저장할 수 있습니다.');
        input.value = '';
        return;
    }

    const promises = Array.from(files).map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                resizeImage(e.target.result, 800, 0.8).then(resolve);
            };
            reader.readAsDataURL(file);
        });
    });

    Promise.all(promises).then(photos => {
        const recordName = '트랙사진_' + getTimestampString();
        const marker = L.marker(latlng, { icon: createColoredMarkerIcon(trackColor, '📷', 3) });
        marker.feature = {
            type: 'Feature',
            properties: setRecordName({
                id: markerId,
                isHidden: false,
                customColor: trackColor,
                customEmoji: '📷',
                customMarkerSize: 3,
                photos
            }, getUniqueRecordName(recordName))
        };
        drawnItems.addLayer(marker);
        updateLayerInfo(marker);
        saveToStorage();
        renderSurveyList();

        input.value = '';
        const tempContainer = document.getElementById(`temp-inputs-${markerId}`);
        if (tempContainer) tempContainer.remove();
    });
}
