/* ==========================================================================
   [모듈] 트랙 위치 공급자 (track-location-provider.js)
   [역할]
   - 브라우저 Geolocation API를 트랙 기록 코드에서 분리합니다.
   - 웹 Geolocation과 Android 네이티브 서비스를 같은 start/stop 형태로 제공합니다.
   ========================================================================== */
import {
    addNativeTrackListener,
    clearNativePendingTrackSession,
    getNativePendingTrackSession,
    getNativeTrackStatus,
    isAndroidNativeApp,
    startNativeTrack,
    stopNativeTrack
} from './native-bridge.js';

export const WEB_TRACK_LOCATION_OPTIONS = Object.freeze({
    enableHighAccuracy: true,
    maximumAge: 0
});

export function createWebTrackLocationProvider(geolocation = globalThis.navigator?.geolocation) {
    return {
        isAvailable() {
            return Boolean(geolocation?.watchPosition && geolocation?.clearWatch);
        },

        start({ onPosition, onError }) {
            if (!this.isAvailable()) {
                throw new Error('Geolocation API를 사용할 수 없습니다.');
            }

            return geolocation.watchPosition(
                onPosition,
                onError,
                WEB_TRACK_LOCATION_OPTIONS
            );
        },

        stop(subscriptionId) {
            if (subscriptionId === null || subscriptionId === undefined) return;
            geolocation?.clearWatch(subscriptionId);
        }
    };
}

export const webTrackLocationProvider = createWebTrackLocationProvider();

export function createNativeTrackLocationProvider(bridge = {
    addListener: addNativeTrackListener,
    clearPendingSession: clearNativePendingTrackSession,
    getPendingSession: getNativePendingTrackSession,
    getStatus: getNativeTrackStatus,
    isAvailable: isAndroidNativeApp,
    start: startNativeTrack,
    stop: stopNativeTrack
}) {
    return {
        isAvailable() {
            return bridge.isAvailable();
        },

        async start({ onPosition, onError, onStatus, minimumDistanceMeters = 0 }) {
            const listenerHandles = [];
            try {
                listenerHandles.push(await bridge.addListener('location', location => {
                    onPosition({ coords: location, timestamp: location.timestamp });
                }));
                listenerHandles.push(await bridge.addListener('statusChange', status => {
                    onStatus?.(status);
                }));
                await bridge.start({
                    intervalMs: 1000,
                    minDistanceMeters: minimumDistanceMeters
                });
                return { type: 'native', listenerHandles };
            } catch (error) {
                await Promise.allSettled(listenerHandles.map(handle => handle?.remove?.()));
                onError?.(error);
                throw error;
            }
        },

        async stop(subscription) {
            try {
                await bridge.stop();
            } finally {
                await Promise.allSettled((subscription?.listenerHandles || []).map(handle => handle?.remove?.()));
            }
        },

        getStatus() {
            return bridge.getStatus();
        },

        getPendingSession() {
            return bridge.getPendingSession();
        },

        clearPendingSession() {
            return bridge.clearPendingSession();
        }
    };
}

export const nativeTrackLocationProvider = createNativeTrackLocationProvider();

export function getTrackLocationProvider() {
    return nativeTrackLocationProvider.isAvailable()
        ? nativeTrackLocationProvider
        : webTrackLocationProvider;
}
