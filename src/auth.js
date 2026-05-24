/* ==========================================================================
   [모듈] 인증 및 권한 관리 (auth.js)
   [역할]
   - Supabase 로그인, 회원 권한, 관리자 권한, 인증 코드 발급/사용을 관리합니다.
   - 프리미엄 기능 사용 가능 여부와 공지 배지 설정 같은 서버 연동 상태를 제공합니다.
   [참고]
   - 로그인, 권한, 관리자 기능, 유료 기능 제한 문제가 생기면 먼저 확인합니다.
   ========================================================================== */
import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const AUTH_FEATURES = Object.freeze({
    PREMIUM_ACCESS: 'premium_access',
    TRACK_RECORDING: 'track_recording',
    PHOTO_RECORDING: 'photo_recording',
    OFFLINE_MAP: 'offline_map',
    ADMIN_MENU: 'admin_menu',
    ADMIN_USERS: 'admin_users',
    VERIFICATION_CODE_CREATE: 'verification_code_create',
    NOTICE_BADGE_MANAGE: 'notice_badge_manage',
    AUTH_INFO: 'auth_info'
});

const PREMIUM_TIERS = new Set(['verified', 'premium', 'admin']);
const FEATURE_TIERS = Object.freeze({
    [AUTH_FEATURES.PREMIUM_ACCESS]: new Set(['verified', 'premium', 'admin']),
    [AUTH_FEATURES.TRACK_RECORDING]: new Set(['verified', 'premium', 'admin']),
    [AUTH_FEATURES.PHOTO_RECORDING]: new Set(['verified', 'premium', 'admin']),
    [AUTH_FEATURES.OFFLINE_MAP]: new Set(['verified', 'premium', 'admin']),
    [AUTH_FEATURES.ADMIN_MENU]: new Set(['admin']),
    [AUTH_FEATURES.ADMIN_USERS]: new Set(['admin']),
    [AUTH_FEATURES.VERIFICATION_CODE_CREATE]: new Set(['admin']),
    [AUTH_FEATURES.NOTICE_BADGE_MANAGE]: new Set(['admin']),
    [AUTH_FEATURES.AUTH_INFO]: new Set(['verified', 'premium', 'admin'])
});
const ANDROID_AUTH_REDIRECT_URL = 'app.ffield.mobile://auth-callback';
const AUTH_URL_PARAM_KEYS = new Set([
    'access_token',
    'refresh_token',
    'provider_token',
    'provider_refresh_token',
    'expires_at',
    'expires_in',
    'token_type',
    'type',
    'code',
    'sb'
]);

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        // TODO: PKCE 전환은 Supabase redirect 설정과 Android 딥링크 흐름을 함께 검증한 뒤 별도 적용합니다.
        auth: { detectSessionInUrl: true }
    })
    : null;

const authState = {
    initialized: false,
    user: null,
    tier: 'free',
    error: null
};
let appUrlOpenListener = null;
let authChangeHandler = null;
let browserAuthUrlScrubListenersInstalled = false;

export function isAuthConfigured() {
    return Boolean(supabase);
}

export function getAuthState() {
    return { ...authState, isPremium: hasPremiumAccess() };
}

function normalizeAuthTier(tier) {
    return String(tier || 'free').trim().toLowerCase() || 'free';
}

export function isAdminAccount(state = authState) {
    return Boolean(state?.user && normalizeAuthTier(state.tier) === 'admin');
}

export function canUseFeature(feature, state = authState) {
    const tier = normalizeAuthTier(state?.tier);
    const allowedTiers = FEATURE_TIERS[feature];
    return Boolean(state?.user && allowedTiers?.has(tier));
}

export function hasPremiumAccess() {
    return canUseFeature(AUTH_FEATURES.PREMIUM_ACCESS);
}

export function hasOfflineMapAccess() {
    return canUseFeature(AUTH_FEATURES.OFFLINE_MAP);
}

