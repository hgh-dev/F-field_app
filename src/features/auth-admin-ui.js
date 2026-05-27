/* ==========================================================================
   [모듈] 인증/관리자 화면 기능 (features/auth-admin-ui.js)
   [역할]
   - 로그인 모달, 계정 메뉴, 권한 표시, 관리자 메뉴와 관리자 전용 모달을 제어합니다.
   - 인증 상태에 따라 프리미엄/관리자 버튼 노출과 기능 접근 허용 여부를 갱신합니다.
   [참고]
   - 로그인 UI, 관리자 사용자 목록, 인증 코드, 공지 배지 설정 문제가 생기면 확인합니다.
   ========================================================================== */
import { AppState } from '../state.js';
import { showAppAlert, showTextPrompt } from '../app-dialog.js';
import { copyText } from '../utils.js';
import {
    AUTH_FEATURES, canUseFeature, createVerificationCode, deleteAccount, fetchAdminUsers, fetchAppSettings, fetchAuthInfo, getAuthState, isAdminAccount,
    isAuthConfigured, loadCurrentEntitlement, redeemVerificationCode, signInWithGoogle, signOut,
    updateApiKeySettings, updateNoticeBadgeSettings, updateUserEntitlement
} from '../auth.js';

const PREMIUM_ACTION_GRANT_MS = 10 * 60 * 1000;
const API_KEY_EXPIRATION_WARNING_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const featureActionGrants = new Map();
let latestNoticeBadgeSettings = null;
let latestAdminUsers = [];
let adminUsersTierFilter = 'all';

function grantFeatureActionAccess(feature) {
    featureActionGrants.set(feature, Date.now() + PREMIUM_ACTION_GRANT_MS);
}

function hasActiveFeatureActionGrant(feature) {
    return (featureActionGrants.get(feature) || 0) > Date.now();
}

function revokePremiumActionAccess() {
    featureActionGrants.clear();
}

export function ensureFeatureAccess(feature, message = '권한이 필요한 기능입니다.') {
    const authState = getAuthState();
    if (hasActiveFeatureActionGrant(feature)) return true;
    if (canUseFeature(feature, authState)) {
        grantFeatureActionAccess(feature);
        return true;
    }
    alert(message);
    return false;
}

function setPremiumControlsVisible(isVisible) {
    ['premium-record-tools', 'btn-track-photo-point'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isVisible ? '' : 'none';
    });
}

function getUserInitial(user) {
    const source = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || '';
    const trimmed = String(source).trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

const failedAvatarUrls = new Set();

function getUserAvatarUrl(user) {
    return user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '';
}

function setAccountAvatar(el, user, isLoggedIn) {
    const initial = isLoggedIn ? getUserInitial(user) : '?';
    const avatarUrl = isLoggedIn ? getUserAvatarUrl(user) : '';

    el.classList.toggle('signed-in', isLoggedIn);
    el.classList.toggle('signed-out', !isLoggedIn);
    el.classList.remove('has-image');
    el.innerHTML = isLoggedIn
        ? initial
        : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.31 0-10 1.67-10 5v2h20v-2c0-3.33-6.69-5-10-5z"/></svg>`;

    if (!avatarUrl || failedAvatarUrls.has(avatarUrl)) return;

    const img = new Image();
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
        el.textContent = '';
        el.classList.add('has-image');
        el.appendChild(img);
    };
    img.onerror = () => {
        failedAvatarUrls.add(avatarUrl);
        el.classList.remove('has-image');
        el.textContent = initial;
    };
    img.src = avatarUrl;
}

