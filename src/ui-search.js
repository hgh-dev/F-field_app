/* ==========================================================================
   [모듈] 검색 UI (ui-search.js)
   [역할]
   - 주소, 국가지점번호, 좌표 검색 화면과 검색 결과 이동 흐름을 관리합니다.
   - 검색 기록 저장/삭제, 외부 지도 검색 모달, 지적 정보 조회를 처리합니다.
   [참고]
   - 검색창, 검색 결과, 좌표 검색, 외부 지도 검색 문제가 생기면 확인합니다.
   ========================================================================== */
import { VWORLD_API_KEY, SEARCH_HISTORY_KEY, SEARCH_SETTING_KEY, SVG_ICONS } from './config.js';
import { AppState } from './state.js';
import { map } from './map.js';
import { showAppConfirm } from './app-dialog.js';
import { currentEditLayerId } from './draw.js';
import { dmsToDecimal, getWgs84FromTm, parseNationalPointNumber } from './utils.js';

// --- 검색 UI 상태 ---
export let isSearchHistoryEnabled = true;
export let searchTarget = { name: "" };
const SEARCH_HISTORY_LIMIT = 20;

/**
 * [함수] initSearchSettings
 * [역할] 초기 이벤트와 기본 상태를 설정한다.
 * [원리] 로컬 스토리지의 SEARCH_SETTING_KEY 값을 읽고,
 *        문자열 true/false를 앱 전역 검색기록 플래그로 변환해 초기 상태를 맞춘다.
 */
export function initSearchSettings() {
    const setting = localStorage.getItem(SEARCH_SETTING_KEY);
    if (setting !== null) { isSearchHistoryEnabled = (setting === 'true'); }
}

/**
 * [함수] setIsSearchHistoryEnabled
 * [역할] 외부 입력값으로 내부 상태를 설정한다.
 * [원리] 외부에서 전달된 값을 내부 상태 변수에 직접 반영해,
 *        후속 UI 로직이 같은 기준 상태를 참조하도록 만든다.
 */
export function setIsSearchHistoryEnabled(val) { isSearchHistoryEnabled = val; }

/**
 * [함수] toggleSearchBox
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleSearchBox() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    const box = document.getElementById('search-container');
    if (box.style.display === 'flex' || box.style.display === 'block') {
        box.style.display = 'none';
        document.getElementById('history-panel').style.display = 'none';
        const resultPanel = document.getElementById('search-result-panel');
        if (resultPanel) resultPanel.style.display = 'none';
    } else {
        box.style.display = 'flex';
        renderCoordSearchInputs();

        const activeTab = document.querySelector('.search-tab-btn.active');
        if (activeTab && activeTab.dataset.tab === 'national') {
            document.getElementById('search-input-national').focus();
        } else if (activeTab && activeTab.dataset.tab === 'coord') {
            const firstInput = document.querySelector('#search-coord-inputs input');
            if (firstInput) firstInput.focus();
        } else {
            document.getElementById('search-input-address').focus();
        }
    }
}

/**
 * [함수] switchSearchTab
 * [역할] 활성 대상(탭/모드)을 바꾸고 연관 UI를 동기화한다.
 * [원리] 선택된 탭/모드 값을 기준으로 active 클래스와 표시 대상을 재설정하고,
 *        필요한 후속 렌더링 함수를 호출해 화면과 상태가 같은 기준을 보게 만든다.
 */
export function switchSearchTab(tabId) {
    document.querySelectorAll('.search-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) btn.classList.add('active');
    });

    document.querySelectorAll('.search-tab-content').forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    const targetContent = document.getElementById('search-content-' + tabId);
    if (targetContent) {
        targetContent.classList.add('active');
        targetContent.style.display = 'flex';
    }

    if (tabId === 'address') {
        const input = document.getElementById('search-input-address');
        if (input) input.focus();
        showHistoryPanel();
    } else if (tabId === 'national') {
        const input = document.getElementById('search-input-national');
        if (input) input.focus();
        document.getElementById('search-result-panel').style.display = 'none';
        showHistoryPanel();
    } else if (tabId === 'coord') {
        renderCoordSearchInputs();
        document.getElementById('history-panel').style.display = 'none';
        document.getElementById('search-result-panel').style.display = 'none';
    }
}

