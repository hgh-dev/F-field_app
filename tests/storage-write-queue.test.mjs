import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorageWriteQueue } from '../src/storage-write-queue.js';

test('저장 시간이 달라도 요청 순서대로 완료된다', async () => {
    const completed = [];
    const enqueue = createStorageWriteQueue(async (_key, value) => {
        await new Promise(resolve => setTimeout(resolve, value.delay));
        completed.push(value.id);
    });

    await Promise.all([
        enqueue('projects', { id: 1, delay: 30 }),
        enqueue('projects', { id: 2, delay: 0 }),
        enqueue('projects', { id: 3, delay: 1 })
    ]);

    assert.deepEqual(completed, [1, 2, 3]);
});

test('한 번 저장에 실패해도 다음 저장은 계속된다', async () => {
    const completed = [];
    const enqueue = createStorageWriteQueue(async (_key, value) => {
        if (value.fail) throw new Error('저장 실패');
        completed.push(value.id);
    });

    await assert.rejects(enqueue('projects', { id: 1, fail: true }), /저장 실패/);
    await enqueue('projects', { id: 2 });
    assert.deepEqual(completed, [2]);
});
