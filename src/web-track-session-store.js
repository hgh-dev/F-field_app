/* ==========================================================================
   [모듈] 웹 트랙 임시 저장소 (web-track-session-store.js)
   [역할]
   - 웹 트랙 좌표와 화면 이탈 구간을 IndexedDB에 순서대로 저장합니다.
   - 새로고침이나 브라우저 중단 뒤에도 마지막 미완료 기록을 복구합니다.
   ========================================================================== */
import localforage from 'localforage';

export const WEB_TRACK_SESSION_KEY = 'active-track';

export function createWebTrackSessionStore(storage) {
    let cachedSession = null;
    let writeQueue = Promise.resolve();

    async function loadSession() {
        if (cachedSession) return cachedSession;
        cachedSession = await storage.getItem(WEB_TRACK_SESSION_KEY);
        return cachedSession;
    }

    function enqueueMutation(mutate) {
        const operation = writeQueue
            .catch(() => undefined)
            .then(async () => {
                const session = await loadSession();
                const nextSession = mutate(session);
                cachedSession = nextSession;
                if (nextSession) await storage.setItem(WEB_TRACK_SESSION_KEY, nextSession);
                else await storage.removeItem(WEB_TRACK_SESSION_KEY);
                return nextSession;
            });
        writeQueue = operation.catch(() => undefined);
        return operation;
    }

    return {
        async getSession() {
            await writeQueue;
            return await loadSession();
        },

        beginOrResume() {
            return enqueueMutation(session => {
                const now = Date.now();
                if (session?.id && Array.isArray(session.points)) {
                    return { ...session, state: 'recording', updatedAt: now };
                }
                return {
                    id: globalThis.crypto?.randomUUID?.() || `web-${now}`,
                    startedAt: now,
                    updatedAt: now,
                    state: 'recording',
                    points: [],
                    gaps: []
                };
            });
        },

        appendPoint(point) {
            return enqueueMutation(session => {
                if (!session) return session;
                return {
                    ...session,
                    state: 'recording',
                    updatedAt: Date.now(),
                    points: [...session.points, {
                        latitude: point.latitude,
                        longitude: point.longitude,
                        accuracy: point.accuracy,
                        timestamp: point.timestamp
                    }]
                };
            });
        },

        markHidden(hiddenAt = Date.now()) {
            return enqueueMutation(session => {
                if (!session) return session;
                const gaps = [...(session.gaps || [])];
                const lastGap = gaps[gaps.length - 1];
                if (!lastGap || lastGap.resumedAt) gaps.push({ hiddenAt, resumedAt: null });
                return { ...session, updatedAt: hiddenAt, gaps };
            });
        },

        markVisible(resumedAt = Date.now()) {
            return enqueueMutation(session => {
                if (!session) return session;
                const gaps = [...(session.gaps || [])];
                const lastIndex = gaps.length - 1;
                if (lastIndex >= 0 && !gaps[lastIndex].resumedAt) {
                    gaps[lastIndex] = { ...gaps[lastIndex], resumedAt };
                }
                return { ...session, updatedAt: resumedAt, gaps };
            });
        },

        markStopped() {
            return enqueueMutation(session => session
                ? { ...session, state: 'stopped', updatedAt: Date.now() }
                : session);
        },

        clear() {
            return enqueueMutation(() => null);
        }
    };
}

const webTrackStorage = localforage.createInstance({
    name: 'FField',
    storeName: 'web_track_session',
    description: '웹에서 완료되지 않은 GPS 트랙 임시 기록'
});

export const webTrackSessionStore = createWebTrackSessionStore(webTrackStorage);