/**
 * [함수] renderCoordSearchInputs
 * [역할] 현재 데이터 상태를 화면 요소로 재구성해 렌더링한다.
 * [원리] 원본 데이터(AppState/레이어 컬렉션)를 정렬·필터링해 표시 순서를 정하고,
 *        DOM 노드 또는 HTML을 재구성해 현재 상태를 화면에 다시 그린다.
 */
export function renderCoordSearchInputs() {
    const container = document.getElementById('search-coord-inputs');
    if (!container) return;
    container.innerHTML = "";
    if (AppState.coordMode === 0) {
        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:5px; margin-bottom:5px;">
                <span style="font-size:13px; font-weight:bold; white-space:nowrap; display:inline-block; width:45px; text-align:center;">위도(N)</span>
                <input type="number" id="coord-lat-d" placeholder="37" style="flex:1;"><span style="font-size:13px; font-weight:bold;">°</span>
                <input type="number" id="coord-lat-m" placeholder="14" style="flex:1;"><span style="font-size:13px; font-weight:bold;">'</span>
                <input type="number" id="coord-lat-s" placeholder="44.80" style="flex:1;"><span style="font-size:13px; font-weight:bold;">"</span>
            </div>
            <div style="display:flex; align-items:center; gap:5px;">
                <span style="font-size:13px; font-weight:bold; white-space:nowrap; display:inline-block; width:45px; text-align:center;">경도(E)</span>
                <input type="number" id="coord-lng-d" placeholder="126" style="flex:1;"><span style="font-size:13px; font-weight:bold;">°</span>
                <input type="number" id="coord-lng-m" placeholder="57" style="flex:1;"><span style="font-size:13px; font-weight:bold;">'</span>
                <input type="number" id="coord-lng-s" placeholder="35.45" style="flex:1;"><span style="font-size:13px; font-weight:bold;">"</span>
            </div>
        `;
    } else if (AppState.coordMode === 1) {
        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:5px; margin-bottom:5px;">
                <span style="font-size:13px; font-weight:bold; white-space:nowrap; display:inline-block; width:45px; text-align:center;">위도(N)</span>
                <input type="number" step="any" id="coord-lat-dec" placeholder="37.245778" style="flex:1;">
            </div>
            <div style="display:flex; align-items:center; gap:5px;">
                <span style="font-size:13px; font-weight:bold; white-space:nowrap; display:inline-block; width:45px; text-align:center;">경도(E)</span>
                <input type="number" step="any" id="coord-lng-dec" placeholder="126.959847" style="flex:1;">
            </div>
        `;
    } else if (AppState.coordMode === 2) {
        container.innerHTML = `
            <div style="display:flex; align-items:center; gap:5px; margin-bottom:5px;">
                <span style="font-size:13px; font-weight:bold; white-space:nowrap; display:inline-block; width:25px; text-align:center;">X</span>
                <input type="number" step="any" id="coord-x-tm" placeholder="196437.47" style="flex:1;">
            </div>
            <div style="display:flex; align-items:center; gap:5px;">
                <span style="font-size:13px; font-weight:bold; white-space:nowrap; display:inline-block; width:25px; text-align:center;">Y</span>
                <input type="number" step="any" id="coord-y-tm" placeholder="516290.12" style="flex:1;">
            </div>
        `;
    }
}

/**
 * [함수] callVworldSearchApi
 * [역할] 외부 API 호출을 래핑해 비동기 결과를 반환한다.
 * [원리] JSONP 콜백 이름을 동적으로 만들고 script 요청을 발행한 뒤,
 *        응답 콜백에서 정제된 결과 배열을 Promise resolve로 반환한다.
 */
export function callVworldSearchApi(query, type) {
    return new Promise(resolve => {
        const callbackName = 'vworld_search_' + type + '_' + Math.floor(Math.random() * 100000);
        window[callbackName] = function (data) {
            delete window[callbackName];
            document.getElementById(callbackName)?.remove();
            if (data.response.status === "OK" && data.response.result && data.response.result.items.length > 0) {
                const items = data.response.result.items.map(item => ({ ...item, searchType: type }));
                resolve(items);
            } else {
                resolve([]);
            }
        };
        const script = document.createElement('script');
        script.id = callbackName;
        script.onerror = () => resolve([]);
        script.src = `https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=50&page=1&query=${encodeURIComponent(query)}&type=${type}&format=json&errorformat=json&key=${VWORLD_API_KEY}&callback=${callbackName}`;
        document.body.appendChild(script);
    });
}

