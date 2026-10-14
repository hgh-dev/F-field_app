/* ==========================================================================
   [모듈] 앱 버전 확인 및 업데이트 안내 (app/version-update.js)
   [역할]
   - Android는 Google Play, 웹은 version.json을 확인해 업데이트 필요 여부를 표시합니다.
   - 업데이트 버튼, 설정 배지, 강제 새로고침 흐름을 관리합니다.
   [참고]
   - 앱 버전 표시나 업데이트 안내 문구/동작을 바꿀 때 확인합니다.
   ========================================================================== */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { APP_VERSION } from '../config.js';
import { showAppConfirm } from '../app-dialog.js';
import { checkVersionAvailability } from './version-check.js';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.ffield.mobile';
const NativeAppUpdate = registerPlugin('NativeAppUpdate');

function getPlatformInfo() {
    const platform = Capacitor.getPlatform?.();
    const isNative = Capacitor.isNativePlatform?.() || false;
    return {
        platform,
        isAndroid: isNative && platform === 'android'
    };
}

function openAndroidUpdatePage() {
    window.location.href = PLAY_STORE_URL;
}

/**
 * 플랫폼별 배포처에서 확인된 업데이트만 배지와 버튼에 반영합니다.
 */
export async function checkAppVersion() {
    const { isAndroid } = getPlatformInfo();

    // 현재 실행 중 버전을 UI에 표시합니다.
    const versionEl = document.getElementById('app-version-display');
    if (versionEl) versionEl.textContent = APP_VERSION;
    const latestVersionEl = document.getElementById('latest-version-display');
    if (latestVersionEl) latestVersionEl.textContent = isAndroid ? '확인 중' : APP_VERSION;
    const updateBtn = document.getElementById('btn-app-update');
    if (updateBtn) {
        updateBtn.classList.remove('has-update');
        updateBtn.disabled = isAndroid;
    }
    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) settingsBtn.classList.remove('has-update');
    const updateBanner = document.getElementById('settings-update-banner');
    if (updateBanner) updateBanner.classList.remove('visible');

    const isLocalDevHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    if (!isAndroid && isLocalDevHost) return;

    try {
        const { hasUpdate, latestVersion } = await checkVersionAvailability({
            isAndroid,
            currentVersion: APP_VERSION,
            checkPlayUpdate: () => NativeAppUpdate.checkForUpdate(),
            fetchWebVersion: async () => {
                const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
                if (!res.ok) throw new Error(`Version check HTTP ${res.status}`);
                return res.json();
            }
        });
        if (latestVersionEl) latestVersionEl.textContent = latestVersion;
        if (updateBtn && isAndroid) updateBtn.disabled = !hasUpdate;

        if (hasUpdate) {
            if (updateBtn) updateBtn.classList.add('has-update');
            if (settingsBtn) settingsBtn.classList.add('has-update');
            if (updateBanner) updateBanner.classList.add('visible');
        }
        return hasUpdate;
    } catch (e) {
        if (latestVersionEl && isAndroid) latestVersionEl.textContent = '확인 불가';
        // 버전 체크 실패는 앱 핵심 기능과 무관하므로 로그만 남기고 계속 진행합니다.
        console.warn('버전 체크 실패:', e);
        return false;
    }
}

/**
 * 캐시/서비스워커를 정리한 뒤 앱을 강제 새로고침합니다.
 */
export async function forceAppUpdate() {
    const { isAndroid } = getPlatformInfo();
    if (isAndroid) {
        if (!await checkAppVersion()) return;
        if (!await showAppConfirm('Play 스토어에서 최신 버전으로 업데이트합니다.', { title: '업데이트' })) return;
        openAndroidUpdatePage();
        return;
    }

    if (!await showAppConfirm('최신 버전으로 업데이트합니다.', { title: '업데이트' })) return;
    try {
        // Cache Storage 전체 삭제
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));

        // 서비스워커 등록 해제
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(reg => reg.unregister()));
        }
    } catch (e) {
        console.warn('캐시 삭제 실패:', e);
    }
    const separator = window.location.search ? '&' : '?';
    window.location.replace(`${window.location.pathname}${window.location.search}${separator}update=${Date.now()}`);
}
