/* ==========================================================================
   [모듈] 설정 선택 모달 (app/settings-choice.js)
   [역할]
   - 좌표 표시 방식, 트랙 기록 간격, 설정 문서 이동 같은 설정 화면의 선택 흐름을 관리합니다.
   - 설정 화면을 닫았다가 문서에서 돌아올 때 다시 여는 상태도 처리합니다.
   [참고]
   - 설정 메뉴 안의 선택지나 설정 버튼 동작을 바꿀 때 확인합니다.
   ========================================================================== */
import { AppState } from '../state.js';

const COORD_MODE_OPTIONS = [
    { value: 0, label: '도분초' },
    { value: 1, label: '소수점' },
    { value: 2, label: 'TM 좌표(EPSG:5186)' }
];

const TRACK_INTERVAL_OPTIONS = [
    { value: 2, label: '2m' },
    { value: 5, label: '5m' },
    { value: 10, label: '10m' },
    { value: 20, label: '20m' }
];

const DISPLAY_ZOOM_OPTIONS = Array.from({ length: 22 }, (_, index) => ({
    value: index + 1,
    label: `${index + 1}레벨`
}));

const RECORD_ZOOM_OPTIONS = DISPLAY_ZOOM_OPTIONS.map(option => ({
    ...option,
    label: option.value === 10 ? `${option.label} (기본값)` : option.label
}));

const LABEL_ZOOM_OPTIONS = [
    { value: 'same', label: '기록과 동일한 범위에서 표시 (기본값)' },
    ...DISPLAY_ZOOM_OPTIONS
];

const REOPEN_SETTINGS_ON_RETURN_KEY = 'f-field-reopen-settings-on-return';
const REOPEN_SETTINGS_MAX_AGE_MS = 10 * 60 * 1000;

function getSettingsOptionLabel(options, value) {
    return options.find(option => String(option.value) === String(value))?.label || options[0].label;
}

export function syncSettingsChoiceValues() {
    const coordValue = document.getElementById('settings-coord-mode-value');
    if (coordValue) coordValue.textContent = getSettingsOptionLabel(COORD_MODE_OPTIONS, AppState.coordMode);

    const trackValue = document.getElementById('settings-track-interval-value');
    if (trackValue) trackValue.textContent = getSettingsOptionLabel(TRACK_INTERVAL_OPTIONS, AppState.trackInterval);

    const recordRangeValue = document.getElementById('settings-record-range-value');
    if (recordRangeValue) recordRangeValue.textContent = getSettingsOptionLabel(RECORD_ZOOM_OPTIONS, AppState.recordMinZoom);

    const labelRangeValue = document.getElementById('settings-label-range-value');
    if (labelRangeValue) {
        labelRangeValue.textContent = AppState.labelMinZoom === 'same'
            ? '기록과 동일 (기본값)'
            : getSettingsOptionLabel(DISPLAY_ZOOM_OPTIONS, AppState.labelMinZoom);
    }

}

function markSettingsReopenOnReturn() {
    try {
        sessionStorage.setItem(REOPEN_SETTINGS_ON_RETURN_KEY, String(Date.now()));
    } catch {
        // sessionStorage를 사용할 수 없는 환경에서는 문서 이동만 수행합니다.
    }
}

function consumeSettingsReopenOnReturn() {
    try {
        const raw = sessionStorage.getItem(REOPEN_SETTINGS_ON_RETURN_KEY);
        if (!raw) return false;
        sessionStorage.removeItem(REOPEN_SETTINGS_ON_RETURN_KEY);
        const savedAt = Number(raw);
        return Number.isFinite(savedAt) && Date.now() - savedAt <= REOPEN_SETTINGS_MAX_AGE_MS;
    } catch {
        return false;
    }
}

export function reopenSettingsAfterDocumentReturn(openSettingsModal) {
    if (!consumeSettingsReopenOnReturn()) return;
    setTimeout(() => {
        openSettingsModal();
    }, 80);
}

function renderSettingsChoiceModal(type) {
    const title = document.getElementById('settings-choice-modal-title');
    const list = document.getElementById('settings-choice-list');
    if (!title || !list) return false;

    const configurations = {
        coord: { title: '좌표 표시 방식', options: COORD_MODE_OPTIONS, value: AppState.coordMode, name: 'coord', setter: 'setCoordMode' },
        track: { title: '트랙 기록 간격', options: TRACK_INTERVAL_OPTIONS, value: AppState.trackInterval, name: 'track', setter: 'setTrackInterval' },
        'record-range': { title: '기록 표시 범위', options: RECORD_ZOOM_OPTIONS, value: AppState.recordMinZoom, name: 'record-range', setter: 'setRecordMinZoom' },
        'label-range': { title: '라벨 표시 범위', options: LABEL_ZOOM_OPTIONS, value: AppState.labelMinZoom, name: 'label-range', setter: 'setLabelMinZoom' }
    };
    const configuration = configurations[type];
    if (!configuration) return false;
    const { options, value: currentValue } = configuration;
    title.textContent = configuration.title;
    list.innerHTML = '';

    options.forEach(option => {
        const label = document.createElement('label');
        label.className = 'settings-choice-option';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `settings-choice-${configuration.name}`;
        input.value = String(option.value);
        input.checked = String(currentValue) === String(option.value);
        input.addEventListener('change', () => {
            window[configuration.setter](option.value);
            window.closeSettingsChoiceModal();
        });

        const text = document.createElement('span');
        text.textContent = option.label;

        label.append(input, text);
        list.append(label);
    });

    return true;
}

export function openSettingsDocument(url) {
    const opened = window.open(url, '_blank');
    if (opened) return;

    markSettingsReopenOnReturn();
    window.location.href = url;
}

export function openSettingsChoiceModal(type) {
    if (!renderSettingsChoiceModal(type)) return;

    const overlay = document.getElementById('settings-choice-modal-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.classList.add('visible');
        const list = document.getElementById('settings-choice-list');
        const selected = list?.querySelector('input:checked')?.closest('.settings-choice-option');
        if (list && selected) list.scrollTop = Math.max(0, selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2);
    }, 10);
}

export function closeSettingsChoiceModal() {
    const overlay = document.getElementById('settings-choice-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 200);
}

export function setCoordMode(mode, updateCoordDisplay) {
    AppState.coordMode = parseInt(mode);
    localStorage.setItem('setting_coord_mode', mode);
    syncSettingsChoiceValues();
    updateCoordDisplay();
}

export function setTrackInterval(value) {
    AppState.trackInterval = parseInt(value);
    localStorage.setItem('setting_track_interval', value);
    syncSettingsChoiceValues();
}

export function setRecordMinZoom(value) {
    const zoom = Number(value);
    if (!Number.isInteger(zoom) || zoom < 1 || zoom > 22) return;
    AppState.recordMinZoom = zoom;
    localStorage.setItem('setting_record_min_zoom', String(zoom));
    syncSettingsChoiceValues();
    document.dispatchEvent(new CustomEvent('record-display-range-changed'));
}

export function setLabelMinZoom(value) {
    const normalized = value === 'same' ? 'same' : Number(value);
    if (normalized !== 'same' && (!Number.isInteger(normalized) || normalized < 1 || normalized > 22)) return;
    AppState.labelMinZoom = normalized;
    localStorage.setItem('setting_label_min_zoom', String(normalized));
    syncSettingsChoiceValues();
    document.dispatchEvent(new CustomEvent('label-display-range-changed'));
}