async function fetchEntitlementTier(userId) {
    if (!supabase || !userId) return 'free';

    const normalizeTier = (row) => {
        const tier = String(row?.tier || 'free').trim().toLowerCase();
        if (tier === 'admin') return 'admin';
        if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return 'free';
        return PREMIUM_TIERS.has(tier) ? tier : 'free';
    };

    const byUserId = await supabase
        .from('entitlements')
        .select('tier, expires_at')
        .eq('user_id', userId)
        .maybeSingle();

    if (!byUserId.error && byUserId.data) return normalizeTier(byUserId.data);

    const byId = await supabase
        .from('entitlements')
        .select('tier, expires_at')
        .eq('id', userId)
        .maybeSingle();

    if (byId.error) throw byId.error;
    return normalizeTier(byId.data);
}

async function refreshEntitlement(session) {
    authState.user = session?.user || null;
    authState.tier = 'free';
    authState.error = null;

    if (!authState.user) return getAuthState();

    try {
        authState.tier = await fetchEntitlementTier(authState.user.id);
    } catch (error) {
        console.warn('권한 확인 실패:', error);
        authState.error = error.message || '권한 확인에 실패했습니다.';
        authState.tier = 'free';
    }

    return getAuthState();
}

function getGoogleRedirectUrl() {
    if (Capacitor.isNativePlatform()) return ANDROID_AUTH_REDIRECT_URL;

    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    return isLocalhost
        ? window.location.origin
        : 'https://f-field.app/';
}

function getTokenParamsFromUrl(url) {
    const parsed = new URL(url);
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    const queryParams = parsed.searchParams;

    return {
        accessToken: hashParams.get('access_token') || queryParams.get('access_token'),
        refreshToken: hashParams.get('refresh_token') || queryParams.get('refresh_token')
    };
}

function paramsHaveAuthKeys(params) {
    for (const key of AUTH_URL_PARAM_KEYS) {
        if (params.has(key)) return true;
    }
    return false;
}

function rawUrlPartHasAuthKeys(value = '') {
    const normalized = String(value).toLowerCase();
    for (const key of AUTH_URL_PARAM_KEYS) {
        if (normalized.includes(`${key.toLowerCase()}=`)) return true;
    }
    return false;
}

function removeAuthKeysFromParams(params) {
    AUTH_URL_PARAM_KEYS.forEach(key => params.delete(key));
    return params;
}

function getCleanHash(hash) {
    if (!hash) return '';

    const rawHash = hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(rawHash);
    if (!paramsHaveAuthKeys(hashParams) && !rawUrlPartHasAuthKeys(rawHash)) return hash;
    if (!paramsHaveAuthKeys(hashParams)) return '';

    removeAuthKeysFromParams(hashParams);
    const nextHash = hashParams.toString();
    return nextHash ? `#${nextHash}` : '';
}

function hasAuthParamsInCurrentUrl() {
    if (typeof window === 'undefined') return false;
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return paramsHaveAuthKeys(searchParams)
        || paramsHaveAuthKeys(hashParams)
        || rawUrlPartHasAuthKeys(window.location.search)
        || rawUrlPartHasAuthKeys(window.location.hash);
}

