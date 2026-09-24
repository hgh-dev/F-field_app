/* ==========================================================================
   [모듈] 앱 데이터 저장 대기열 (storage-write-queue.js)
   [역할]
   - 같은 IndexedDB 키에 대한 저장 요청을 호출 순서대로 실행합니다.
   - 앞선 저장이 늦게 끝나 최신 상태를 덮어쓰는 경쟁 상태를 방지합니다.
   ========================================================================== */
import localforage from 'localforage';

export function createStorageWriteQueue(writeItem) {
    let storageWriteQueue = Promise.resolve();

    return function enqueueWrite(key, value) {
        const writeOperation = storageWriteQueue
            .catch(() => undefined)
            .then(() => writeItem(key, value));

        // 실패한 작업 때문에 이후 저장까지 영구적으로 중단되지 않도록 큐에는 복구된 Promise를 보관합니다.
        storageWriteQueue = writeOperation.catch(() => undefined);
        return writeOperation;
    };
}

export const enqueueStorageWrite = createStorageWriteQueue(
    (key, value) => localforage.setItem(key, value)
);