/**
 * [함수] callVworldCoordApi
 * [역할] 외부 API 호출을 래핑해 비동기 결과를 반환한다.
 * [원리] JSONP 콜백 이름을 동적으로 만들고 script 요청을 발행한 뒤,
 *        응답 콜백에서 정제된 결과 배열을 Promise resolve로 반환한다.
 */
export function callVworldCoordApi(query, type) {
    return new Promise(resolve => {
        const callbackName = 'vworld_coord_' + Math.floor(Math.random() * 100000);
        window[callbackName] = function (data) {
            delete window[callbackName];
            document.getElementById(callbackName)?.remove();
            if (data.response.status === "OK" && data.response.result) {
                const coordResult = data.response.result;
                resolve([{
                    point: coordResult.point,
                    title: query,
                    address: {
                        road: (type === 'ROAD' && coordResult.refined) ? coordResult.refined.text : "",
                        parcel: (type === 'PARCEL' && coordResult.refined) ? coordResult.refined.text : ""
                    },
                    searchType: type
                }]);
            } else {
                resolve([]);
            }
        };
        const script = document.createElement('script');
        script.id = callbackName;
        script.onerror = () => resolve([]);
        script.src = `https://api.vworld.kr/req/address?service=address&request=getCoord&version=2.0&crs=epsg:4326&address=${encodeURIComponent(query)}&refine=true&simple=false&format=json&type=${type || 'PARCEL'}&key=${VWORLD_API_KEY}&callback=${callbackName}`;
        document.body.appendChild(script);
    });
}

function getSingleSearchRequest(query) {
    const text = String(query || '').trim();
    const hasNumber = /\d/.test(text);
    const hasRoadName = /(대로|번길|로|길)\s*\d/.test(text) || /\d+\s*(대로|번길|로|길)/.test(text);
    const hasLotNumber = /(^|\s)산\s*\d/.test(text) || /\d+\s*-\s*\d+/.test(text) || /(번지|필지)/.test(text);
    const hasAddressArea = /(특별시|광역시|특별자치시|특별자치도|도|시|군|구|읍|면|동|리)/.test(text);

    if (hasRoadName) {
        return { api: 'address', coordType: 'ROAD' };
    }

    if (hasLotNumber || (hasNumber && hasAddressArea)) {
        return { api: 'address', coordType: 'PARCEL' };
    }

    return { api: 'search', type: 'PLACE' };
}

async function callAddressSearchWithCoordFallback(query, coordType) {
    const addressResults = uniqueSearchItems(await callVworldSearchApi(query, 'ADDRESS'));
    if (addressResults.length > 0) return addressResults;
    return uniqueSearchItems(await callVworldCoordApi(query, coordType));
}