export function updateAuthUI(state = getAuthState()) {
    setPremiumControlsVisible(canUseFeature(AUTH_FEATURES.PHOTO_RECORDING, state) || canUseFeature(AUTH_FEATURES.TRACK_RECORDING, state));

    const authButton = document.getElementById('auth-status-btn');
    const authTitle = document.getElementById('auth-modal-title');
    const authAvatar = document.getElementById('auth-avatar');
    const authText = document.getElementById('auth-status-text');
    const authEmail = document.getElementById('auth-account-email');
    const authBadge = document.getElementById('auth-tier-badge');
    const signedOutSection = document.getElementById('auth-signed-out-section');
    const accountSection = document.getElementById('auth-account-section');
    const permissionCopy = document.getElementById('auth-permission-copy');
    const logoutButton = document.getElementById('auth-logout-btn');
    const deleteAccountButton = document.getElementById('auth-delete-account-btn');
    const settingsTrackIntervalSection = document.getElementById('settings-track-interval-section');
    const offlineMapSection = document.getElementById('offline-map-section');
    const settingsAccountAvatar = document.getElementById('settings-account-avatar');
    const settingsAccountEmail = document.getElementById('settings-account-email');
    const settingsAccountStatus = document.getElementById('settings-account-status');
    const settingsAccountTierBadge = document.getElementById('settings-account-tier-badge');
    const settingsAuthInfoRow = document.getElementById('settings-auth-info-row');
    const settingsAdminMenuRow = document.getElementById('settings-admin-menu-row');
    const settingsVerificationCodeRow = document.getElementById('settings-verification-code-row');
    const settingsVerificationCodeCreateRow = document.getElementById('settings-verification-code-create-row');
    const settingsNoticeBadgeRow = document.getElementById('settings-notice-badge-row');
    const settingsApiKeyRow = document.getElementById('settings-api-key-row');
    const settingsAdminUsersRow = document.getElementById('settings-admin-users-row');
    const googleButton = document.getElementById('auth-google-btn');
    const tier = state.tier || 'free';
    const tierLabel = tier === 'verified' ? 'Verified' : tier.toUpperCase();
    const isLoggedIn = Boolean(state.user);
    const isAdmin = isAdminAccount(state);
    const hasPremium = canUseFeature(AUTH_FEATURES.PREMIUM_ACCESS, state);
    const isPremiumTier = tier === 'premium';
    const accountStatusText = isLoggedIn
        ? (isAdmin ? '관리자 계정' : (isPremiumTier ? '프리미엄 계정' : (hasPremium ? '인증된 계정' : '일반 계정')))
        : '비회원';

    if (authButton) {
        const label = state.user ? '계정' : '로그인';
        authButton.setAttribute('aria-label', label);
        authButton.setAttribute('title', label);
        authButton.classList.toggle('premium', hasPremium);
        authButton.classList.toggle('signed-in', isLoggedIn);
    }
    if (authAvatar) authAvatar.classList.toggle('signed-in', isLoggedIn);
    if (authTitle) authTitle.textContent = isLoggedIn ? '내 계정' : '계정 로그인';
    if (authText) {
        authText.textContent = accountStatusText;
    }
    if (authEmail) {
        authEmail.textContent = isLoggedIn
            ? (state.user.email || '이메일 정보 없음')
            : '로그인이 필요합니다.';
    }
    if (authBadge) {
        authBadge.textContent = tierLabel;
        authBadge.classList.toggle('premium', hasPremium);
        authBadge.classList.toggle('admin', isAdmin);
    }
    if (signedOutSection) signedOutSection.classList.toggle('hidden', isLoggedIn);
    if (accountSection) accountSection.classList.toggle('hidden', !isLoggedIn);
    if (permissionCopy) {
        permissionCopy.textContent = hasPremium
            ? '모든 기능을 사용할 수 있습니다.'
            : '권한 인증 코드가 있다면 입력하세요.';
    }
    if (logoutButton) logoutButton.style.display = isLoggedIn ? 'block' : 'none';
    if (deleteAccountButton) deleteAccountButton.style.display = isLoggedIn ? 'block' : 'none';
    if (settingsTrackIntervalSection) settingsTrackIntervalSection.style.display = canUseFeature(AUTH_FEATURES.TRACK_RECORDING, state) ? '' : 'none';
    if (offlineMapSection) offlineMapSection.style.display = canUseFeature(AUTH_FEATURES.OFFLINE_MAP, state) ? '' : 'none';
    if (settingsAccountAvatar) {
        setAccountAvatar(settingsAccountAvatar, state.user, isLoggedIn);
    }
    if (settingsAccountEmail) {
        settingsAccountEmail.textContent = isLoggedIn
            ? (state.user.email || '이메일 정보 없음')
            : '로그인이 필요합니다.';
    }
    if (settingsAccountStatus) {
        settingsAccountStatus.textContent = accountStatusText;
    }
    if (settingsAccountTierBadge) {
        const settingsTierLabel = tier === 'verified' ? 'VERIFIED' : tier.toUpperCase();
        settingsAccountTierBadge.textContent = settingsTierLabel;
        settingsAccountTierBadge.classList.toggle('premium', isPremiumTier);
        settingsAccountTierBadge.classList.toggle('verified', tier === 'verified');
        settingsAccountTierBadge.classList.toggle('admin', isAdmin);
    }
    if (settingsAuthInfoRow) {
        settingsAuthInfoRow.classList.toggle('visible', canUseFeature(AUTH_FEATURES.AUTH_INFO, state) && !isAdmin && !isPremiumTier);
    }
    if (settingsAdminMenuRow) {
        settingsAdminMenuRow.classList.toggle('visible', canUseFeature(AUTH_FEATURES.ADMIN_MENU, state));
    }
    if (settingsVerificationCodeRow) {
        settingsVerificationCodeRow.classList.toggle('visible', isLoggedIn && !hasPremium);
    }
    if (settingsVerificationCodeCreateRow) {
        settingsVerificationCodeCreateRow.classList.toggle('visible', canUseFeature(AUTH_FEATURES.VERIFICATION_CODE_CREATE, state));
    }
    if (settingsNoticeBadgeRow) {
        settingsNoticeBadgeRow.classList.toggle('visible', canUseFeature(AUTH_FEATURES.NOTICE_BADGE_MANAGE, state));
    }
    if (settingsApiKeyRow) {
        settingsApiKeyRow.classList.toggle('visible', canUseFeature(AUTH_FEATURES.API_KEY_MANAGE, state));
    }
    if (settingsAdminUsersRow) {
        settingsAdminUsersRow.classList.toggle('visible', canUseFeature(AUTH_FEATURES.ADMIN_USERS, state));
    }
    if (googleButton) {
        googleButton.style.display = isLoggedIn ? 'none' : 'flex';
        googleButton.disabled = !isAuthConfigured();
    }
    updateApiKeyExpirationWarning(state);
    if (state.error) setAuthMessage(state.error, 'error');
}

