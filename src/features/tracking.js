/* ==========================================================================
   [모듈] 위치 추적과 트랙 기록 (features/tracking.js)
   [역할]
   - 현재 위치 표시, 내 위치 이동, 이동 경로 트랙 기록 시작/완료/취소를 관리합니다.
   - 트랙 중 사진 지점 추가, 거리 계산, 화면 꺼짐 방지 연동을 처리합니다.
   [참고]
   - GPS 추적, 트랙 기록, 현재 위치 버튼 문제가 생기면 확인합니다.
   ========================================================================== */
import { AUTH_FEATURES } from '../auth.js';
import { AppState } from '../state.js';
import { map } from '../map.js';
import { currentEditLayerId, drawnItems } from '../draw.js';
import { getAddressFromCoords, saveToStorage } from '../data.js';
import {
    closeBottomSheet,
    highlightButton,
    openPhotoSelectMenu,
    renderSurveyList,
    resetButtonStyles,
    switchSidebarTab,
    unlockSleepMode,
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
import { requestWakeLock, releaseWakeLock } from '../wake-lock.js';
import { showAppConfirm, showTextPrompt } from '../app-dialog.js';

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
    const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
    if (typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading)) { AppState.lastHeading = pos.coords.heading; }

    if (!AppState.trackingCircle)
        AppState.trackingCircle = L.circle(latlng, {
            radius: pos.coords.accuracy,
            weight: 1,
            color: 'blue',
            opacity: 0.3,
            fillOpacity: 0.1,
            interactive: false
        }).addTo(map);
    else
        AppState.trackingCircle.setLatLng(latlng).setRadius(pos.coords.accuracy);

    const arrowSvg = `<div style="transform: rotate(${AppState.lastHeading}deg); transform-origin: center center; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
                        <svg viewBox="0 0 100 100" width="20" height="20" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));">
                            <path d="M50 0 L100 100 L50 80 L0 100 Z" fill="#007bff" stroke="white" stroke-width="10" />
                        </svg>
                    </div>`;
    const arrowIcon = L.divIcon({ className: '', html: arrowSvg, iconSize: [20, 20], iconAnchor: [10, 10] });

    if (!AppState.trackingMarker)
        AppState.trackingMarker = L.marker(latlng, { icon: arrowIcon, zIndexOffset: 1000 }).addTo(map);
    else
        AppState.trackingMarker.setLatLng(latlng).setIcon(arrowIcon);

    getAddressFromCoords(pos.coords.latitude, pos.coords.longitude);
    AppState.lastGpsLat = pos.coords.latitude;
    AppState.lastGpsLng = pos.coords.longitude;
    updateCoordDisplay();
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
    if (!navigator.geolocation) { alert('그리기 GPS가 지원되지 않는 기기입니다.'); return; }

    const confirmMsg = "트랙 기록을 시작합니다.\n\n1. 화면을 끄거나 다른 앱을 실행하면 GPS가 중단되어 트랙 기록이 끊어집니다. 이를 방지하기 위해 기록 중에는 화면이 자동으로 꺼지지 않습니다.\n\n2. 배터리 소모를 최소화하려면 하단의 [절전] 버튼을 눌러주세요. 화면이 까맣게 변하며, '오른쪽으로 밀어서 해제'로 돌아올 수 있습니다.\n\n3. 기록 중 [사진 추가] 버튼을 누르면 해당 위치에 독립적인 '점'이 생성되어 촬영한 사진이나 갤러리의 사진을 기록으로 추가할 수 있습니다.\n\n계속하시겠습니까?";

    if (!await showAppConfirm(confirmMsg, { title: '트랙 기록 시작' })) return;

    AppState.currentDrawer = 'track';
    closeBottomSheet();
    highlightButton('btn-track');
    setRecordingModeActive(true);
    AppState.lastTrackLatLng = null;

    const randomColor = getRandomColor();
    AppState.trackPolyline = L.polyline([], { color: randomColor, weight: 3, opacity: 0.85 }).addTo(map);
    document.getElementById('track-action-toolbar').style.display = 'flex';
    requestWakeLock();

    AppState.trackWatchId = navigator.geolocation.watchPosition(
        function (pos) {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const newLatLng = L.latLng(lat, lng);

            if (!AppState.lastTrackLatLng) {
                AppState.trackPolyline.addLatLng(newLatLng);
                AppState.lastTrackLatLng = newLatLng;
                map.panTo(newLatLng);
                return;
            }

            const distM = calculateProjectedDistanceMeters(AppState.lastTrackLatLng.lat, AppState.lastTrackLatLng.lng, lat, lng);

            if (distM >= AppState.trackInterval) {
                AppState.trackPolyline.addLatLng(newLatLng);
                AppState.lastTrackLatLng = newLatLng;
                map.panTo(newLatLng);
            }
        },
        null, { enableHighAccuracy: true, maximumAge: 0 }
    );
}

/**
 * 동작 중인 GPS watchPosition 구독을 중지합니다.
 */
function stopTrackWatch() {
    if (AppState.trackWatchId !== null) {
        navigator.geolocation.clearWatch(AppState.trackWatchId);
        AppState.trackWatchId = null;
    }
}

/**
 * 트랙 기록을 취소하고 임시 폴리라인을 제거합니다.
 */
export function cancelTrackRecording() {
    stopTrackWatch();
    if (AppState.trackPolyline) { map.removeLayer(AppState.trackPolyline); AppState.trackPolyline = null; }
    resetTrackUI();
}

/**
 * 트랙 기록 UI/상태를 기본값으로 되돌립니다.
 * 동작 원리: 드로어 상태, 툴바, wake lock, 절전모드까지 한 번에 정리합니다.
 */
function resetTrackUI() {
    AppState.currentDrawer = null;
    AppState.lastTrackLatLng = null;
    setRecordingModeActive(false);
    document.getElementById('track-action-toolbar').style.display = 'none';
    resetButtonStyles();
    releaseWakeLock();
    unlockSleepMode();
}

/**
 * 트랙 기록을 확정해 일반 레이어(Polyline)로 저장합니다.
 * 동작 원리: 임시 trackPolyline을 feature가 있는 영구 레이어로 변환한 뒤 저장합니다.
 */
export async function completeTrackRecording() {
    stopTrackWatch();
    const latlngs = AppState.trackPolyline ? AppState.trackPolyline.getLatLngs() : [];
    if (latlngs.length < 2) {
        alert('기록된 좌표가 너무 적습니다.');
        cancelTrackRecording();
        return;
    }
    const trackColor = AppState.trackPolyline ? AppState.trackPolyline.options.color : getRandomColor();
    if (AppState.trackPolyline) { map.removeLayer(AppState.trackPolyline); AppState.trackPolyline = null; }

    const memo = await showTextPrompt('기록명 입력:', '트랙_' + getTimestampString());
    if (memo === null) { resetTrackUI(); return; }

    const layer = L.polyline(latlngs, { color: trackColor, weight: 3, opacity: 0.85 });
    layer.feature = {
        type: 'Feature',
        properties: setRecordName({ id: Date.now(), isHidden: false, customColor: trackColor, customWeight: 3, isTrack: true }, memo || getTimestampString())
    };

    updateLayerInfo(layer);
    drawnItems.addLayer(layer);
    saveToStorage();
    renderSurveyList();
    switchSidebarTab('record');
    resetTrackUI();
}

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
            }, recordName)
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