function uniqueSearchItems(items) {
    const seen = new Set();
    const uniqueItems = [];
    for (const item of items) {
        if (!item?.point) continue;
        const x = Number(item.point.x);
        const y = Number(item.point.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const hash = `${x.toFixed(6)},${y.toFixed(6)}`;
        if (!seen.has(hash)) {
            seen.add(hash);
            uniqueItems.push(item);
        }
    }
    return uniqueItems;
}

/**
 * [함수] executeSearch
 * [역할] 사용자 선택에 따라 실제 동작(이동/저장/연결)을 수행한다.
 * [원리] 검색 타입(주소/국가지점번호/좌표)에 따라 입력 파싱 경로를 분기하고,
 *        VWorld 조회 결과를 병합·중복제거·정렬한 뒤 지도 이동과 결과 패널 표시를 제어한다.
 */
export async function executeSearch(typeStr = 'address') {
    if (typeStr === 'national') {
        const query = document.getElementById('search-input-national').value;
        if (!query) return;

        if (isSearchHistoryEnabled) { addToHistory(query); }
        document.getElementById('history-panel').style.display = 'none';

        const coords = parseNationalPointNumber(query);
        if (coords) {
            const result = {
                point: { x: coords[0], y: coords[1] },
                title: "국가지점번호",
                address: { road: query, parcel: "" }
            };
            moveToSearchResult(result);
            closeSearchResult();
        } else {
            alert("잘못된 국가지점번호 형식입니다.");
        }
        return;
    } else if (typeStr === 'coord') {
        let lat, lng;
        if (AppState.coordMode === 0) {
            const latD = document.getElementById('coord-lat-d').value;
            const latM = document.getElementById('coord-lat-m').value;
            const latS = document.getElementById('coord-lat-s').value;
            const lngD = document.getElementById('coord-lng-d').value;
            const lngM = document.getElementById('coord-lng-m').value;
            const lngS = document.getElementById('coord-lng-s').value;
            if (!latD || !lngD) return alert("위도, 경도(도) 값을 입력해주세요.");
            lat = dmsToDecimal(latD, latM || 0, latS || 0, 'N');
            lng = dmsToDecimal(lngD, lngM || 0, lngS || 0, 'E');
        } else if (AppState.coordMode === 1) {
            lat = parseFloat(document.getElementById('coord-lat-dec').value);
            lng = parseFloat(document.getElementById('coord-lng-dec').value);
            if (isNaN(lat) || isNaN(lng)) return alert("위도, 경도 값을 입력해주세요.");
        } else if (AppState.coordMode === 2) {
            const x = parseFloat(document.getElementById('coord-x-tm').value);
            const y = parseFloat(document.getElementById('coord-y-tm').value);
            if (isNaN(x) || isNaN(y)) return alert("X, Y 좌표를 입력해주세요.");
            const wgs = getWgs84FromTm(x, y);
            lat = wgs.lat;
            lng = wgs.lng;
        }

        const result = {
            point: { x: lng, y: lat },
            title: "입력 좌표",
            address: { road: "", parcel: "" }
        };
        moveToSearchResult(result);
        closeSearchResult();
        return;
    }

    const queryEl = document.getElementById('search-input-address');
    let query = queryEl ? queryEl.value : "";

    if (!query) return;

    if (isSearchHistoryEnabled) { addToHistory(query); }
    document.getElementById('history-panel').style.display = 'none';
    if (queryEl) queryEl.value = query;

    try {
        const request = getSingleSearchRequest(query);
        const uniqueItems = request.api === 'address'
            ? await callAddressSearchWithCoordFallback(query, request.coordType)
            : uniqueSearchItems(await callVworldSearchApi(query, request.type));

        if (uniqueItems.length > 0) {
            handleSearchResults(uniqueItems);
        } else {
            alert("검색 결과가 없습니다.\n정확한 주소를 입력해보세요.");
        }
    } catch (e) {
        console.error("검색 중 오류 발생:", e);
        alert("검색 중 오류가 발생했습니다.");
    }
}

/* --------------------------------------------------------------------------
   2. 검색 결과 및 기록 UI (Results & History)
   -------------------------------------------------------------------------- */
/**
 * [함수] handleSearchResults
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 이벤트 컨텍스트를 해석해 예외/가드 조건을 먼저 처리하고,
 *        조건에 맞는 작업 함수로 분기해 사용자 의도에 맞는 동작을 실행한다.
 */
function handleSearchResults(items) {
    if (items.length === 1) {
        moveToSearchResult(items[0]);
    } else {
        renderSearchResultList(items);
        document.getElementById('search-result-panel').style.display = 'block';
    }
}

/* --------------------------------------------------------------------------
   2-1. 검색 결과/기록 화면 생성
   -------------------------------------------------------------------------- */
/**
 * [함수] createSearchTypeBadge
 * [역할] 검색 타입에 맞는 뱃지 요소를 생성한다.
 * [원리] 검색 타입별 라벨과 색상을 매핑한 뒤,
 *        동일한 클래스/인라인 스타일을 가진 span 요소를 반환한다.
 */
function createSearchTypeBadge(searchType) {
    const badgeMap = {
        ADDRESS: { text: '주소', color: '#9c27b0' },
        ROAD: { text: '도로명', color: '#2196f3' },
        PLACE: { text: '장소', color: '#4caf50' },
        PARCEL: { text: '지번', color: '#ff9800' }
    };
    const badgeInfo = badgeMap[searchType];
    if (!badgeInfo) return null;

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = badgeInfo.text;
    badge.style.background = badgeInfo.color;
    badge.style.color = '#fff';
    badge.style.padding = '2px 4px';
    badge.style.borderRadius = '3px';
    badge.style.fontSize = '11px';
    badge.style.marginRight = '4px';
    return badge;
}

/**
 * [함수] createSearchResultItem
 * [역할] 검색 결과 한 줄 항목 DOM을 생성한다.
 * [원리] 제목/주소/검색 타입을 바탕으로 li 구조를 만들고,
 *        클릭 시 기존 검색 결과 이동 흐름을 그대로 연결한다.
 */
function createSearchResultItem(item) {
    const li = document.createElement('li');
    li.className = 'search-result-item';

    const roadAddr = item.address?.road || "";
    const parcelAddr = item.address?.parcel || "";
    const title = item.title || roadAddr || parcelAddr;

    const titleDiv = document.createElement('div');
    titleDiv.className = 'search-result-title';

    const badge = createSearchTypeBadge(item.searchType);
    if (badge) titleDiv.appendChild(badge);
    titleDiv.appendChild(document.createTextNode(title));
    li.appendChild(titleDiv);

    if (roadAddr) {
        const roadDiv = document.createElement('div');
        roadDiv.className = 'search-result-addr';
        roadDiv.innerHTML = `<span class="badge-road">도로명</span> ${roadAddr}`;
        li.appendChild(roadDiv);
    }

    if (parcelAddr) {
        const parcelDiv = document.createElement('div');
        parcelDiv.className = 'search-result-addr';
        parcelDiv.innerHTML = `<span class="badge-parcel">지번</span> ${parcelAddr}`;
        li.appendChild(parcelDiv);
    }

    li.onclick = function () {
        moveToSearchResult(item);
        closeSearchResult();
    };

    return li;
}

/**
 * [함수] createHistoryItem
 * [역할] 검색 기록 한 줄 항목 DOM을 생성한다.
 * [원리] 기록 텍스트와 삭제 버튼을 각각 구성하고,
 *        재검색/삭제 흐름을 기존과 동일하게 이벤트로 연결한다.
 */
function createHistoryItem(item, index) {
    const historyItem = normalizeHistoryItem(item);
    const text = historyItem.text;
    const li = document.createElement('li');
    li.className = 'history-item';

    const spanText = document.createElement('span');
    spanText.className = 'history-text';
    spanText.innerText = text;
    spanText.onclick = () => {
        const activeTab = document.querySelector('.search-tab-btn.active');
        const tabId = activeTab ? activeTab.dataset.tab : 'address';
        const inputEl = document.getElementById(tabId === 'national' ? 'search-input-national' : 'search-input-address');
        if (inputEl) inputEl.value = text;
        if (historyItem.point) {
            moveToSearchResult({
                point: historyItem.point,
                title: historyItem.title || text,
                address: historyItem.address || { road: "", parcel: "" },
                searchType: historyItem.searchType || ''
            });
            return;
        }
        executeSearch(tabId);
    };

    const btnDel = document.createElement('span');
    btnDel.className = 'btn-del-history';
    btnDel.innerHTML = SVG_ICONS.close;
    btnDel.onclick = (e) => {
        e.stopPropagation();
        deleteHistoryItem(index);
    };

    li.appendChild(spanText);
    li.appendChild(btnDel);
    return li;
}

/**
 * [함수] renderSearchResultList
 * [역할] 현재 데이터 상태를 화면 요소로 재구성해 렌더링한다.
 * [원리] 원본 데이터(AppState/레이어 컬렉션)를 정렬·필터링해 표시 순서를 정하고,
 *        DOM 노드 또는 HTML을 재구성해 현재 상태를 화면에 다시 그린다.
 */
export function renderSearchResultList(items) {
    const listEl = document.getElementById('search-result-list');
    if (!listEl) return;
    listEl.innerHTML = "";
    items.forEach(item => {
        listEl.appendChild(createSearchResultItem(item));
    });
}

/**
 * [함수] closeSearchResult
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeSearchResult() {
    const panel = document.getElementById('search-result-panel');
    if (panel) panel.style.display = 'none';
    const input = document.getElementById('search-input-address');
    if (input) input.focus();
}

/**
 * [함수] moveToSearchResult
 * [역할] 대상을 다른 위치/컨텍스트로 이동시킨다.
 * [원리] 대상 좌표 또는 엔티티를 기준으로 이동 목적을 계산하고,
 *        지도 위치 또는 데이터 소속을 실제로 이동한 뒤 연관 UI를 정리한다.
 */
function moveToSearchResult(result) {
    const point = result.point;
    updateCurrentHistoryItem(result);
    window.showInfoPopup(point.y, point.x, { zoom: 16 });
    window.fetchAndHighlightBoundary(point.x, point.y);

    const box = document.getElementById('search-container');
    if (box && (box.style.display === 'flex' || box.style.display === 'block')) {
        box.style.display = 'none';
        const historyPanel = document.getElementById('history-panel');
        if (historyPanel) historyPanel.style.display = 'none';
        const resultPanel = document.getElementById('search-result-panel');
        if (resultPanel) resultPanel.style.display = 'none';
    }
}

/**
 * [함수] getActiveHistoryKey
 * [역할] 현재 조건에 맞는 값을 조회해 반환한다.
 * [원리] 현재 활성 탭/상태를 기준으로 조회 키를 계산하고,
 *        해당 키에 대응하는 값을 읽어 호출자에 반환한다.
 */
function getActiveHistoryKey() {
    const activeTab = document.querySelector('.search-tab-btn.active');
    const tabId = activeTab ? activeTab.dataset.tab : 'address';
    return tabId === 'national' ? SEARCH_HISTORY_KEY + '_national' : SEARCH_HISTORY_KEY;
}

function normalizeHistoryItem(item) {
    if (item && typeof item === 'object') {
        const point = item.point;
        const x = Number(point?.x);
        const y = Number(point?.y);
        return {
            text: String(item.text || item.keyword || item.title || ''),
            title: item.title || item.text || item.keyword || '',
            point: Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null,
            address: item.address || null,
            searchType: item.searchType || '',
            updatedAt: item.updatedAt || null
        };
    }
    return {
        text: String(item || ''),
        title: String(item || ''),
        point: null,
        address: null,
        searchType: '',
        updatedAt: null
    };
}

function normalizeHistoryList(list) {
    if (!Array.isArray(list)) return [];
    return list
        .map(normalizeHistoryItem)
        .filter(item => item.text)
        .slice(0, SEARCH_HISTORY_LIMIT);
}

function getCurrentHistoryKeyword() {
    const activeTab = document.querySelector('.search-tab-btn.active');
    const tabId = activeTab ? activeTab.dataset.tab : 'address';
    const inputEl = document.getElementById(tabId === 'national' ? 'search-input-national' : 'search-input-address');
    return inputEl?.value?.trim() || '';
}

function createHistoryRecord(keyword, result = null) {
    const record = normalizeHistoryItem(keyword);
    const point = result?.point;
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
        record.point = { x, y };
        record.title = result.title || record.text;
        record.address = result.address || null;
        record.searchType = result.searchType || '';
    }
    record.updatedAt = new Date().toISOString();
    return record;
}