function setAuthMessage(message, type = 'info') {
    const messageEl = document.getElementById('auth-message');
    if (!messageEl) return;
    messageEl.textContent = message || '';
    messageEl.classList.toggle('hidden', !message);
    messageEl.dataset.type = type;
}

function openAuthModal() {
    const overlay = document.getElementById('auth-modal-overlay');
    if (!overlay) return;
    setAuthMessage('');
    updateAuthUI();
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('visible'), 10);
}

export function closeAuthModal() {
    const overlay = document.getElementById('auth-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
}

function openAccountActionsModal() {
    if (!getAuthState().user) {
        signInWithGoogle().catch((error) => {
            setAuthMessage(error.message || 'Google 로그인에 실패했습니다.', 'error');
            openAuthModal();
        });
        return;
    }

    const overlay = document.getElementById('account-actions-modal-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('visible'), 10);
}

export function closeAccountActionsModal() {
    const overlay = document.getElementById('account-actions-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
}

function openDeleteAccountModal() {
    const overlay = document.getElementById('delete-account-modal-overlay');
    const input = document.getElementById('delete-account-confirm-input');
    const button = document.getElementById('delete-account-confirm-btn');
    if (!overlay) return;
    if (input) input.value = '';
    if (button) button.disabled = true;
    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.classList.add('visible');
        input?.focus();
    }, 10);
}

export function closeDeleteAccountModal() {
    const overlay = document.getElementById('delete-account-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
}

function openVerificationCodeCreateModal() {
    if (!canUseFeature(AUTH_FEATURES.VERIFICATION_CODE_CREATE, getAuthState())) {
        alert('관리자 권한이 필요합니다.');
        return;
    }

    const overlay = document.getElementById('verification-code-create-modal-overlay');
    if (!overlay) return;

    const maxUsesInput = document.getElementById('verification-code-max-uses');
    const assignedToInput = document.getElementById('verification-code-assigned-to');
    const expiresAtInput = document.getElementById('verification-code-expires-at');
    const memoInput = document.getElementById('verification-code-memo');
    const resultBox = document.getElementById('verification-code-result');
    const resultValue = document.getElementById('verification-code-result-value');
    const resultMeta = document.getElementById('verification-code-result-meta');
    const submitBtn = document.getElementById('verification-code-create-submit-btn');

    if (maxUsesInput) maxUsesInput.value = '1';
    if (assignedToInput) assignedToInput.value = '';
    if (expiresAtInput) expiresAtInput.value = '';
    if (memoInput) memoInput.value = '';
    if (resultBox) resultBox.classList.remove('visible');
    if (resultValue) resultValue.textContent = '';
    if (resultMeta) resultMeta.textContent = '';
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '생성';
    }

    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.classList.add('visible');
        maxUsesInput?.focus();
        maxUsesInput?.select();
    }, 10);
}

