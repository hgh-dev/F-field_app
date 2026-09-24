import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createNativeTrackLocationProvider,
    createWebTrackLocationProvider,
    WEB_TRACK_LOCATION_OPTIONS
} from '../src/track-location-provider.js';
import { readTrackPoint, shouldAppendTrackPoint } from '../src/track-point-filter.js';

test('웹 트랙 위치 공급자는 watchPosition 시작과 clearWatch 중지를 감싼다', () => {
    const calls = [];
    const geolocation = {
        watchPosition(onPosition, onError, options) {
            calls.push({ type: 'start', onPosition, onError, options });
            return 17;
        },
        clearWatch(id) {
            calls.push({ type: 'stop', id });
        }
    };
    const provider = createWebTrackLocationProvider(geolocation);
    const onPosition = () => {};
    const onError = () => {};

    assert.equal(provider.isAvailable(), true);
    const subscriptionId = provider.start({ onPosition, onError });
    provider.stop(subscriptionId);

    assert.equal(subscriptionId, 17);
    assert.deepEqual(calls[0], {
        type: 'start',
        onPosition,
        onError,
        options: WEB_TRACK_LOCATION_OPTIONS
    });
    assert.deepEqual(calls[1], { type: 'stop', id: 17 });
});

test('Android 트랙 위치 공급자는 네이티브 좌표 이벤트와 서비스 수명주기를 연결한다', async () => {
    const listeners = new Map();
    const removed = [];
    const calls = [];
    const bridge = {
        isAvailable: () => true,
        addListener: async (name, listener) => {
            listeners.set(name, listener);
            return { remove: async () => removed.push(name) };
        },
        start: async options => calls.push({ type: 'start', options }),
        stop: async () => calls.push({ type: 'stop' }),
        getStatus: async () => ({ running: true }),
        getPendingSession: async () => ({ session: { points: [] } }),
        clearPendingSession: async () => calls.push({ type: 'clear' })
    };
    const positions = [];
    const provider = createNativeTrackLocationProvider(bridge);
    const subscription = await provider.start({
        onPosition: position => positions.push(position),
        onError: () => {},
        minimumDistanceMeters: 10
    });

    listeners.get('location')({ latitude: 37.2, longitude: 127.1, timestamp: 1234 });
    await provider.stop(subscription);

    assert.deepEqual(calls[0], {
        type: 'start',
        options: { intervalMs: 1000, minDistanceMeters: 10 }
    });
    assert.deepEqual(positions[0], {
        coords: { latitude: 37.2, longitude: 127.1, timestamp: 1234 },
        timestamp: 1234
    });
    assert.deepEqual(removed.sort(), ['location', 'statusChange']);
    assert.equal(calls.at(-1).type, 'stop');
});

test('트랙 좌표는 유효한 위경도만 읽고 부가 정보를 보존한다', () => {
    assert.deepEqual(readTrackPoint({
        coords: { latitude: 37.25, longitude: 127.1, accuracy: 4.5 },
        timestamp: 1234
    }), {
        latitude: 37.25,
        longitude: 127.1,
        accuracy: 4.5,
        timestamp: 1234
    });
    assert.equal(readTrackPoint({ coords: { latitude: 91, longitude: 127 } }), null);
    assert.equal(readTrackPoint({ coords: { latitude: '없음', longitude: 127 } }), null);
    assert.equal(readTrackPoint({ latitude: 37.1, longitude: 127.2 }).latitude, 37.1);
});

test('첫 좌표는 추가하고 이후 좌표는 설정 거리 이상 이동했을 때만 추가한다', () => {
    const first = { latitude: 37, longitude: 127 };
    const previous = { latitude: 37, longitude: 127 };
    const distanceBetween = () => 9.9;

    assert.equal(shouldAppendTrackPoint({
        point: first,
        previousPoint: null,
        minimumDistanceMeters: 10,
        distanceBetween
    }), true);
    assert.equal(shouldAppendTrackPoint({
        point: first,
        previousPoint: previous,
        minimumDistanceMeters: 10,
        distanceBetween
    }), false);
    assert.equal(shouldAppendTrackPoint({
        point: first,
        previousPoint: previous,
        minimumDistanceMeters: 10,
        distanceBetween: () => 10
    }), true);
});
