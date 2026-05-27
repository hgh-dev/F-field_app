/* ==========================================================================
   [모듈] 오프라인 지도 UI (ui-offline-map.js)
   [역할]
   - 지도 타일 다운로드, 저장된 오프라인 지도 목록, 오프라인 지도 이동/삭제를 관리합니다.
   - 오프라인 지도 기능 권한과 다운로드 진행 상태를 화면에 반영합니다.
   [참고]
   - 오프라인 지도 저장, 목록, 삭제, 권한 표시 문제가 생기면 확인합니다.
   ========================================================================== */
import { VWORLD_API_KEY } from './config.js';
import { AUTH_FEATURES, canUseFeature, getAuthState } from './auth.js';
import { map, getOfflineDownloadBounds, getOfflineMapUrls, isOfflineDownloadableMapLayer } from './map.js';
import { getShortAddress } from './utils.js';
import { showAppConfirm } from './app-dialog.js';

const OFFLINE_MAP_PACKAGES_KEY = 'f-field-offline-map-packages-v1';
const OFFLINE_MAP_CACHE_PREFIX = 'F-field-map-package-';
const OFFLINE_MAP_FALLBACK_CACHE = 'F-field-map-v1';

function isNetworkOnline() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function escapeJsString(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}


/* --------------------------------------------------------------------------
   8. 오프라인 지도 기능 (Offline Map)
   -------------------------------------------------------------------------- */
/**
 * [함수] updateOfflineButton
 * [역할] 상태값 또는 표시값을 최신 값으로 갱신한다.
 * [원리] 현재 상태값을 화면 표현값으로 재계산한 뒤,
 *        DOM 텍스트·버튼 상태·레이어 스타일에 즉시 반영해 표시를 최신으로 유지한다.
 */
export function updateOfflineButton() {
    const btn = document.getElementById('btn-offline-map');
    const textSpan = document.getElementById('btn-offline-map-text');
    if (!btn || !textSpan) return;

    textSpan.innerText = '다운로드';

    if (!canUseFeature(AUTH_FEATURES.OFFLINE_MAP, getAuthState())) {
        btn.disabled = true;
        btn.style.backgroundColor = '#ccc';
        return;
    }

    if (!isNetworkOnline()) {
        btn.disabled = true;
        btn.style.backgroundColor = '#ccc';
        btn.title = '인터넷 연결이 없을 때는 새 오프라인 지도를 다운로드할 수 없습니다.';
        return;
    }

    btn.title = '';

    if (map.getZoom() < 15) {
        btn.disabled = true;
        btn.style.backgroundColor = '#ccc';
    } else {
        btn.disabled = false;
        btn.style.backgroundColor = '#007bff';
    }
}