export function closeVerificationCodeCreateModal() {
    const overlay = document.getElementById('verification-code-create-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
}

function setNoticeBadgeVisible(isVisible) {
    const button = document.getElementById('btn-notice');
    if (!button) return;
    button.classList.toggle('has-notice-badge', Boolean(isVisible));
}

function getApiKeyExpirationWarning(settings = latestNoticeBadgeSettings) {
    const expiresAt = settings?.apiKeys?.vworld?.expiresAt;
    if (!expiresAt) return null;

    const expiresTime = new Date(expiresAt).getTime();
    if (Number.isNaN(expiresTime)) return null;

    const daysRemaining = Math.max(0, Math.ceil((expiresTime - Date.now()) / DAY_MS));
    if (daysRemaining > API_KEY_EXPIRATION_WARNING_DAYS) return null;

    const paddedDays = String(daysRemaining).padStart(2, '0');
    return `API키 만료 ${paddedDays}일 전입니다. 만료 2일 전까지 api키를 연장하거나 새로운 키로 교체하세요.`;
}

function updateApiKeyExpirationWarning(state = getAuthState()) {
    const isAdmin = isAdminAccount(state);
    const message = isAdmin ? getApiKeyExpirationWarning() : null;
    const settingsButton = document.getElementById('btn-settings');
    const warningEl = document.getElementById('admin-api-key-warning');

    settingsButton?.classList.toggle('has-api-key-warning', Boolean(message));
    if (!warningEl) return;
    warningEl.textContent = message || '';
    warningEl.classList.toggle('visible', Boolean(message));
}

function formatDateTimeLocal(dateValue) {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getNoticeBadgeModalPayload() {
    const enabled = document.querySelector('input[name="notice-badge-enabled-select"][value="true"]')?.checked || false;
    const untilValue = document.getElementById('notice-badge-until')?.value || '';
    return {
        enabled,
        until: untilValue ? new Date(untilValue).toISOString() : null
    };
}

function syncNoticeBadgeModal(settings = latestNoticeBadgeSettings) {
    const badge = settings?.noticeBadge || settings || {};
    const enabled = badge.enabled === true;
    const until = badge.until || '';
    document.querySelectorAll('input[name="notice-badge-enabled-select"]').forEach(input => {
        input.checked = input.value === String(enabled);
    });
    const untilInput = document.getElementById('notice-badge-until');
    if (untilInput) untilInput.value = formatDateTimeLocal(until);
    const statusEl = document.getElementById('notice-badge-current-status');
    if (statusEl) {
        statusEl.textContent = enabled && until
            ? `현재 설정: ${new Date(until).toLocaleString()}까지 표시`
            : '현재 설정: 꺼짐';
    }
}

export async function refreshNoticeBadgeSettings() {
    const settings = await fetchAppSettings();
    if (!settings?.noticeBadge) {
        setNoticeBadgeVisible(false);
        return null;
    }

    latestNoticeBadgeSettings = settings;
    setNoticeBadgeVisible(settings.noticeBadge.active);
    updateApiKeyExpirationWarning();
    return settings;
}

function syncApiKeyModal(settings = latestNoticeBadgeSettings) {
    const vworld = settings?.apiKeys?.vworld || {};
    const keyInput = document.getElementById('api-key-vworld-key');
    const expiresInput = document.getElementById('api-key-vworld-expires-at');
    const statusEl = document.getElementById('api-key-current-status');

    if (keyInput) keyInput.value = vworld.key || '';
    if (expiresInput) expiresInput.value = formatDateTimeLocal(vworld.expiresAt);
    if (statusEl) {
        if (!vworld.key) {
            statusEl.textContent = '현재 설정: 저장된 키 없음';
        } else if (vworld.expired) {
            statusEl.textContent = '현재 설정: 만료됨';
        } else {
            statusEl.textContent = vworld.expiresAt
                ? `현재 설정: ${new Date(vworld.expiresAt).toLocaleString()}까지 사용`
                : '현재 설정: 만료일 없음';
        }
    }
}

function getApiKeyModalPayload() {
    const key = document.getElementById('api-key-vworld-key')?.value.trim() || '';
    const expiresAtValue = document.getElementById('api-key-vworld-expires-at')?.value || '';
    return {
        provider: 'vworld',
        key,
        expiresAt: expiresAtValue ? new Date(expiresAtValue).toISOString() : null
    };
}

function openNoticeBadgeSettingsModal() {
    if (!canUseFeature(AUTH_FEATURES.NOTICE_BADGE_MANAGE, getAuthState())) {
        alert('관리자 권한이 필요합니다.');
        return;
    }

    const overlay = document.getElementById('notice-badge-settings-modal-overlay');
    if (!overlay) return;
    syncNoticeBadgeModal();
    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.classList.add('visible');
        document.getElementById('notice-badge-until')?.focus();
    }, 10);
}

export function closeNoticeBadgeSettingsModal() {
    const overlay = document.getElementById('notice-badge-settings-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
}

async function openApiKeySettingsModal() {
    if (!canUseFeature(AUTH_FEATURES.API_KEY_MANAGE, getAuthState())) {
        alert('관리자 권한이 필요합니다.');
        return;
    }

    const overlay = document.getElementById('api-key-settings-modal-overlay');
    if (!overlay) return;
    syncApiKeyModal();
    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.classList.add('visible');
        document.getElementById('api-key-vworld-key')?.focus();
    }, 10);

    try {
        const settings = await fetchAppSettings({ force: true });
        if (settings) {
            latestNoticeBadgeSettings = settings;
            syncApiKeyModal(settings);
            updateApiKeyExpirationWarning();
        }
    } catch (_error) {
        // 저장 화면은 캐시된 값만으로도 열 수 있습니다.
    }
}

