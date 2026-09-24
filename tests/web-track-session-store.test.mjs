import test from 'node:test';
import assert from 'node:assert/strict';

import { createWebTrackSessionStore } from '../src/web-track-session-store.js';

function createMemoryStorage() {
    const values = new Map();
    return {
        getItem: async key => values.get(key) ?? null,
        setItem: async (key, value) => values.set(key, structuredClone(value)),
        removeItem: async key => values.delete(key)
    };
}

test('웹 트랙 좌표와 화면 이탈 구간을 순서대로 저장하고 복구한다', async () => {
    const store = createWebTrackSessionStore(createMemoryStorage());
    await store.beginOrResume();
    await Promise.all([
        store.appendPoint({ latitude: 37.1, longitude: 127.1, accuracy: 5, timestamp: 1 }),
        store.appendPoint({ latitude: 37.2, longitude: 127.2, accuracy: 6, timestamp: 2 })
    ]);
    await store.markHidden(10);
    await store.markVisible(20);
    await store.markStopped();

    const session = await store.getSession();
    assert.equal(session.points.length, 2);
    assert.deepEqual(session.gaps, [{ hiddenAt: 10, resumedAt: 20 }]);
    assert.equal(session.state, 'stopped');
});

test('웹 트랙 임시 기록을 지우면 복구 대상이 남지 않는다', async () => {
    const store = createWebTrackSessionStore(createMemoryStorage());
    await store.beginOrResume();
    await store.appendPoint({ latitude: 37, longitude: 127, timestamp: 1 });
    await store.clear();
    assert.equal(await store.getSession(), null);
});
