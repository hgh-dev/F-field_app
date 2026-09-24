/* 위치 액션, 설정, 외부 내비게이션 모달 */
import { AppState } from './state.js';
import { currentEditLayerId } from './draw.js';
import { closeSidebar } from './ui-sidebar.js';

export let navTarget = { name: '', lat: 0, lng: 0 };

export function openLocationActionModal() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    const overlay = document.getElementById('location-action-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('visible'), 10);
}

export function closeLocationActionModal() {
    const overlay = document.getElementById('location-action-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

export function openSettingsModal() {
    closeSidebar();
    window.checkAppVersion?.();
    document.getElementsByName('coord-mode-select').forEach(input => {
        if (parseInt(input.value) === AppState.coordMode) input.checked = true;
    });
    document.getElementsByName('track-interval-select').forEach(input => {
        if (parseInt(input.value) === AppState.trackInterval) input.checked = true;
    });
    document.getElementsByName('snap-enabled-select').forEach(input => {
        if ((input.value === 'true') === AppState.isSnapEnabled) input.checked = true;
    });
    document.getElementsByName('map-settings-save-select').forEach(input => {
        if ((input.value === 'true') === AppState.isMapSettingsSaveEnabled) input.checked = true;
    });
    const overlay = document.getElementById('settings-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('visible'), 10);
}

export function closeSettingsModal() {
    const overlay = document.getElementById('settings-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

export function openNavModal(name, lat, lng) {
    navTarget = { name: name || '목적지', lat, lng };
    const overlay = document.getElementById('nav-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('visible'), 10);
}

export function closeNavModal() {
    const overlay = document.getElementById('nav-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

export function executeNavigation(type) {
    const { name, lat, lng } = navTarget;
    let url = '';
    if (type === 'tmap') url = `tmap://route?goalname=${encodeURIComponent(name)}&goalx=${lng}&goaly=${lat}`;
    else if (type === 'naver') url = `nmap://navigation?dlat=${lat}&dlng=${lng}&dname=${encodeURIComponent(name)}&appname=F-Field`;
    else if (type === 'kakao') url = `kakaomap://route?ep=${lat},${lng}&by=CAR`;
    window.location.href = url;
    setTimeout(closeNavModal, 500);
}