function scrubAuthTokensFromUrl() {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;

    const searchParams = new URLSearchParams(window.location.search);
    const hasAuthSearch = paramsHaveAuthKeys(searchParams);
    if (hasAuthSearch) removeAuthKeysFromParams(searchParams);

    const nextSearch = searchParams.toString();
    const nextHash = getCleanHash(window.location.hash);
    const cleanUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${nextHash}`;
    window.history.replaceState({}, document.title, cleanUrl);
}

function installBrowserAuthUrlScrubListeners() {
    if (typeof window === 'undefined' || browserAuthUrlScrubListenersInstalled || Capacitor.isNativePlatform()) return;
    browserAuthUrlScrubListenersInstalled = true;

    const scrubIfNeeded = () => {
        if (hasAuthParamsInCurrentUrl()) scrubAuthTokensFromUrl();
    };

    window.addEventListener('popstate', scrubIfNeeded);
    window.addEventListener('hashchange', scrubIfNeeded);
    window.addEventListener('pageshow', scrubIfNeeded);
}

async function handleNativeOAuthCallback(url) {
    if (!supabase || !url?.startsWith(ANDROID_AUTH_REDIRECT_URL)) return false;

    const { accessToken, refreshToken } = getTokenParamsFromUrl(url);
    if (!accessToken || !refreshToken) return false;

    const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
    });
    if (error) throw error;

    await refreshEntitlement(data.session);
    authChangeHandler?.(getAuthState());
    return true;
}

async function setupNativeAuthCallbackListener() {
    if (!Capacitor.isNativePlatform() || appUrlOpenListener) return;

    appUrlOpenListener = await App.addListener('appUrlOpen', async ({ url }) => {
        try {
            await handleNativeOAuthCallback(url);
        } catch (error) {
            console.warn('Google 로그인 콜백 처리 실패');
            authState.error = 'Google 로그인 처리에 실패했습니다.';
            authChangeHandler?.(getAuthState());
        }
    });

    const launchUrl = await App.getLaunchUrl();
    if (launchUrl?.url) {
        try {
            await handleNativeOAuthCallback(launchUrl.url);
        } catch (error) {
            console.warn('Google 로그인 시작 URL 처리 실패');
        }
    }
}

export async function loadCurrentEntitlement() {
    if (!supabase) return getAuthState();

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return await refreshEntitlement(data.session);
}

export async function initAuth(onChange) {
    authChangeHandler = onChange;

    if (!supabase) {
        authState.initialized = true;
        authState.error = '.env.local에 Supabase 설정이 없습니다.';
        onChange?.(getAuthState());
        return getAuthState();
    }

    await setupNativeAuthCallbackListener();

    const shouldScrubBrowserAuthUrl = !Capacitor.isNativePlatform() && hasAuthParamsInCurrentUrl();
    supabase.auth.onAuthStateChange((event, session) => {
        setTimeout(async () => {
            if (!Capacitor.isNativePlatform() && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || hasAuthParamsInCurrentUrl())) {
                scrubAuthTokensFromUrl();
            }
            await refreshEntitlement(session);
            onChange?.(getAuthState());
        }, 0);
    });

    const { data } = await supabase.auth.getSession();
    if (shouldScrubBrowserAuthUrl) scrubAuthTokensFromUrl();
    installBrowserAuthUrlScrubListeners();
    await refreshEntitlement(data.session);
    authState.initialized = true;
    onChange?.(getAuthState());

    return getAuthState();
}

export async function signInWithGoogle() {
    if (!supabase) throw new Error('.env.local에 Supabase 설정이 없습니다.');

    const redirectTo = getGoogleRedirectUrl();

    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo
        }
    });

    // Capacitor Android에서는 앱 스킴 딥링크와 Supabase redirect URL 등록이 추가로 필요할 수 있습니다.
    if (error) throw error;
}

export async function redeemVerificationCode(code) {
    if (!supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('.env.local에 Supabase 설정이 없습니다.');
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('로그인이 필요합니다.');

    let response;
    try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/verify-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ code })
        });
    } catch (_error) {
        throw new Error('인증코드 확인 중 오류가 발생했습니다.');
    }

    let result = null;
    try {
        result = await response.json();
    } catch (_error) {
        result = null;
    }

    if (!response.ok) {
        throw new Error(result?.error || '인증코드 확인 중 오류가 발생했습니다.');
    }

    return result;
}

export async function createVerificationCode(options = {}) {
    if (!supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('.env.local에 Supabase 설정이 없습니다.');
    }
    if (!canUseFeature(AUTH_FEATURES.VERIFICATION_CODE_CREATE)) {
        throw new Error('관리자 권한이 필요합니다.');
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('로그인이 필요합니다.');

    let response;
    try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/create-verification-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(options)
        });
    } catch (_error) {
        throw new Error('인증코드 생성 중 오류가 발생했습니다.');
    }

    let result = null;
    try {
        result = await response.json();
    } catch (_error) {
        result = null;
    }

    if (!response.ok) {
        throw new Error(result?.error || '인증코드 생성 중 오류가 발생했습니다.');
    }

    return result;
}

export async function fetchAppSettings() {
    if (!supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return null;
    }

    let response;
    try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/get-app-settings`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY
            },
            cache: 'no-store'
        });
    } catch (_error) {
        return null;
    }

    if (!response.ok) return null;

    try {
        return await response.json();
    } catch (_error) {
        return null;
    }
}

