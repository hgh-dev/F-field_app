import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AUTH_FEATURES,
    canUseFeature,
    isAdminAccount
} from '../src/auth-policy.js';

test('인증 등급별 프리미엄 및 관리자 기능 권한을 유지한다', () => {
    const verified = { user: { id: 'verified-user' }, tier: 'verified' };
    const admin = { user: { id: 'admin-user' }, tier: 'admin' };
    const free = { user: { id: 'free-user' }, tier: 'free' };

    assert.equal(canUseFeature(AUTH_FEATURES.TRACK_RECORDING, verified), true);
    assert.equal(canUseFeature(AUTH_FEATURES.ADMIN_MENU, verified), false);
    assert.equal(canUseFeature(AUTH_FEATURES.ADMIN_MENU, admin), true);
    assert.equal(canUseFeature(AUTH_FEATURES.PHOTO_RECORDING, free), false);
    assert.equal(isAdminAccount(admin), true);
});

test('오프라인 지도 권한 캐시는 오프라인 지도 기능에만 적용된다', () => {
    const cachedState = {
        user: { id: 'cached-user' },
        tier: 'free',
        offlineMapAccessFromCache: true
    };

    assert.equal(canUseFeature(AUTH_FEATURES.OFFLINE_MAP, cachedState), true);
    assert.equal(canUseFeature(AUTH_FEATURES.TRACK_RECORDING, cachedState), false);
});
