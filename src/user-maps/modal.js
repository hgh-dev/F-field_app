/* ==========================================================================
   [모듈] 사용자지도 추가/편집 모달 (user-maps/modal.js)
   [역할]
   - 사용자지도 이름, 유형, URL, 파일, 좌표계, 줌 범위 입력 화면을 만듭니다.
   - 새 사용자지도 추가와 기존 사용자지도 수정에 공통으로 쓰이는 모달입니다.
   [참고]
   - 사용자지도 등록 폼이나 입력값 검증을 바꿀 때 확인합니다.
   ========================================================================== */
import { DEFAULT_MAX_ZOOM } from './constants.js';
import { escapeHtml, inferUserMapType, isTileUserMapType, normalizeUrl, parseWmsUrl } from './utils.js';
import { SHP_CRS_OPTIONS } from '../shp-crs.js';

let activeUserMapModal = null;
let activeUserMapModalSessionId = 0;

function createZoomSelectOptions(selectedValue) {
    const selected = Number(selectedValue);
    return Array.from({ length: 18 }, (_, index) => index + 5)
        .map(value => `<option value="${value}" ${selected === value ? 'selected' : ''}>${value}</option>`)
        .join('');
}


function createShpCrsSelectOptions(selectedValue = 'auto') {
    return SHP_CRS_OPTIONS.map(option => `
        <option value="${escapeHtml(option.value)}"${option.value === selectedValue ? ' selected' : ''}>${escapeHtml(option.label)}</option>
    `).join('');
}

function createShpSimplifySelectOptions(selectedValue = 'off') {
    const options = [
        { value: 'off', label: '꺼짐' },
        { value: 'low', label: '약하게' },
        { value: 'medium', label: '중간' },
        { value: 'high', label: '강하게' }
    ];
    return options.map(option => `
        <option value="${escapeHtml(option.value)}"${option.value === selectedValue ? ' selected' : ''}>${escapeHtml(option.label)}</option>
    `).join('');
}

function getRepresentativeFieldSummary(geojson) {
    const fields = new Set();
    (geojson?.features || []).forEach(feature => {
        Object.keys(feature?.properties || {}).forEach(field => {
            if (field !== '__bbox') fields.add(field);
        });
    });
    return [...fields].map(field => {
        const values = new Map();
        (geojson?.features || []).forEach(feature => {
            const rawValue = feature?.properties?.[field];
            const value = rawValue === null || rawValue === undefined || rawValue === '' ? '__EMPTY__' : String(rawValue);
            values.set(value, (values.get(value) || 0) + 1);
        });
        return {
            field,
            values: [...values.entries()]
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
                .map(([value, count]) => ({ value, count }))
        };
    }).sort((a, b) => a.field.localeCompare(b.field, 'ko'));
}

function getRepresentativeValueLabel(value) {
    return value === '__EMPTY__' ? '(값 없음)' : value;
}