export async function updateNoticeBadgeSettings(options = {}) {
    if (!supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('.env.local에 Supabase 설정이 없습니다.');
    }
    if (!canUseFeature(AUTH_FEATURES.NOTICE_BADGE_MANAGE)) {
        throw new Error('관리자 권한이 필요합니다.');
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('로그인이 필요합니다.');

    let response;
    try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/update-notice-badge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(options)
        });
    } catch (_error) {
        throw new Error('공지 뱃지 설정 중 오류가 발생했습니다.');
    }

    let result = null;
    try {
        result = await response.json();
    } catch (_error) {
        result = null;
    }

    if (!response.ok) {
        throw new Error(result?.error || '공지 뱃지 설정 중 오류가 발생했습니다.');
    }

    return result;
}

export async function fetchAuthInfo() {
    if (!supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('.env.local에 Supabase 설정이 없습니다.');
    }
    if (!canUseFeature(AUTH_FEATURES.AUTH_INFO)) {
        throw new Error('인증된 계정에서 확인할 수 있습니다.');
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('로그인이 필요합니다.');

    let response;
    try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/get-auth-info`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`
            },
            cache: 'no-store'
        });
    } catch (_error) {
        throw new Error('인증정보를 불러올 수 없습니다.');
    }

    let result = null;
    try {
        result = await response.json();
    } catch (_error) {
        result = null;
    }

    if (!response.ok) {
        throw new Error(result?.error || '인증정보를 불러올 수 없습니다.');
    }

    return result;
}

export async function fetchAdminUsers() {
    if (!supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('.env.local에 Supabase 설정이 없습니다.');
    }
    if (!canUseFeature(AUTH_FEATURES.ADMIN_USERS)) {
        throw new Error('관리자 권한이 필요합니다.');
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('로그인이 필요합니다.');

    let response;
    try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/list-admin-users`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`
            },
            cache: 'no-store'
        });
    } catch (_error) {
        throw new Error('회원 정보를 불러올 수 없습니다.');
    }

    let result = null;
    try {
        result = await response.json();
    } catch (_error) {
        result = null;
    }

    if (!response.ok) throw new Error(result?.error || '회원 정보를 불러올 수 없습니다.');
    return result;
}

export async function updateUserEntitlement(options = {}) {
    if (!supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('.env.local에 Supabase 설정이 없습니다.');
    }
    if (!canUseFeature(AUTH_FEATURES.ADMIN_USERS)) {
        throw new Error('관리자 권한이 필요합니다.');
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('로그인이 필요합니다.');

    let response;
    try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/update-user-entitlement`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(options)
        });
    } catch (_error) {
        throw new Error('권한 변경 중 오류가 발생했습니다.');
    }

    let result = null;
    try {
        result = await response.json();
    } catch (_error) {
        result = null;
    }

    if (!response.ok) throw new Error(result?.error || '권한 변경 중 오류가 발생했습니다.');
    return result;
}

export async function deleteAccount() {
    if (!supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('.env.local에 Supabase 설정이 없습니다.');
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('로그인이 필요합니다.');

    let response;
    try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`
            }
        });
    } catch (_error) {
        throw new Error('회원탈퇴 처리 중 오류가 발생했습니다.');
    }

    let result = null;
    try {
        result = await response.json();
    } catch (_error) {
        result = null;
    }

    if (!response.ok) {
        throw new Error(result?.error || '회원탈퇴 처리 중 오류가 발생했습니다.');
    }

    try {
        await supabase.auth.signOut();
    } catch (_error) {
        console.warn('회원탈퇴 후 로컬 세션 정리에 실패했습니다.');
    }

    return result;
}

export async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (!Capacitor.isNativePlatform() && hasAuthParamsInCurrentUrl()) scrubAuthTokensFromUrl();
    if (error) throw error;
}
