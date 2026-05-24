/* ==========================================================================
   [모듈] 앱 버전 확인 및 업데이트 안내 (app/version-update.js)
   [역할]
   - 현재 앱 버전과 서버의 최신 version.json을 비교해 업데이트 필요 여부를 표시합니다.
   - 업데이트 버튼, 설정 배지, 강제 새로고침 흐름을 관리합니다.
   [참고]
   - 앱 버전 표시나 업데이트 안내 문구/동작을 바꿀 때 확인합니다.
   ========================================================================== */
import { APP_VERSION } from '../config.js';
import { showAppConfirm } from '../app-dialog.js';

/**
 * 현재 앱 버전과 서버 최신 버전을 비교해 업데이트 배지를 표시합니다.
 * 동작 원리: 빌드 번들과 분리된 version.json을 네트워크 우선으로 읽어 비교합니다.
 */
export async function checkAppVersion() {
    // 현재 실행 중 버전을 UI에 표시합니다.
    const versionEl = document.getElementById('app-version-display');
    if (versionEl) versionEl.textContent = APP_VERSION;
    const latestVersionEl = document.getElementById('latest-version-display');
    if (latestVersionEl) latestVersionEl.textContent = APP_VERSION;
    const updateBtn = document.getElementById('btn-app-update');
    if (updateBtn) updateBtn.classList.remove('has-update');
    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) settingsBtn.classList.remove('has-update');
    const updateBanner = document.getElementById('settings-update-banner');
    if (updateBanner) updateBanner.classList.remove('visible');

    const isLocalDevHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    if (isLocalDevHost) return;

    try {
        const res = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const versionInfo = await res.json();
        const serverVersion = versionInfo?.version;

        if (!serverVersion || typeof serverVersion !== 'string') return;
        if (latestVersionEl) latestVersionEl.textContent = serverVersion;
        if (serverVersion !== APP_VERSION) {
            if (updateBtn) updateBtn.classList.add('has-update');
            if (settingsBtn) settingsBtn.classList.add('has-update');
            if (updateBanner) updateBanner.classList.add('visible');
        }
    } catch (e) {
        // 버전 체크 실패는 앱 핵심 기능과 무관하므로 로그만 남기고 계속 진행합니다.
        console.warn('버전 체크 실패:', e);
    }
}

/**
 * 캐시/서비스워커를 정리한 뒤 앱을 강제 새로고침합니다.
 */
export async function forceAppUpdate() {
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