/**
 * [함수] getHistory
 * [역할] 현재 조건에 맞는 값을 조회해 반환한다.
 * [원리] 현재 활성 탭/상태를 기준으로 조회 키를 계산하고,
 *        해당 키에 대응하는 값을 읽어 호출자에 반환한다.
 */
export function getHistory() {
    const json = localStorage.getItem(getActiveHistoryKey());
    try {
        return normalizeHistoryList(json ? JSON.parse(json) : []);
    } catch (error) {
        console.warn('검색 기록을 읽지 못했습니다.', error);
        return [];
    }
}

/**
 * [함수] saveHistory
 * [역할] 변경된 내용을 저장소 또는 상태에 기록한다.
 * [원리] 현재 편집 대상과 입력값 유효성을 확인한 뒤,
 *        속성 반영 후 저장소 업데이트와 관련 UI 리렌더를 함께 실행한다.
 */
export function saveHistory(list) { localStorage.setItem(getActiveHistoryKey(), JSON.stringify(normalizeHistoryList(list))); }

/**
 * [함수] addToHistory
 * [역할] 새 항목을 중복 규칙에 맞게 추가한다.
 * [원리] 기존 목록에서 중복 여부를 정리한 뒤 새 항목을 선두에 추가하고,
 *        최대 개수 제한을 적용해 기록 데이터가 과도하게 커지지 않도록 유지한다.
 */