function closeRepresentativeFieldModal() {
    const overlay = document.getElementById('user-map-representative-field-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 160);
}

function ensureUserMapModal() {
    let overlay = document.getElementById('user-map-modal-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'user-map-modal-overlay';
    overlay.className = 'nav-modal-overlay';
    overlay.style.zIndex = '10020';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.innerHTML = `
        <div onclick="event.stopPropagation()" style="width:min(420px, calc(100vw - 32px)); max-height:calc(100vh - 48px); overflow:auto; background:#fff; border-radius:12px; padding:18px; box-sizing:border-box; -webkit-user-select:text; user-select:text; -webkit-touch-callout:default;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px;">
                <div id="user-map-modal-title" style="font-size:17px; font-weight:800; color:#111827;">사용자 지도 불러오기</div>
                <button type="button" id="user-map-modal-close" style="width:34px; height:34px; border:0; background:#f3f4f6; border-radius:50%; color:#6b7280; font-size:20px; line-height:1;">&times;</button>
            </div>
            <form id="user-map-form">
                <label style="display:block; margin-bottom:12px;">
                    <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">사용자 지도 이름</span>
                    <input id="user-map-name-input" type="text" autocomplete="off" style="width:100%; min-height:44px; border:1px solid #d1d5db; border-radius:8px; padding:0 12px; font-size:15px; box-sizing:border-box; -webkit-user-select:text; user-select:text; -webkit-touch-callout:default;">
                </label>
                <label style="display:block; margin-bottom:12px;">
                    <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">지도 형식</span>
                    <select id="user-map-type-input" style="width:100%; min-height:44px; border:1px solid #d1d5db; border-radius:8px; padding:0 12px; font-size:15px; background:#fff; box-sizing:border-box;">
                        <option value="shp">Shp파일</option>
                        <option value="xyz">XYZ Tiles</option>
                        <option value="wms">WMS/WMTS</option>
                        <option value="pmtiles">PMTiles</option>
                        <option value="mbtiles">MBTiles</option>
                    </select>
                </label>
                <label style="display:block; margin-bottom:12px;">
                    <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">지도 주소</span>
                    <textarea id="user-map-url-input" rows="3" style="width:100%; border:1px solid #d1d5db; border-radius:8px; padding:10px 12px; font-size:14px; line-height:1.45; resize:vertical; box-sizing:border-box; -webkit-user-select:text; user-select:text; -webkit-touch-callout:default;"></textarea>
                    <span id="user-map-url-help" style="display:block; margin-top:6px; font-size:11px; line-height:1.45; color:#6b7280;"></span>
                </label>
                <label id="user-map-file-row" style="display:none; margin-bottom:12px;">
                    <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">SHP 파일</span>
                    <input id="user-map-file-input" type="file" accept=".zip" style="width:100%; min-height:44px; border:1px solid #d1d5db; border-radius:8px; padding:9px 10px; font-size:14px; box-sizing:border-box; background:#fff;">
                    <span style="display:block; margin-top:6px; font-size:11px; line-height:1.45; color:#6b7280;">shp, .shx, .dbf, .prj 파일을 함께 압축한 .zip 파일을 선택하세요. <br> 그 외의 파일이 포함되면 불러오기가 실패할 수 있습니다. <br> 도형이 너무 많은 파일을 불러오면 오류가 발생할 수 있습니다.</span>
                </label>
                <label id="user-map-shp-crs-row" style="display:none; margin-bottom:12px;">
                    <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">좌표계 설정</span>
                    <select id="user-map-shp-crs-input" style="width:100%; min-height:44px; border:1px solid #d1d5db; border-radius:8px; padding:0 12px; font-size:15px; background:#fff; box-sizing:border-box;">
                        ${createShpCrsSelectOptions()}
                    </select>
                    <span style="display:block; margin-top:6px; font-size:11px; line-height:1.45; color:#6b7280;">자동 선택은 ZIP 안의 .prj 파일을 기준으로 좌표계를 변환합니다. .prj가 없거나 위치가 맞지 않으면 원본 SHP의 좌표계를 직접 선택하세요.</span>
                </label>
                <div id="user-map-representative-field-row" style="display:none; margin-bottom:12px;">
                    <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">대표 필드</span>
                    <input id="user-map-representative-field-input" type="hidden" value="">
                    <button id="user-map-representative-field-btn" type="button"
                        style="width:100%; min-height:44px; border:1px solid #d1d5db; border-radius:8px; padding:0 12px; font-size:15px; background:#fff; box-sizing:border-box; display:flex; align-items:center; justify-content:space-between; gap:10px; text-align:left; color:#111827;">
                        <span id="user-map-representative-field-label" style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">자동 선택</span>
                        <span aria-hidden="true" style="color:#9ca3af; font-size:18px; transform:rotate(90deg);">›</span>
                    </button>
                    <span style="display:block; margin-top:6px; font-size:11px; line-height:1.45; color:#6b7280;">도형을 선택했을 때 사용자지도 바텀시트 제목에 표시할 속성을 선택하세요.</span>
                </div>
                <label id="user-map-wms-layer-row" style="display:none; margin-bottom:12px;">
                    <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">WMS layers</span>
                    <input id="user-map-wms-layers-input" type="text" autocomplete="off" style="width:100%; min-height:44px; border:1px solid #d1d5db; border-radius:8px; padding:0 12px; font-size:15px; box-sizing:border-box; -webkit-user-select:text; user-select:text; -webkit-touch-callout:default;">
                </label>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                    <label>
                        <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">최소 줌</span>
                        <select id="user-map-min-zoom-input" style="width:100%; min-height:44px; border:1px solid #d1d5db; border-radius:8px; padding:0 12px; font-size:15px; background:#fff; box-sizing:border-box;">
                            ${createZoomSelectOptions(12)}
                        </select>
                    </label>
                    <label>
                        <span id="user-map-max-zoom-label" style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">최대 줌</span>
                        <select id="user-map-max-native-zoom-input" style="width:100%; min-height:44px; border:1px solid #d1d5db; border-radius:8px; padding:0 12px; font-size:15px; background:#fff; box-sizing:border-box;">
                            ${createZoomSelectOptions(18)}
                        </select>
                    </label>
                </div>
                <div id="user-map-zoom-help" style="display:block; margin-top:-6px; margin-bottom:12px; font-size:11px; line-height:1.45; color:#6b7280;"></div>
                <label id="user-map-shp-simplify-row" style="display:none; margin-bottom:12px;">
                    <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">도형 단순화</span>
                    <select id="user-map-shp-simplify-input" style="width:100%; min-height:44px; border:1px solid #d1d5db; border-radius:8px; padding:0 12px; font-size:15px; background:#fff; box-sizing:border-box;">
                        ${createShpSimplifySelectOptions()}
                    </select>
                    <span style="display:block; margin-top:6px; font-size:11px; line-height:1.45; color:#6b7280;">축소 시 복잡한 선과 면을 단순화합니다. 지도 렌더링이 느리거나 오류가 발생할 경우 사용하세요.</span>
                </label>
                <div style="display:flex; gap:8px; margin-top:16px;">
                    <button id="user-map-cancel-btn" type="button" style="flex:1; min-height:44px; border:0; border-radius:8px; background:#f3f4f6; color:#4b5563; font-size:14px; font-weight:700;">취소</button>
                    <button id="user-map-save-btn" type="submit" style="flex:1; min-height:44px; border:0; border-radius:8px; background:#2563eb; color:#fff; font-size:14px; font-weight:800;">저장</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}


function closeUserMapModal(value) {
    closeRepresentativeFieldModal();
    if (!activeUserMapModal) return;
    const { overlay, resolve } = activeUserMapModal;
    overlay.classList.remove('visible');
    overlay.style.display = 'none';
    activeUserMapModal = null;
    activeUserMapModalSessionId += 1;
    resolve(value);
}


export function showUserMapModal(existing = null, deps = {}) {
    const overlay = ensureUserMapModal();
    const title = overlay.querySelector('#user-map-modal-title');
    const form = overlay.querySelector('#user-map-form');
    const nameInput = overlay.querySelector('#user-map-name-input');
    const urlInput = overlay.querySelector('#user-map-url-input');
    const typeInput = overlay.querySelector('#user-map-type-input');
    const urlRow = urlInput.closest('label');
    const urlHelp = overlay.querySelector('#user-map-url-help');
    const fileRow = overlay.querySelector('#user-map-file-row');
    const fileInput = overlay.querySelector('#user-map-file-input');
    const shpCrsRow = overlay.querySelector('#user-map-shp-crs-row');
    const shpCrsInput = overlay.querySelector('#user-map-shp-crs-input');
    const representativeFieldRow = overlay.querySelector('#user-map-representative-field-row');
    const representativeFieldInput = overlay.querySelector('#user-map-representative-field-input');
    const representativeFieldButton = overlay.querySelector('#user-map-representative-field-btn');
    const representativeFieldLabel = overlay.querySelector('#user-map-representative-field-label');
    const shpSimplifyRow = overlay.querySelector('#user-map-shp-simplify-row');
    const shpSimplifyInput = overlay.querySelector('#user-map-shp-simplify-input');
    const wmsRow = overlay.querySelector('#user-map-wms-layer-row');
    const wmsLayersInput = overlay.querySelector('#user-map-wms-layers-input');
    const minZoomInput = overlay.querySelector('#user-map-min-zoom-input');
    const maxNativeZoomInput = overlay.querySelector('#user-map-max-native-zoom-input');
    const maxZoomLabel = overlay.querySelector('#user-map-max-zoom-label');
    const zoomHelp = overlay.querySelector('#user-map-zoom-help');
    const cancelBtn = overlay.querySelector('#user-map-cancel-btn');
    const closeBtn = overlay.querySelector('#user-map-modal-close');

    if (activeUserMapModal) closeUserMapModal(null);
    const modalSessionId = ++activeUserMapModalSessionId;

    title.textContent = existing ? '사용자 지도 수정' : '사용자 지도 불러오기';
    nameInput.value = existing?.name || '';
    urlInput.value = existing?.url || '';
    typeInput.value = existing?.type || 'shp';
    fileInput.value = '';
    if (shpCrsInput) {
        shpCrsInput.innerHTML = createShpCrsSelectOptions(existing?.sourceCrs || 'auto');
        shpCrsInput.value = existing?.sourceCrs || 'auto';
    }
    if (representativeFieldInput) {
        representativeFieldInput.value = existing?.representativeField || '';
    }
    if (representativeFieldLabel) representativeFieldLabel.textContent = existing?.representativeField || '자동 선택';
    if (shpSimplifyInput) {
        shpSimplifyInput.innerHTML = createShpSimplifySelectOptions(existing?.simplifyLevel || 'off');
        shpSimplifyInput.value = existing?.simplifyLevel || 'off';
    }
    wmsLayersInput.value = existing?.wms?.layers || '';
    minZoomInput.value = existing?.minZoom ?? 12;
    maxNativeZoomInput.value = existing?.maxNativeZoom ?? (isTileUserMapType(typeInput.value) ? 18 : 22);

    let parsedFileCache = null;
    let propertyFieldLoadToken = 0;
    let representativeFieldSummary = [];

    const setRepresentativeFieldSummary = (summary, selectedValue = representativeFieldInput?.value || '') => {
        if (!representativeFieldInput) return;
        representativeFieldSummary = Array.isArray(summary) ? summary : [];
        const hasSelectedField = representativeFieldSummary.some(entry => entry.field === selectedValue);
        representativeFieldInput.value = hasSelectedField ? selectedValue : '';
        if (representativeFieldLabel) representativeFieldLabel.textContent = hasSelectedField ? selectedValue : '자동 선택';
        if (representativeFieldButton) representativeFieldButton.disabled = representativeFieldSummary.length === 0;
    };

    const loadRepresentativeFieldsFromGeojson = (geojson, selectedValue) => {
        setRepresentativeFieldSummary(getRepresentativeFieldSummary(geojson), selectedValue);
    };

    const openRepresentativeFieldModal = () => {
        if (representativeFieldSummary.length === 0) {
            alert('대표 필드를 선택하려면 SHP 파일을 먼저 선택하세요.');
            return;
        }
        closeRepresentativeFieldModal();
        const selectedField = representativeFieldInput?.value || '';
        const fieldOverlay = document.createElement('div');
        fieldOverlay.id = 'user-map-representative-field-modal-overlay';
        fieldOverlay.className = 'nav-modal-overlay visible';
        fieldOverlay.style.zIndex = '10036';
        fieldOverlay.style.display = 'flex';
        fieldOverlay.style.alignItems = 'center';
        fieldOverlay.style.justifyContent = 'center';

        const createFieldButton = ({ field, values }) => {
            const preview = values.slice(0, 8).map(({ value, count }) => `${escapeHtml(getRepresentativeValueLabel(value))} (${count})`).join(', ');
            const extra = values.length > 8 ? ` 외 ${values.length - 8}개` : '';
            const isSelected = field === selectedField;
            return `
                <button type="button" class="user-map-category-field-btn" data-field="${escapeHtml(field)}"
                    style="width:100%; border:1px solid ${isSelected ? '#2563eb' : '#e5e7eb'}; border-radius:8px; background:${isSelected ? '#eff6ff' : '#fff'}; padding:10px 12px; margin-bottom:8px; text-align:left; cursor:pointer; box-sizing:border-box;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                        <span style="font-size:13px; font-weight:800; color:#111827; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(field)}</span>
                        <span style="font-size:11px; color:#2563eb; flex-shrink:0;">${values.length}개 값</span>
                    </div>
                    <div style="font-size:11px; color:#6b7280; line-height:1.45; margin-top:5px;">${preview}${extra}</div>
                </button>`;
        };

        fieldOverlay.innerHTML = `
            <div onclick="event.stopPropagation()" style="width:min(460px, calc(100vw - 32px)); max-height:calc(100vh - 56px); overflow:auto; background:#fff; border-radius:12px; padding:18px; box-sizing:border-box;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px;">
                    <div>
                        <div style="font-size:17px; font-weight:800; color:#111827;">대표 필드</div>
                        <div style="font-size:12px; color:#6b7280; margin-top:3px; max-width:330px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(nameInput.value.trim() || existing?.name || '사용자 지도')}</div>
                    </div>
                    <button type="button" id="user-map-representative-field-close" style="width:34px; height:34px; border:0; background:#f3f4f6; border-radius:50%; color:#6b7280; font-size:20px; line-height:1;">&times;</button>
                </div>
                <div style="font-size:12px; color:#6b7280; line-height:1.45; margin-bottom:12px;">도형을 선택했을 때 바텀시트 제목으로 사용할 속성을 선택하세요.</div>
                <div id="user-map-representative-field-list">
                    <button type="button" class="user-map-category-field-btn" data-field=""
                        style="width:100%; border:1px solid ${selectedField ? '#e5e7eb' : '#2563eb'}; border-radius:8px; background:${selectedField ? '#fff' : '#eff6ff'}; padding:10px 12px; margin-bottom:8px; text-align:left; cursor:pointer; box-sizing:border-box;">
                        <div style="font-size:13px; font-weight:800; color:#111827;">자동 선택</div>
                        <div style="font-size:11px; color:#6b7280; line-height:1.45; margin-top:5px;">이름, 명칭, 지번 등 적합한 속성을 자동으로 선택합니다.</div>
                    </button>
                    ${representativeFieldSummary.map(createFieldButton).join('')}
                </div>
            </div>`;

        fieldOverlay.onclick = closeRepresentativeFieldModal;
        fieldOverlay.querySelector('#user-map-representative-field-close').onclick = closeRepresentativeFieldModal;
        fieldOverlay.querySelectorAll('.user-map-category-field-btn').forEach(button => {
            button.onclick = () => {
                const fieldName = button.dataset.field || '';
                representativeFieldInput.value = fieldName;
                if (representativeFieldLabel) representativeFieldLabel.textContent = fieldName || '자동 선택';
                closeRepresentativeFieldModal();
            };
        });
        document.body.appendChild(fieldOverlay);
    };

    if (representativeFieldButton) representativeFieldButton.onclick = openRepresentativeFieldModal;

    const parseSelectedShpFile = async () => {
        const file = fileInput.files?.[0];
        if (!file || typeof deps.parseLocalShpFile !== 'function') return null;
        const sourceCrs = shpCrsInput?.value || 'auto';
        const selectedField = representativeFieldInput?.value || existing?.representativeField || '';
        const token = ++propertyFieldLoadToken;
        if (representativeFieldButton) representativeFieldButton.disabled = true;
        if (representativeFieldLabel) representativeFieldLabel.textContent = '속성 필드 확인 중...';
        try {
            const geojson = await deps.parseLocalShpFile(file, sourceCrs);
            if (token !== propertyFieldLoadToken || modalSessionId !== activeUserMapModalSessionId) return null;
            parsedFileCache = { file, sourceCrs, geojson };
            loadRepresentativeFieldsFromGeojson(geojson, selectedField);
            return geojson;
        } catch (error) {
            if (token !== propertyFieldLoadToken || modalSessionId !== activeUserMapModalSessionId) return null;
            parsedFileCache = null;
            setRepresentativeFieldSummary([], '');
            console.error(error);
            alert(`SHP 속성 필드를 읽지 못했습니다.\n${error.message || error}`);
            return null;
        }
    };

    const loadExistingRepresentativeFields = async () => {
        if (!existing?.geojsonKey || typeof deps.getUserMapDataStore !== 'function') {
            setRepresentativeFieldSummary([], existing?.representativeField || '');
            return;
        }
        const token = ++propertyFieldLoadToken;
        if (representativeFieldButton) representativeFieldButton.disabled = true;
        try {
            const geojson = await deps.getUserMapDataStore().getItem(existing.geojsonKey);
            if (token !== propertyFieldLoadToken || modalSessionId !== activeUserMapModalSessionId) return;
            loadRepresentativeFieldsFromGeojson(geojson, existing?.representativeField || '');
        } catch (error) {
            if (token !== propertyFieldLoadToken || modalSessionId !== activeUserMapModalSessionId) return;
            console.error(error);
            setRepresentativeFieldSummary([], existing?.representativeField || '');
        }
    };

    const syncWmsRow = () => {
        const isLocalShp = typeInput.value === 'shp';
        const isTileMap = isTileUserMapType(typeInput.value);
        urlRow.style.display = isLocalShp ? 'none' : 'block';
        fileRow.style.display = isLocalShp ? 'block' : 'none';
        if (shpCrsRow) shpCrsRow.style.display = isLocalShp ? 'block' : 'none';
        if (representativeFieldRow) representativeFieldRow.style.display = isLocalShp ? 'block' : 'none';
        if (shpSimplifyRow) shpSimplifyRow.style.display = isLocalShp ? 'block' : 'none';
        wmsRow.style.display = typeInput.value === 'wms' ? 'block' : 'none';
        if (maxZoomLabel) maxZoomLabel.textContent = isTileMap ? '타일 제공 최대 줌' : '최대 줌';
        if (zoomHelp) {
            zoomHelp.textContent = isTileMap
                ? '타일 지도는 화면 확대는 22까지 가능하고, 선택한 타일 제공 최대 줌 이후에는 마지막 제공 타일을 확대해서 표시합니다. 제공 레벨을 모르면 18을 권장합니다.'
                : 'SHP 지도는 선택한 최소 줌부터 최대 줌까지만 표시됩니다.';
        }
        if (urlHelp) {
            const helpText = {
                xyz: '타일 주소는 {z}, {x}, {y}가 포함된 URL을 입력하세요. 예: https://example.com/{z}/{x}/{y}.png',
                wms: 'WMS 서비스 주소를 입력하세요. layers 값은 주소에 포함되어 있거나 아래 WMS layers 칸에 따로 입력하면 됩니다.',
                pmtiles: '웹에서 직접 접근 가능한 .pmtiles 파일 주소를 입력하세요. 서버가 CORS와 Range 요청을 허용해야 합니다.',
                mbtiles: '웹에서 직접 접근 가능한 .mbtiles 파일 주소를 입력하세요. 파일이 크면 불러오는 데 시간이 걸릴 수 있습니다.'
            };
            urlHelp.textContent = helpText[typeInput.value] || '';
        }
    };

    typeInput.onchange = () => {
        if (!existing) maxNativeZoomInput.value = isTileUserMapType(typeInput.value) ? 18 : 22;
        syncWmsRow();
    };
    fileInput.onchange = () => {
        parsedFileCache = null;
        if (fileInput.files?.[0]) parseSelectedShpFile();
        else loadExistingRepresentativeFields();
    };
    if (shpCrsInput) {
        shpCrsInput.onchange = () => {
            parsedFileCache = null;
            if (fileInput.files?.[0]) parseSelectedShpFile();
        };
    }
    urlInput.onblur = () => {
        if (!existing) typeInput.value = inferUserMapType(urlInput.value);
        if (typeInput.value === 'wms' && !wmsLayersInput.value.trim()) {
            try {
                wmsLayersInput.value = parseWmsUrl(urlInput.value).layers;
            } catch {
                wmsLayersInput.value = '';
            }
        }
        syncWmsRow();
    };

    overlay.onclick = () => closeUserMapModal(null);
    cancelBtn.onclick = () => closeUserMapModal(null);
    closeBtn.onclick = () => closeUserMapModal(null);

    form.onsubmit = async (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        const url = normalizeUrl(urlInput.value);
        const type = typeInput.value;
        const minZoom = Number(minZoomInput.value);
        const maxNativeZoom = Number(maxNativeZoomInput.value);

        if (!name) {
            alert('사용자 지도 이름을 입력하세요.');
            nameInput.focus();
            return;
        }
        if (type !== 'shp' && !url) {
            alert('지도 주소를 입력하세요.');
            urlInput.focus();
            return;
        }
        if (type === 'shp' && !fileInput.files?.[0] && !existing?.geojsonKey) {
            alert('SHP 파일 또는 SHP 세트 ZIP 파일을 선택하세요.');
            fileInput.focus();
            return;
        }
        if (minZoom > maxNativeZoom) {
            if (type === 'shp') {
                alert('최소 줌은 최대 줌보다 클 수 없습니다.');
                minZoomInput.focus();
                return;
            }
        }

        const item = {
            id: existing?.id || `user-map-${Date.now()}`,
            name,
            type,
            url,
            attribution: existing?.attribution || '',
            maxZoom: type === 'shp' ? (existing?.maxZoom || DEFAULT_MAX_ZOOM) : DEFAULT_MAX_ZOOM,
            minZoom,
            maxNativeZoom,
            opacity: Number.isFinite(Number(existing?.opacity)) ? Number(existing.opacity) : 1
        };
        if (existing?.style) item.style = existing.style;
        if (existing?.geometryType) item.geometryType = existing.geometryType;
        if (existing?.dataBounds) item.dataBounds = existing.dataBounds;
        if (existing?.styleMode) item.styleMode = existing.styleMode;
        if (existing?.categoryField) item.categoryField = existing.categoryField;
        if (existing?.categoryValues) item.categoryValues = existing.categoryValues;
        if (existing?.categoryStyles) item.categoryStyles = existing.categoryStyles;
        if (existing?.defaultCategoryStyle) item.defaultCategoryStyle = existing.defaultCategoryStyle;
        if (existing?.categoryVisibleValues) item.categoryVisibleValues = existing.categoryVisibleValues;
        if (existing?.groupId) item.groupId = existing.groupId;

        if (type === 'shp') {
            item.url = '';
            item.sourceName = existing?.sourceName || '';
            item.sourceCrs = shpCrsInput?.value || existing?.sourceCrs || 'auto';
            item.representativeField = representativeFieldInput?.value || '';
            item.simplifyLevel = shpSimplifyInput?.value || existing?.simplifyLevel || 'off';
            item.geojsonKey = existing?.geojsonKey || `${item.id}-geojson`;
            item.featureCount = existing?.featureCount || 0;

            if (fileInput.files?.[0]) {
                try {
                    const file = fileInput.files[0];
                    const geojson = parsedFileCache?.file === file && parsedFileCache.sourceCrs === item.sourceCrs
                        ? parsedFileCache.geojson
                        : await deps.parseLocalShpFile(file, item.sourceCrs);
                    await deps.getUserMapDataStore().setItem(item.geojsonKey, geojson);
                    item.sourceName = file.name;
                    item.featureCount = geojson.features.length;
                    item.geometryType = geojson.geometryType || deps.analyzeGeojsonGeometryType(geojson);
                    item.dataBounds = geojson.__bbox || null;
                    delete item.styleMode;
                    delete item.categoryField;
                    delete item.categoryValues;
                    delete item.categoryStyles;
                    delete item.defaultCategoryStyle;
                    delete item.categoryVisibleValues;
                } catch (error) {
                    console.error(error);
                    alert(`SHP 파일을 불러오지 못했습니다.\n${error.message || error}`);
                    return;
                }
            }
        }

        if (type === 'wms') {
            const parsed = parseWmsUrl(url);
            const layers = wmsLayersInput.value.trim() || parsed.layers;
            if (!layers) {
                alert('WMS layers 값을 입력하세요.');
                wmsLayersInput.focus();
                return;
            }
            item.wms = {
                ...parsed,
                layers
            };
        }

        closeUserMapModal(item);
    };

    syncWmsRow();
    loadExistingRepresentativeFields();
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('visible'), 10);

    return new Promise((resolve) => {
        activeUserMapModal = { overlay, resolve };
        requestAnimationFrame(() => {
            nameInput.focus();
            nameInput.select();
        });
    });
}