export function closeApiKeySettingsModal() {
    const overlay = document.getElementById('api-key-settings-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
}

function formatAuthInfoDate(value) {
    if (!value) return '정보 없음';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '정보 오류';
    return date.toLocaleString();
}

function setAuthInfoModalValues(info = null, isLoading = false) {
    const verifiedAtEl = document.getElementById('auth-info-verified-at');
    const expiresAtEl = document.getElementById('auth-info-expires-at');
    const remainingEl = document.getElementById('auth-info-remaining');

    if (isLoading) {
        if (verifiedAtEl) verifiedAtEl.textContent = '불러오는 중...';
        if (expiresAtEl) expiresAtEl.textContent = '불러오는 중...';
        if (remainingEl) remainingEl.textContent = '불러오는 중...';
        return;
    }

    if (verifiedAtEl) verifiedAtEl.textContent = formatAuthInfoDate(info?.verifiedAt);
    if (expiresAtEl) expiresAtEl.textContent = info?.expiresAt ? formatAuthInfoDate(info.expiresAt) : '만료일 없음';
    if (remainingEl) remainingEl.textContent = info?.remainingText || '정보 없음';
}

async function openAuthInfoModal() {
    if (!canUseFeature(AUTH_FEATURES.AUTH_INFO, getAuthState())) {
        alert('인증된 계정에서 확인할 수 있습니다.');
        return;
    }

    const overlay = document.getElementById('auth-info-modal-overlay');
    if (!overlay) return;

    setAuthInfoModalValues(null, true);
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('visible'), 10);

    try {
        const info = await fetchAuthInfo();
        setAuthInfoModalValues(info);
    } catch (error) {
        setAuthInfoModalValues({
            verifiedAt: null,
            expiresAt: null,
            remainingText: error.message || '인증정보를 불러올 수 없습니다.'
        });
    }
}

export function closeAuthInfoModal() {
    const overlay = document.getElementById('auth-info-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
}

async function openAdminMenuModal() {
    if (!canUseFeature(AUTH_FEATURES.ADMIN_MENU, getAuthState())) {
        alert('관리자 권한이 필요합니다.');
        return;
    }

    const password = await showTextPrompt('관리자 암호 입력:', '', {
        inputType: 'password',
        inputMode: 'numeric',
        pattern: '[0-9]*',
        maxLength: 4,
        autocomplete: 'one-time-code',
        okText: '확인'
    });
    if (password === null) return;
    if (String(password).trim() !== '9646') {
        alert('관리자 암호가 올바르지 않습니다.');
        return;
    }

    const overlay = document.getElementById('admin-menu-modal-overlay');
    if (!overlay) return;
    updateApiKeyExpirationWarning();
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('visible'), 10);
}