export function addToHistory(keyword) {
    let list = getHistory();
    const text = String(keyword || '').trim();
    if (!text) return;
    list = list.filter(item => normalizeHistoryItem(item).text !== text);
    list.unshift(createHistoryRecord(text));
    if (list.length > SEARCH_HISTORY_LIMIT) list = list.slice(0, SEARCH_HISTORY_LIMIT);
    saveHistory(list);
}

function updateCurrentHistoryItem(result) {
    if (!isSearchHistoryEnabled) return;
    const keyword = getCurrentHistoryKeyword();
    if (!keyword || !result?.point) return;
    let list = getHistory();
    list = list.filter(item => normalizeHistoryItem(item).text !== keyword);
    list.unshift(createHistoryRecord(keyword, result));
    if (list.length > SEARCH_HISTORY_LIMIT) list = list.slice(0, SEARCH_HISTORY_LIMIT);
    saveHistory(list);
}

/**
 * [함수] toggleHistorySave
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleHistorySave(checked) {
    isSearchHistoryEnabled = checked;
    localStorage.setItem(SEARCH_SETTING_KEY, checked);
    const list = document.getElementById('history-list');
    const clearBtn = document.querySelector('.btn-clear-history');
    if (list) list.style.display = checked ? 'block' : 'none';
    if (clearBtn) clearBtn.style.display = checked ? 'inline-block' : 'none';
}

/**
 * [함수] clearHistoryAll
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export async function clearHistoryAll() {
    if (!await showAppConfirm("검색 기록을 모두 삭제하시겠습니까?", { title: '검색 기록 삭제' })) return;
    saveHistory([]);
    renderHistoryList();
}

/**
 * [함수] deleteHistoryItem
 * [역할] 대상을 삭제하고 후속 UI/저장 상태를 정리한다.
 * [원리] 삭제 대상 존재와 사용자 확인을 먼저 검증한 뒤,
 *        컬렉션에서 제거하고 저장·리스트 갱신·선택 상태 정리를 순서대로 수행한다.
 */
