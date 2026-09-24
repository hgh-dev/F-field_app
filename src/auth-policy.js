/* Supabase SDK 없이 사용할 수 있는 인증 상태와 기능 권한 규칙 */
export const AUTH_FEATURES = Object.freeze({
    PREMIUM_ACCESS: 'premium_access',
    TRACK_RECORDING: 'track_recording',
    PHOTO_RECORDING: 'photo_recording',
    OFFLINE_MAP: 'offline_map',
    ADMIN_MENU: 'admin_menu',
    ADMIN_USERS: 'admin_users',
    VERIFICATION_CODE_CREATE: 'verification_code_create',
    NOTICE_BADGE_MANAGE: 'notice_badge_manage',
    API_KEY_MANAGE: 'api_key_manage',
    AUTH_INFO: 'auth_info'
});

const FEATURE_TIERS = Object.freeze({
    [AUTH_FEATURES.PREMIUM_ACCESS]: new Set(['verified', 'premium', 'admin']),
    [AUTH_FEATURES.TRACK_RECORDING]: new Set(['verified', 'premium', 'admin']),
    [AUTH_FEATURES.PHOTO_RECORDING]: new Set(['verified', 'premium', 'admin']),
    [AUTH_FEATURES.OFFLINE_MAP]: new Set(['verified', 'premium', 'admin']),
    [AUTH_FEATURES.ADMIN_MENU]: new Set(['admin']),
    [AUTH_FEATURES.ADMIN_USERS]: new Set(['admin']),
    [AUTH_FEATURES.VERIFICATION_CODE_CREATE]: new Set(['admin']),
    [AUTH_FEATURES.NOTICE_BADGE_MANAGE]: new Set(['admin']),
    [AUTH_FEATURES.API_KEY_MANAGE]: new Set(['admin']),
    [AUTH_FEATURES.AUTH_INFO]: new Set(['verified', 'premium', 'admin'])
});

export const authState = {
    initialized: false,
    user: null,
    tier: 'free',
    offlineMapAccessFromCache: false,
    error: null
};

export function normalizeAuthTier(tier) {
    return String(tier || 'free').trim().toLowerCase() || 'free';
}

export function canUseFeature(feature, state = authState) {
    const tier = normalizeAuthTier(state?.tier);
    const allowedTiers = FEATURE_TIERS[feature];
    if (state?.user && allowedTiers?.has(tier)) return true;
    return Boolean(feature === AUTH_FEATURES.OFFLINE_MAP && state?.user && state?.offlineMapAccessFromCache);
}

export function hasPremiumAccess() {
    return canUseFeature(AUTH_FEATURES.PREMIUM_ACCESS);
}

export function hasOfflineMapAccess() {
    return canUseFeature(AUTH_FEATURES.OFFLINE_MAP);
}

export function isAdminAccount(state = authState) {
    return Boolean(state?.user && normalizeAuthTier(state.tier) === 'admin');
}

export function getAuthState() {
    return { ...authState, isPremium: hasPremiumAccess() };
}