export function closeAdminMenuModal() {
    const overlay = document.getElementById('admin-menu-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
}

function formatAdminDateLocal(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderAdminUsers() {
    const listEl = document.getElementById('admin-users-list');
    if (!listEl) return;
    const query = document.getElementById('admin-users-search')?.value.trim().toLowerCase() || '';
    updateAdminUsersTierCount();
    const users = latestAdminUsers.filter(user => {
        const tier = String(user.tier || 'free').toLowerCase();
        const matchesTier = adminUsersTierFilter === 'all' || tier === adminUsersTierFilter;
        const matchesQuery = !query || String(user.email || '').toLowerCase().includes(query);
        return matchesTier && matchesQuery;
    });

    if (!users.length) {
        listEl.innerHTML = '<div class="verification-code-help">표시할 회원이 없습니다.</div>';
        return;
    }

    listEl.innerHTML = users.map(user => {
        const email = escapeHtml(user.email || '(이메일 없음)');
        const tier = user.tier || 'free';
        const disabled = user.isCurrentUser ? 'disabled' : '';
        const expiresValue = tier === 'admin' ? '' : formatAdminDateLocal(user.expiresAt);
        return `
            <div class="admin-user-item" data-user-id="${escapeHtml(user.id)}">
                <div class="admin-user-top">
                    <div class="admin-user-email" title="${email}">${email}</div>
                    <div class="admin-user-tier">${escapeHtml(tier)}${user.isCurrentUser ? ' · ME' : ''}</div>
                </div>
                <div class="admin-user-controls">
                    <select class="admin-user-select" data-role="tier" ${disabled}>
                        <option value="free" ${tier === 'free' ? 'selected' : ''}>free</option>
                        <option value="verified" ${tier === 'verified' ? 'selected' : ''}>verified</option>
                        <option value="premium" ${tier === 'premium' ? 'selected' : ''}>premium</option>
                        <option value="admin" ${tier === 'admin' ? 'selected' : ''}>admin</option>
                    </select>
                    <input class="admin-user-date" data-role="expires" type="datetime-local" value="${expiresValue}" ${disabled}>
                    <button class="admin-user-save" type="button" data-role="save" ${disabled}>저장</button>
                </div>
            </div>
        `;
    }).join('');

    listEl.querySelectorAll('[data-role="save"]').forEach(button => {
        button.addEventListener('click', () => handleSaveAdminUser(button.closest('.admin-user-item')));
    });
}

function getAdminUsersTierCounts() {
    return latestAdminUsers.reduce((counts, user) => {
        const tier = String(user.tier || 'free').toLowerCase();
        counts.all += 1;
        if (Object.prototype.hasOwnProperty.call(counts, tier)) counts[tier] += 1;
        return counts;
    }, {
        all: 0,
        admin: 0,
        verified: 0,
        premium: 0,
        free: 0
    });
}

function updateAdminUsersTierCount() {
    const countEl = document.getElementById('admin-users-tier-count');
    if (!countEl) return;

    const counts = getAdminUsersTierCounts();
    countEl.textContent = `회원 수 : ${counts[adminUsersTierFilter] || 0}명`;
}

function setAdminUsersTierFilter(filter = 'all') {
    const nextFilter = ['all', 'admin', 'verified', 'premium', 'free'].includes(filter) ? filter : 'all';
    adminUsersTierFilter = nextFilter;
    document.querySelectorAll('#admin-users-tier-tabs [data-tier-filter]').forEach(button => {
        button.classList.toggle('active', button.dataset.tierFilter === nextFilter);
    });
    renderAdminUsers();
}

async function loadAdminUsers() {
    if (!canUseFeature(AUTH_FEATURES.ADMIN_USERS, getAuthState())) {
        const listEl = document.getElementById('admin-users-list');
        if (listEl) listEl.innerHTML = '<div class="verification-code-help">관리자 권한이 필요합니다.</div>';
        return;
    }
    const listEl = document.getElementById('admin-users-list');
    if (listEl) listEl.innerHTML = '<div class="verification-code-help">불러오는 중...</div>';
    try {
        const result = await fetchAdminUsers();
        latestAdminUsers = result.users || [];
        renderAdminUsers();
    } catch (error) {
        if (listEl) listEl.innerHTML = `<div class="verification-code-help">${escapeHtml(error.message || '회원 정보를 불러올 수 없습니다.')}</div>`;
    }
}

function openAdminUsersModal() {
    if (!canUseFeature(AUTH_FEATURES.ADMIN_USERS, getAuthState())) {
        alert('관리자 권한이 필요합니다.');
        return;
    }
    const overlay = document.getElementById('admin-users-modal-overlay');
    if (!overlay) return;
    const searchInput = document.getElementById('admin-users-search');
    if (searchInput) searchInput.value = '';
    setAdminUsersTierFilter('all');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('visible'), 10);
    loadAdminUsers();
}

export function closeAdminUsersModal() {
    const overlay = document.getElementById('admin-users-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
}

async function handleSaveAdminUser(itemEl) {
    if (!canUseFeature(AUTH_FEATURES.ADMIN_USERS, getAuthState())) {
        alert('관리자 권한이 필요합니다.');
        return;
    }
    if (!itemEl) return;
    const userId = itemEl.dataset.userId;
    const tier = itemEl.querySelector('[data-role="tier"]')?.value || 'free';
    const expiresValue = itemEl.querySelector('[data-role="expires"]')?.value || '';
    const button = itemEl.querySelector('[data-role="save"]');
    if (!userId) return;

    if (button) {
        button.disabled = true;
        button.textContent = '저장 중';
    }

    try {
        await updateUserEntitlement({
            userId,
            tier,
            expiresAt: expiresValue ? new Date(expiresValue).toISOString() : null
        });
        await loadAdminUsers();
        alert('회원 권한을 저장했습니다.');
    } catch (error) {
        alert(error.message || '회원 권한 저장에 실패했습니다.');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = '저장';
        }
    }
}

async function handleSaveNoticeBadgeSettings() {
    if (!canUseFeature(AUTH_FEATURES.NOTICE_BADGE_MANAGE, getAuthState())) {
        alert('관리자 권한이 필요합니다.');
        return;
    }
    const button = document.getElementById('notice-badge-save-btn');
    const payload = getNoticeBadgeModalPayload();
    if (payload.enabled && !payload.until) {
        alert('표시 종료 날짜와 시간을 입력하세요.');
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = '저장 중...';
    }

    try {
        const result = await updateNoticeBadgeSettings(payload);
        const settings = await fetchAppSettings({ force: true }) || result;
        latestNoticeBadgeSettings = settings;
        syncNoticeBadgeModal(settings);
        setNoticeBadgeVisible(settings?.noticeBadge?.active);
        updateApiKeyExpirationWarning();
        alert('공지 뱃지 설정을 저장했습니다.');
    } catch (error) {
        alert(error.message || '공지 뱃지 설정 중 오류가 발생했습니다.');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = '저장';
        }
    }
}

async function handleSaveApiKeySettings() {
    if (!canUseFeature(AUTH_FEATURES.API_KEY_MANAGE, getAuthState())) {
        alert('관리자 권한이 필요합니다.');
        return;
    }

    const button = document.getElementById('api-key-save-btn');
    const payload = getApiKeyModalPayload();
    if (!payload.key) {
        alert('API 키를 입력하세요.');
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = '저장 중...';
    }

    try {
        const result = await updateApiKeySettings(payload);
        const settings = await fetchAppSettings({ force: true }) || result?.settings;
        if (settings) {
            latestNoticeBadgeSettings = settings;
            syncApiKeyModal(settings);
            updateApiKeyExpirationWarning();
        }
        alert('API 키 설정을 저장했습니다.');
    } catch (error) {
        alert(error.message || 'API 키 설정 중 오류가 발생했습니다.');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = '저장';
        }
    }
}

