/* ==========================================================================
   [모듈] Android 뒤로가기 처리 (app/android-back.js)
   [역할]
   - Android 앱에서 뒤로가기 버튼을 눌렀을 때 모달/바텀시트/사이드바를 먼저 닫습니다.
   - 닫을 화면이 없으면 한 번 더 눌러 앱을 종료하는 흐름과 토스트를 관리합니다.
   [참고]
   - 모바일 앱 종료 동작이나 뒤로가기 우선순위를 바꿀 때 확인합니다.
   ========================================================================== */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

const ANDROID_BACK_EXIT_INTERVAL_MS = 2000;
let lastAndroidBackPressAt = 0;
let androidBackToastTimer = null;

function isElementVisible(el) {
    if (!el) return false;
    return el.classList.contains('visible') ||
        el.classList.contains('open') ||
        (el.style.display && el.style.display !== 'none');
}

function showAndroidBackExitToast() {
    let toast = document.getElementById('android-back-exit-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'android-back-exit-toast';
        toast.setAttribute('role', 'status');
        toast.style.cssText = [
            'position: fixed',
            'left: 50%',
            'bottom: calc(28px + env(safe-area-inset-bottom, 0px))',
            'transform: translateX(-50%)',
            'z-index: 100000',
            'max-width: calc(100vw - 40px)',
            'padding: 11px 16px',
            'border-radius: 999px',
            'background: rgba(17, 24, 39, 0.92)',
            'color: #fff',
            'font-size: 14px',
            'line-height: 1.35',
            'white-space: nowrap',
            'box-shadow: 0 10px 30px rgba(0, 0, 0, 0.24)',
            'opacity: 0',
            'pointer-events: none',
            'transition: opacity 160ms ease'
        ].join(';');
        document.body.appendChild(toast);
    }

    toast.textContent = '버튼을 한 번 더 누르면 종료합니다';
    requestAnimationFrame(() => { toast.style.opacity = '1'; });

    clearTimeout(androidBackToastTimer);
    androidBackToastTimer = setTimeout(() => {
        toast.style.opacity = '0';
    }, ANDROID_BACK_EXIT_INTERVAL_MS);
}

function closeVisibleOverlayForBackButton(closeHandlers) {
    const closeTargets = [
        ['delete-account-modal-overlay', closeHandlers.closeDeleteAccountModal],
        ['verification-code-create-modal-overlay', closeHandlers.closeVerificationCodeCreateModal],
        ['api-key-settings-modal-overlay', closeHandlers.closeApiKeySettingsModal],
        ['notice-badge-settings-modal-overlay', closeHandlers.closeNoticeBadgeSettingsModal],
        ['auth-info-modal-overlay', closeHandlers.closeAuthInfoModal],
        ['admin-users-modal-overlay', closeHandlers.closeAdminUsersModal],
        ['admin-menu-modal-overlay', closeHandlers.closeAdminMenuModal],
        ['account-actions-modal-overlay', closeHandlers.closeAccountActionsModal],
        ['auth-modal-overlay', closeHandlers.closeAuthModal],
        ['settings-choice-modal-overlay', () => window.closeSettingsChoiceModal?.()],
        ['import-warning-modal-overlay', () => window.closeImportWarningModal?.()],
        ['export-format-modal-overlay', closeHandlers.closeExportFormatModal],
        ['record-group-select-modal-overlay', closeHandlers.closeAddRecordToGroupModal],
        ['project-move-modal-overlay', closeHandlers.closeMoveProjectModal],
        ['project-sort-modal-overlay', closeHandlers.closeProjectSortModal],
        ['sort-modal-overlay', closeHandlers.closeSortModal],
        ['style-modal-overlay', closeHandlers.closeStyleModal],
        ['location-action-modal-overlay', closeHandlers.closeLocationActionModal],
        ['settings-modal-overlay', closeHandlers.closeSettingsModal],
        ['search-modal-overlay', closeHandlers.closeSearchModal],
        ['nav-modal-overlay', closeHandlers.closeNavModal],
        ['photo-modal', closeHandlers.closePhotoModal],
        ['photo-modal-overlay', closeHandlers.closePhotoSelectMenu],
        ['memo-modal-overlay', closeHandlers.closeMemoModal],
    ];

    for (const [id, closeFn] of closeTargets) {
        const el = document.getElementById(id);
        if (isElementVisible(el)) {
            closeFn?.();
            return true;
        }
    }

    const bottomSheet = document.getElementById('bottom-sheet');
    if (bottomSheet?.classList.contains('open')) {
        closeHandlers.closeBottomSheet?.();
        return true;
    }

    return false;
}

export function initAndroidBackButtonExit(closeHandlers) {
    if (!Capacitor.isNativePlatform()) return;

    App.addListener('backButton', () => {
        if (closeVisibleOverlayForBackButton(closeHandlers)) {
            lastAndroidBackPressAt = 0;
            return;
        }

        const now = Date.now();
        if (now - lastAndroidBackPressAt <= ANDROID_BACK_EXIT_INTERVAL_MS) {
            App.exitApp();
            return;
        }

        lastAndroidBackPressAt = now;
        showAndroidBackExitToast();
    });
}
