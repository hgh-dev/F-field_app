/* ==========================================================================
   [모듈] 서비스 워커 모듈 (service-worker.js)
   [역할]
   - 정적 자원과 지도 타일을 캐싱해 오프라인 사용성과 재방문 속도를 높입니다.
   - 앱 셸 자원은 네트워크 우선, 지도 타일은 캐시 우선 전략으로 분기 처리합니다.
   [동작 원리 요약]
   - 설치 시 기본 자원을 미리 캐시하고, 활성화 시 구버전 캐시를 정리합니다.
   - fetch 이벤트에서 요청 종류를 구분해 캐시/네트워크 전략을 선택하고, 새 워커는 메시지로 즉시 활성화할 수 있습니다.
   ========================================================================== */

const STATIC_CACHE_NAME = 'F-field-v1.0.10';
const MAP_CACHE_NAME = 'F-field-map-v1';
const OFFLINE_MAP_PACKAGE_CACHE_PREFIX = 'F-field-map-package-';
const MAP_CACHE_MAX_ITEMS = 15000;
const MAP_CACHE_TRIM_WRITE_INTERVAL = 100;
const MAP_CACHE_TRIM_TIME_INTERVAL_MS = 60 * 1000;

let mapCacheWriteCount = 0;
let lastMapCacheTrimAt = 0;
let mapCacheTrimInProgress = false;

// 1. 설치: Vite dist에서 루트에 남는 기본 앱 셸만 캐싱합니다.
const STATIC_URLS = [
    './',
    './index.html',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // 대기 없이 즉시 활성화
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME).then((cache) => cache.addAll(STATIC_URLS))
    );
});

// 가장 오래된 캐시 지우기 함수 (일괄 삭제 방식)
async function trimCache(cacheName, maxItems) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxItems) return;

    const keysToDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
    console.log(`[Service Worker] Deleted ${keysToDelete.length} old cache items from ${cacheName}.`);
}

function scheduleMapCacheTrim() {
    mapCacheWriteCount += 1;

    const now = Date.now();
    const hasEnoughWrites = mapCacheWriteCount >= MAP_CACHE_TRIM_WRITE_INTERVAL;
    const hasEnoughTime = now - lastMapCacheTrimAt >= MAP_CACHE_TRIM_TIME_INTERVAL_MS;
    if (!hasEnoughWrites || !hasEnoughTime || mapCacheTrimInProgress) return;

    mapCacheWriteCount = 0;
    lastMapCacheTrimAt = now;
    mapCacheTrimInProgress = true;

    trimCache(MAP_CACHE_NAME, MAP_CACHE_MAX_ITEMS)
        .catch((error) => console.warn('[Service Worker] Failed to trim map cache:', error))
        .finally(() => {
            mapCacheTrimInProgress = false;
        });
}

// 2. 활성화: 구버전 캐시 정리
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [STATIC_CACHE_NAME, MAP_CACHE_NAME];
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (!cacheWhitelist.includes(key) && !key.startsWith(OFFLINE_MAP_PACKAGE_CACHE_PREFIX)) {
                    return caches.delete(key);
                }
            }));
        }).then(() => self.clients.claim())
    );
});

// 3. 요청 처리 (여기가 핵심!)
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);
    const url = requestUrl.href;

    if (event.request.method !== 'GET' || url.includes('supabase.co')) {
        return;
    }

    if (requestUrl.pathname.endsWith('/version.json')) {
        return;
    }

    const isVworldRequest = url.includes('api.vworld.kr');
    const isVworldWmtsTileRequest = isVworldRequest && url.includes('/req/wmts');
    const isOwnStaticMapTileRequest = requestUrl.hostname === 'hgh-dev.github.io'
        && requestUrl.pathname.startsWith('/map_data/');
    const isStaticTileRequest = url.includes('arcgisonline.com')
        || url.includes('openstreetmap.org')
        || isOwnStaticMapTileRequest;
    const isOfflineMapTileRequest = isVworldWmtsTileRequest || isStaticTileRequest;

    // 주소/검색/데이터 API는 오프라인 타일이 아니므로 캐싱하지 않습니다.
    if (url.includes('/req/wms') || url.includes('/req/data') || url.includes('/req/search') || url.includes('/req/address')) {
        return;
    }

    // 전략 A: 지도 타일 이미지 (VWorld WMTS, Esri, 정적 XYZ 등) -> "캐시 우선 (Cache First)"
    // 목적: 무조건 속도! 타일은 잘 안 바뀌니까 저장된 거 먼저 씀.
    if (isOfflineMapTileRequest) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                    // 캐시에 있으면 그거 줌 (0.01초)
                    if (cachedResponse) return cachedResponse;

                    // 없으면 인터넷에서 받아와서 저장 후 줌
                    return caches.open(MAP_CACHE_NAME).then((cache) =>
                        fetch(event.request).then((networkResponse) => {
                            if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
                                cache.put(event.request, networkResponse.clone()).then(() => {
                                    scheduleMapCacheTrim();
                                });
                            }
                            return networkResponse;
                        })
                    );
            })
        );
        return; // 여기서 종료
    }

    // 전략 B: 내 코드 (index.html, script.js 등) -> "네트워크 우선 (Network First)"
    // 목적: 최신 업데이트 반영! 인터넷 되면 무조건 새거 받아옴. 안 될 때만 캐시 씀.
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // 인터넷에서 잘 받아왔으면? -> 캐시도 최신으로 교체해두고, 브라우저에 줌
                return caches.open(STATIC_CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            })
            .catch(() => {
                // 인터넷이 끊겼거나 에러나면? -> 어쩔 수 없이 캐시된 거라도 보여줌 (오프라인 지원)
                return caches.match(event.request);
            })
    );
});

// 새 서비스 워커가 대기 중일 때 페이지로부터 SKIP_WAITING 메시지를 받으면 즉시 활성화
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