function getVerificationCodeCreatePayload() {
    const maxUses = Number(document.getElementById('verification-code-max-uses')?.value || 1);
    const assignedTo = document.getElementById('verification-code-assigned-to')?.value.trim() || '';
    const expiresAtValue = document.getElementById('verification-code-expires-at')?.value || '';
    const memo = document.getElementById('verification-code-memo')?.value.trim() || '';

    return {
        maxUses: Number.isFinite(maxUses) ? Math.max(1, Math.floor(maxUses)) : 1,
        assignedTo: assignedTo || null,
        expiresAt: expiresAtValue ? new Date(expiresAtValue).toISOString() : null,
        memo: memo || null
    };
}

function formatVerificationCodeResult(result, payload) {
    const assignedTo = payload.assignedTo || '제한 없음';
    const expiresAt = payload.expiresAt
        ? new Date(payload.expiresAt).toLocaleString()
        : '만료 없음';
    return [
        `사용 가능 횟수: ${result.maxUses || payload.maxUses}`,
        `assigned_to: ${assignedTo}`,
        `권한 만료일: ${expiresAt}`,
        payload.memo ? `memo: ${payload.memo}` : ''
    ].filter(Boolean).join('\n');
}

async function handleCreateVerificationCode() {
    if (!canUseFeature(AUTH_FEATURES.VERIFICATION_CODE_CREATE, getAuthState())) {
        alert('관리자 권한이 필요합니다.');
        return;
    }
    const submitBtn = document.getElementById('verification-code-create-submit-btn');
    const resultBox = document.getElementById('verification-code-result');
    const resultValue = document.getElementById('verification-code-result-value');
    const resultMeta = document.getElementById('verification-code-result-meta');
    const payload = getVerificationCodeCreatePayload();

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '생성 중...';
    }

    try {
        const result = await createVerificationCode(payload);
        if (resultValue) resultValue.textContent = result.code || '';
        if (resultMeta) resultMeta.textContent = formatVerificationCodeResult(result, payload);
        if (resultBox) resultBox.classList.add('visible');
        if (result.code) {
            await copyText(result.code);
            await showAppAlert('인증코드가 생성되어 클립보드에 복사되었습니다.', { title: '생성 완료' });
        }
    } catch (error) {
        alert(error.message || '인증코드 생성 중 오류가 발생했습니다.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '생성';
        }
    }
}

async function handleVerificationCodeInput() {
    if (!getAuthState().user) {
        alert('로그인이 필요합니다.');
        return;
    }

    const code = await showTextPrompt('코드 입력:', '');
    if (code === null) return;

    try {
        await redeemVerificationCode(code.trim());
        const nextState = await loadCurrentEntitlement();
        updateAuthUI(nextState);
        alert('권한 인증이 완료되었습니다.');
    } catch (error) {
        alert(error.message || '코드 확인 중 오류가 발생했습니다.');
    }
}

async function handleLogout() {
    try {
        await signOut();
        revokePremiumActionAccess();
        const nextState = await loadCurrentEntitlement();
        updateAuthUI(nextState);
        closeAccountActionsModal();
        setAuthMessage('로그아웃되었습니다.');
    } catch (error) {
        setAuthMessage(error.message || '로그아웃에 실패했습니다.', 'error');
    }
}

