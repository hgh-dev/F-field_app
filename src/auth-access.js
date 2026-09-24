/* 서버 SDK 로딩 전에도 사용할 수 있는 프리미엄 기능 접근 판정 */
import { canUseFeature, getAuthState } from './auth-policy.js';

const PREMIUM_ACTION_GRANT_MS = 10 * 60 * 1000;
const featureActionGrants = new Map();

export function ensureFeatureAccess(feature, message = '권한이 필요한 기능입니다.') {
    if ((featureActionGrants.get(feature) || 0) > Date.now()) return true;
    if (canUseFeature(feature, getAuthState())) {
        featureActionGrants.set(feature, Date.now() + PREMIUM_ACTION_GRANT_MS);
        return true;
    }
    alert(message);
    return false;
}

export function revokePremiumActionAccess() {
    featureActionGrants.clear();
}