function loadOfflineMapPackages() {
    try {
        const parsed = JSON.parse(localStorage.getItem(OFFLINE_MAP_PACKAGES_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveOfflineMapPackages(packages) {
    localStorage.setItem(OFFLINE_MAP_PACKAGES_KEY, JSON.stringify(packages));
}

function formatOfflineMapSize(bytes = 0) {
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function getOfflinePackageCacheName(packageId) {
    return `${OFFLINE_MAP_CACHE_PREFIX}${packageId}`;
}

function getActiveOfflineLayerNames() {
    const names = [];
    map.eachLayer((layer) => {
        if (!isOfflineDownloadableMapLayer(layer)) return;
        const name = String(
            layer.options?.attribution ||
            layer.options?.layers ||
            layer.options?.layer ||
            layer.options?.name ||
            '지도'
        ).trim();
        names.push(name);
    });
    return [...new Set(names)];
}

function requestJsonp(url) {
    return new Promise((resolve, reject) => {
        const callbackName = `offline_map_addr_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
        const script = document.createElement('script');
        script.id = callbackName;

        const cleanup = () => {
            delete window[callbackName];
            script.remove();
        };

        window[callbackName] = (data) => {
            cleanup();
            resolve(data);
        };
        script.onerror = () => {
            cleanup();
            reject(new Error('주소 조회에 실패했습니다.'));
        };
        script.src = `${url}&callback=${callbackName}`;
        document.body.appendChild(script);
    });
}

async function getOfflineMapPackageTitle(lat, lng) {
    try {
        const data = await requestJsonp(`https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lng},${lat}&format=jsonp&type=BOTH&zipcode=false&simple=false&key=${VWORLD_API_KEY}`);
        const fullText = data?.response?.status === 'OK' ? data.response.result?.[0]?.text : '';
        const shortAddress = getShortAddress(fullText || '');
        if (shortAddress) return `${shortAddress} 일대`;
        if (fullText) return `${fullText} 일대`;
    } catch (error) {
        console.warn('오프라인 지도 이름용 주소 조회 실패:', error);
    }
    return `오프라인 지도 ${new Date().toLocaleString('ko-KR')}`;
}

export function renderOfflineMapPackageList() {
    const list = document.getElementById('offline-map-package-list');
    const empty = document.getElementById('offline-map-package-empty');
    if (!list || !empty) return;

    const packages = loadOfflineMapPackages().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    empty.style.display = packages.length ? 'none' : 'block';

    if (!packages.length) {
        list.innerHTML = '';
        return;
    }

    list.innerHTML = packages.map(pkg => `
        <div class="offline-map-package-item" role="button" tabindex="0" onclick="moveToOfflineMapPackage('${escapeJsString(pkg.id)}', event)" style="padding:10px 0; border-bottom:1px solid #f0f0f0; cursor:pointer;">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px;">
                <div style="min-width:0; flex:1;">
                    <div style="font-size:13px; font-weight:700; color:#111827; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(pkg.name || '오프라인 지도')}</div>
                    <div style="margin-top:3px; font-size:11px; color:#6b7280; line-height:1.45;">
                        ${escapeHtml((pkg.layerNames || []).join(' / ') || '지도')}<br>
                        15~18레벨 / ${pkg.tileCount || 0}개 타일 / ${escapeHtml(formatOfflineMapSize(pkg.estimatedBytes || 0))}
                    </div>
                </div>
                <button type="button" class="btn-more" title="삭제" onclick="deleteOfflineMapPackage('${escapeJsString(pkg.id)}', event)" style="flex-shrink:0;">
                    <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </div>
        </div>
    `).join('');
    list.querySelectorAll('.offline-map-package-item').forEach(itemEl => {
        itemEl.onkeydown = (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                itemEl.click();
            }
        };
    });
}

/**
 * [함수] downloadOfflineMap
 * [역할] 현재 데이터를 파일 형태로 내려받게 한다.
 * [원리] 현재 중심의 15레벨 화면 범위로 타일 URL 목록을 만들고 Cache Storage에 청크 저장하며,
 *        진행률 모달·오류 처리·버튼 잠금/해제를 함께 관리해 다운로드 과정을 시각화한다.
 */
export async function downloadOfflineMap() {
    if (!canUseFeature(AUTH_FEATURES.OFFLINE_MAP, getAuthState())) {
        alert('오프라인 지도 기능은 인증된 계정, 프리미엄 계정, 관리자 계정만 사용할 수 있습니다.');
        return;
    }

    if (!isNetworkOnline()) {
        alert('인터넷 연결이 없을 때는 새 오프라인 지도를 다운로드할 수 없습니다.\n이미 저장한 오프라인 지도는 목록에서 선택해 사용할 수 있습니다.');
        return;
    }

    const zoom = map.getZoom();
    if (zoom < 15) return;

    const btn = document.getElementById('btn-offline-map');
    if (btn) btn.disabled = true;

    const minZoom = 15;
    const maxZoom = 18;
    const downloadBounds = getOfflineDownloadBounds(minZoom);
    const urls = getOfflineMapUrls(downloadBounds, minZoom, maxZoom);
    const center = map.getCenter();
    const packageId = `offline-map-${Date.now()}`;
    const packageCacheName = getOfflinePackageCacheName(packageId);
    const layerNames = getActiveOfflineLayerNames();

    if (urls.length === 0) {
        alert('다운로드 가능한 VWorld WMTS 배경지도가 켜져 있지 않습니다.\n일반지도, 위성지도, 하이브리드 중 하나를 켠 뒤 다시 시도하세요.');
        if (btn) btn.disabled = false;
        return;
    }

    // 약 25KB 당 계산 (MB)
    const mbSize = (urls.length * 25 / 1024).toFixed(1);

    if (!await showAppConfirm(`총 ${urls.length}개의 파일 (약 ${mbSize} MB)을 다운로드합니다. 데이터가 소모됩니다.\n진행하시겠습니까?`, { title: '오프라인 지도 다운로드' })) {
        if (btn) btn.disabled = false;
        return;
    }

    const overlay = document.getElementById('offline-download-modal-overlay');
    const progressEl = document.getElementById('offline-download-progress');
    const totalEl = document.getElementById('offline-download-total');

    if (overlay) {
        overlay.style.display = 'flex';
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
        });
    }
    if (totalEl) totalEl.innerText = urls.length;
    if (progressEl) progressEl.innerText = '0';

    try {
        const cache = await caches.open(packageCacheName);
        let count = 0;

        // chunk fetch
        const chunkSize = 10;
        for (let i = 0; i < urls.length; i += chunkSize) {
            const chunk = urls.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (url) => {
                try {
                    const response = await fetch(url, { mode: 'cors' });
                    if (response.ok || response.type === 'opaque') {
                        await cache.put(url, response.clone());
                    }
                } catch (e) {
                    console.error("Tile fetch error:", url, e);
                } finally {
                    count++;
                    if (progressEl) progressEl.innerText = count;
                }
            }));
        }

        const packages = loadOfflineMapPackages();
        packages.push({
            id: packageId,
            cacheName: packageCacheName,
            name: await getOfflineMapPackageTitle(center.lat, center.lng),
            center: { lat: center.lat, lng: center.lng },
            tileCount: urls.length,
            estimatedBytes: urls.length * 25 * 1024,
            layerNames,
            minZoom,
            maxZoom,
            createdAt: new Date().toISOString()
        });
        saveOfflineMapPackages(packages);
        renderOfflineMapPackageList();
        alert('오프라인 지도 저장이 완료되었습니다.');
    } catch (e) {
        console.error('Offline map download failed:', e);
        alert('다운로드 중 오류가 발생했습니다.');
    } finally {
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (!overlay.classList.contains('visible')) overlay.style.display = 'none';
            }, 200);
        }
        if (btn) btn.disabled = false;
    }
}

export async function deleteOfflineMapPackage(packageId, event = null) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const packages = loadOfflineMapPackages();
    const target = packages.find(item => item.id === packageId);
    if (!target) return;
    if (!await showAppConfirm(`'${target.name}' 오프라인 지도를 삭제할까요?`, { title: '오프라인 지도 삭제' })) return;

    try {
        await caches.delete(target.cacheName || getOfflinePackageCacheName(packageId));
        saveOfflineMapPackages(packages.filter(item => item.id !== packageId));
        renderOfflineMapPackageList();
    } catch (error) {
        console.error('오프라인 지도 삭제 실패:', error);
        alert('오프라인 지도 삭제 중 오류가 발생했습니다.');
    }
}

export function moveToOfflineMapPackage(packageId, event = null) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const target = loadOfflineMapPackages().find(item => item.id === packageId);
    const lat = Number(target?.center?.lat);
    const lng = Number(target?.center?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        alert('저장된 지도 위치 정보가 없습니다.');
        return;
    }

    map.setView([lat, lng], Math.max(15, Math.min(18, map.getZoom() || 15)));
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', updateOfflineButton);
    window.addEventListener('offline', updateOfflineButton);
}