export function deleteHistoryItem(index) {
    const list = getHistory();
    list.splice(index, 1);
    saveHistory(list);
    renderHistoryList();
}

/**
 * [함수] showHistoryPanel
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function showHistoryPanel() {
    const chk = document.getElementById('chk-history-save');
    if (chk) chk.checked = isSearchHistoryEnabled;

    const list = document.getElementById('history-list');
    const clearBtn = document.querySelector('.btn-clear-history');
    if (list) list.style.display = isSearchHistoryEnabled ? 'block' : 'none';
    if (clearBtn) clearBtn.style.display = isSearchHistoryEnabled ? 'inline-block' : 'none';

    if (isSearchHistoryEnabled) {
        renderHistoryList();
    }
    document.getElementById('history-panel').style.display = 'block';
}

/**
 * [함수] renderHistoryList
 * [역할] 현재 데이터 상태를 화면 요소로 재구성해 렌더링한다.
 * [원리] 원본 데이터(AppState/레이어 컬렉션)를 정렬·필터링해 표시 순서를 정하고,
 *        DOM 노드 또는 HTML을 재구성해 현재 상태를 화면에 다시 그린다.
 */
export function renderHistoryList() {
    const list = getHistory();
    const ul = document.getElementById('history-list');
    if (!ul) return;
    ul.innerHTML = "";
    if (list.length === 0) {
        ul.innerHTML = '<li style="padding:10px; color:#999; text-align:center;">최근 기록 없음</li>';
        return;
    }
    list.forEach(function (text, index) {
        ul.appendChild(createHistoryItem(text, index));
    });
}

/* --------------------------------------------------------------------------
   3. 외부 지도 검색 모달 (External Map Search)
   -------------------------------------------------------------------------- */
/**
 * [함수] openSearchModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openSearchModal(name) {
    searchTarget = { name: name || "검색" };
    const overlay = document.getElementById('search-modal-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

/**
 * [함수] closeSearchModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeSearchModal() {
    const overlay = document.getElementById('search-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/**
 * [함수] executeMapSearch
 * [역할] 사용자 선택에 따라 실제 동작(이동/저장/연결)을 수행한다.
 * [원리] 사용자 선택값을 실제 실행 경로(URL/이동/저장 작업)로 변환하고,
 *        완료 후 모달 닫기·화면 갱신 등 후속 UI 정리까지 한 흐름으로 처리한다.
 */
export function executeMapSearch(type) {
    const { name } = searchTarget;
    let url = "";
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (type === 'naver') {
        if (isMobile) {
            url = `nmap://search?query=${encodeURIComponent(name)}&appname=F-Field`;
        } else {
            url = `https://map.naver.com/v5/search/${encodeURIComponent(name)}`;
        }
    } else if (type === 'kakao') {
        if (isMobile) {
            url = `kakaomap://search?q=${encodeURIComponent(name)}`;
        } else {
            url = `https://map.kakao.com/link/search/${encodeURIComponent(name)}`;
        }
    } else if (type === 'google') {
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
    }
    window.open(url, '_blank');
    setTimeout(closeSearchModal, 500);
}