export function initAuthUiEventListeners() {
    document.getElementById('auth-status-btn')?.addEventListener('click', openAuthModal);
    document.getElementById('settings-account-row')?.addEventListener('click', openAccountActionsModal);
    document.getElementById('settings-auth-info-row')?.addEventListener('click', openAuthInfoModal);
    document.getElementById('settings-coordinate-info-row')?.addEventListener('click', () => {
        window.openSettingsDocument('./coordinate-system.html');
    });
    document.getElementById('settings-admin-menu-row')?.addEventListener('click', openAdminMenuModal);
    document.getElementById('settings-verification-code-row')?.addEventListener('click', handleVerificationCodeInput);
    document.getElementById('settings-verification-code-create-row')?.addEventListener('click', openVerificationCodeCreateModal);
    document.getElementById('settings-notice-badge-row')?.addEventListener('click', openNoticeBadgeSettingsModal);
    document.getElementById('settings-api-key-row')?.addEventListener('click', openApiKeySettingsModal);
    document.getElementById('settings-admin-users-row')?.addEventListener('click', openAdminUsersModal);
    document.getElementById('auth-modal-close')?.addEventListener('click', closeAuthModal);
    document.getElementById('auth-modal-overlay')?.addEventListener('click', (event) => {
        if (event.target.id === 'auth-modal-overlay') closeAuthModal();
    });
    document.getElementById('account-actions-modal-overlay')?.addEventListener('click', (event) => {
        if (event.target.id === 'account-actions-modal-overlay') closeAccountActionsModal();
    });
    document.getElementById('delete-account-modal-close')?.addEventListener('click', closeDeleteAccountModal);
    document.getElementById('delete-account-modal-overlay')?.addEventListener('click', (event) => {
        if (event.target.id === 'delete-account-modal-overlay') closeDeleteAccountModal();
    });
    document.getElementById('verification-code-create-modal-close')?.addEventListener('click', closeVerificationCodeCreateModal);
    document.getElementById('verification-code-create-modal-overlay')?.addEventListener('click', (event) => {
        if (event.target.id === 'verification-code-create-modal-overlay') closeVerificationCodeCreateModal();
    });
    document.getElementById('verification-code-create-submit-btn')?.addEventListener('click', handleCreateVerificationCode);
    document.getElementById('notice-badge-settings-modal-close')?.addEventListener('click', closeNoticeBadgeSettingsModal);
    document.getElementById('notice-badge-settings-modal-overlay')?.addEventListener('click', (event) => {
        if (event.target.id === 'notice-badge-settings-modal-overlay') closeNoticeBadgeSettingsModal();
    });
    document.getElementById('notice-badge-save-btn')?.addEventListener('click', handleSaveNoticeBadgeSettings);
    document.getElementById('api-key-settings-modal-close')?.addEventListener('click', closeApiKeySettingsModal);
    document.getElementById('api-key-settings-modal-overlay')?.addEventListener('click', (event) => {
        if (event.target.id === 'api-key-settings-modal-overlay') closeApiKeySettingsModal();
    });
    document.getElementById('api-key-save-btn')?.addEventListener('click', handleSaveApiKeySettings);
    document.getElementById('auth-info-modal-close')?.addEventListener('click', closeAuthInfoModal);
    document.getElementById('auth-info-modal-overlay')?.addEventListener('click', (event) => {
        if (event.target.id === 'auth-info-modal-overlay') closeAuthInfoModal();
    });
    document.getElementById('admin-users-modal-close')?.addEventListener('click', closeAdminUsersModal);
    document.getElementById('admin-users-modal-overlay')?.addEventListener('click', (event) => {
        if (event.target.id === 'admin-users-modal-overlay') closeAdminUsersModal();
    });
    document.getElementById('admin-users-refresh-btn')?.addEventListener('click', loadAdminUsers);
    document.getElementById('admin-users-search')?.addEventListener('input', renderAdminUsers);
    document.querySelectorAll('#admin-users-tier-tabs [data-tier-filter]').forEach(button => {
        button.addEventListener('click', () => setAdminUsersTierFilter(button.dataset.tierFilter));
    });
    document.getElementById('delete-account-confirm-input')?.addEventListener('input', (event) => {
        const button = document.getElementById('delete-account-confirm-btn');
        if (button) button.disabled = event.target.value !== '탈퇴';
    });
    document.getElementById('auth-logout-btn')?.addEventListener('click', handleLogout);
    document.getElementById('settings-logout-btn')?.addEventListener('click', handleLogout);
    document.getElementById('auth-google-btn')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            await signInWithGoogle();
        } catch (error) {
            button.disabled = !isAuthConfigured();
            setAuthMessage(error.message || 'Google 로그인에 실패했습니다.', 'error');
        }
    });
    document.getElementById('auth-delete-account-btn')?.addEventListener('click', async () => {
        if (!getAuthState().user) {
            setAuthMessage('로그인이 필요합니다.', 'error');
            return;
        }

        openDeleteAccountModal();
    });
    document.getElementById('settings-delete-account-btn')?.addEventListener('click', async () => {
        if (!getAuthState().user) {
            closeAccountActionsModal();
            openAuthModal();
            return;
        }

        closeAccountActionsModal();
        openDeleteAccountModal();
    });
    document.getElementById('delete-account-confirm-btn')?.addEventListener('click', async () => {
        const button = document.getElementById('delete-account-confirm-btn');
        if (button?.disabled) return;

        try {
            if (button) button.disabled = true;
            await deleteAccount();
            revokePremiumActionAccess();
            const nextState = await loadCurrentEntitlement();
            AppState.user = null;
            AppState.entitlement = 'free';
            updateAuthUI(nextState);
            closeDeleteAccountModal();
            setAuthMessage('회원탈퇴가 완료되었습니다.');
        } catch (_error) {
            if (button) button.disabled = false;
            setAuthMessage('회원탈퇴 처리 중 오류가 발생했습니다.', 'error');
        }
    });
}

export function initAuthResumeRefresh() {
    let lastRefreshAt = 0;
    const refreshAuthState = async () => {
        if (!isAuthConfigured()) return;
        const now = Date.now();
        if (now - lastRefreshAt < 1500) return;
        lastRefreshAt = now;

        try {
            const nextState = await loadCurrentEntitlement();
            updateAuthUI(nextState);
        } catch (error) {
            console.warn('인증 상태 재확인 실패:', error);
        }
    };

    window.addEventListener('focus', refreshAuthState);
    window.addEventListener('pageshow', refreshAuthState);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshAuthState();
    });
}
