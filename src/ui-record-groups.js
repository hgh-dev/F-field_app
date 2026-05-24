/* ==========================================================================
   [모듈] 기록 그룹 UI (ui-record-groups.js)
   [역할]
   - 여러 기록을 그룹으로 묶고, 그룹 이름 변경/삭제/접기/표시 전환을 관리합니다.
   - 기록 목록에서 그룹 단위로 항목을 렌더링하고 메뉴 동작을 처리합니다.
   [참고]
   - 기록 그룹 기능이나 그룹 목록 표시가 이상할 때 확인합니다.
   ========================================================================== */
import { SVG_ICONS } from './config.js';
import { AppState } from './state.js';
import { drawnItems } from './draw.js';
import { saveToStorage } from './data.js';
import { closeAllDropdowns } from './ui-dropdown.js';
import { showAppConfirm, showTextPrompt } from './app-dialog.js';

export const RECORD_GROUP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h13v10H7V4zm-3 3h2v8h11v2H4V7zm-3 3h2v8h11v2H1V10z"/></svg>';
export const RECORD_GROUP_TOGGLE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l10-7z"/></svg>';

let currentRecordGroupMenuId = null;
let renderSurveyListCallback = () => {};

export function configureRecordGroupActions({ renderSurveyList } = {}) {
    renderSurveyListCallback = renderSurveyList || renderSurveyListCallback;
}

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

export function escapeJsString(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

function getCurrentProject() {
    return AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId)) || null;
}

export function getRecordGroups() {
    const project = getCurrentProject();
    if (!project) return [];
    if (!Array.isArray(project.recordGroups)) project.recordGroups = [];
    return project.recordGroups;
}

function getRecordGroup(groupId) {
    return getRecordGroups().find(group => group.id === groupId) || null;
}

function makeRecordGroupId() {
    return `record-group-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function getDefaultRecordGroupName() {
    const groups = getRecordGroups();
    let index = 1;
    while (groups.some(group => group.name === `그룹${index}`)) index++;
    return `그룹${index}`;
}

function getSelectedRecordLayers() {
    return drawnItems.getLayers().filter(layer => layer.feature?.properties && !layer.feature.properties.isHidden);
}

function getLayersForRecordGroup(groupId) {
    return drawnItems.getLayers().filter(layer => layer.feature?.properties?.groupId === groupId);
}

function getRecordLayerFillOpacity(layer) {
    const props = layer.feature?.properties || {};
    if (!(layer instanceof L.Polygon)) return 0;
    if (Number.isFinite(Number(props.customFillOpacity))) {
        return Math.min(1, Math.max(0, parseFloat(props.customFillOpacity)));
    }
    if (props.customFill === false) return 0;
    if (props.customFill === true) return 0.2;
    return AppState.isPolygonFill ? 0.2 : 0;
}

function setRecordLayerInteractivity(layer, isInteractive) {
    if (layer instanceof L.Marker) {
        layer.options.interactive = isInteractive;
        const pointerEvents = isInteractive ? 'auto' : 'none';
        if (layer._icon) layer._icon.style.pointerEvents = pointerEvents;
        if (layer._shadow) layer._shadow.style.pointerEvents = pointerEvents;
        return;
    }
    const pointerEvents = isInteractive ? 'visiblePainted' : 'none';
    if (layer._path) layer._path.style.pointerEvents = pointerEvents;
}

function applyRecordLayerVisibility(layer, isHidden) {
    if (!layer?.feature?.properties) return;
    layer.feature.properties.isHidden = isHidden;
    if (isHidden) {
        if (layer instanceof L.Marker) {
            layer.setOpacity(0);
        } else {
            layer.setStyle({ opacity: 0, fillOpacity: 0, stroke: false });
        }
        layer.closePopup();
        setRecordLayerInteractivity(layer, false);
        return;
    }

    if (layer instanceof L.Marker) {
        layer.setOpacity(1);
    } else {
        layer.setStyle({
            opacity: 1,
            fillOpacity: getRecordLayerFillOpacity(layer),
            stroke: layer.feature.properties.customDashArray !== 'none'
        });
    }
    setRecordLayerInteractivity(layer, true);
}

export async function groupSelectedLayers() {
    closeAllDropdowns();
    const selectedLayers = getSelectedRecordLayers();
    if (selectedLayers.length === 0) {
        alert('선택된 기록이 없습니다.');
        return;
    }

    const groups = getRecordGroups();
    const defaultName = getDefaultRecordGroupName();
    const name = await showTextPrompt('그룹명을 입력하세요:', defaultName);
    if (name === null) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
        alert('그룹명을 입력하세요.');
        return;
    }

    const group = {
        id: makeRecordGroupId(),
        name: trimmedName,
        collapsed: false,
        createdAt: new Date().toISOString()
    };
    groups.push(group);
    selectedLayers.forEach(layer => {
        layer.feature.properties.groupId = group.id;
    });

    saveToStorage();
    renderSurveyListCallback();
}

export function toggleRecordGroup(groupId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    const group = getRecordGroup(groupId);
    if (!group) return;
    group.collapsed = !group.collapsed;
    saveToStorage();
    renderSurveyListCallback();
}

export function toggleRecordGroupVisibility(groupId, isChecked) {
    const layers = getLayersForRecordGroup(groupId);
    layers.forEach(layer => {
        applyRecordLayerVisibility(layer, !isChecked);
    });
    saveToStorage();
    renderSurveyListCallback();
}

function ensureRecordGroupMenu() {
    let menu = document.getElementById('record-group-context-menu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'record-group-context-menu';
    menu.className = 'more-context-menu';
    menu.innerHTML = `
        <div class="more-menu-item" onclick="handleRecordGroupMenuAction('edit')">
            ${SVG_ICONS.edit} 수정
        </div>
        <div class="more-menu-item" onclick="handleRecordGroupMenuAction('ungroup')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5h9v7H4V5zm-2 3h1v6h9v1H2V8zm-2 3h1v6h9v1H0v-7z"/>
                <path d="M15 9v-3l7 4.5-7 4.5v-3h-5V9h5z"/>
            </svg>
            그룹 해제
        </div>
        <div class="more-menu-item danger" onclick="handleRecordGroupMenuAction('delete')">
            ${SVG_ICONS.trash} 삭제
        </div>
    `;
    document.body.appendChild(menu);
    document.addEventListener('click', event => {
        if (!event.target.closest('.btn-more') && !event.target.closest('.more-context-menu')) {
            closeRecordGroupMenu();
        }
    }, true);
    return menu;
}

export function openRecordGroupMenu(event, groupId) {
    event.stopPropagation();
    event.preventDefault();
    closeAllDropdowns();
    const recordMenu = document.getElementById('global-context-menu');
    if (recordMenu) {
        recordMenu.classList.remove('visible');
        recordMenu.style.display = 'none';
    }
    currentRecordGroupMenuId = groupId;
    const menu = ensureRecordGroupMenu();
    menu.classList.remove('visible');
    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.display = 'flex';
    menu.style.visibility = 'hidden';
    const menuHeight = menu.offsetHeight || 140;
    const top = Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - menuHeight - 18));
    menu.style.top = `${top}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.left = 'auto';
    menu.style.visibility = 'visible';
    requestAnimationFrame(() => menu.classList.add('visible'));
}

export function hasRecordGroups() {
    return getRecordGroups().length > 0;
}

export function isLayerInRecordGroup(id) {
    const layer = drawnItems.getLayers().find(item => item.feature?.properties?.id === id);
    return !!layer?.feature?.properties?.groupId;
}

export function openAddRecordToGroupModal(id) {
    const layer = drawnItems.getLayers().find(item => item.feature?.properties?.id === id);
    if (!layer) return;
    const overlay = document.getElementById('record-group-select-modal-overlay');
    const list = document.getElementById('record-group-select-list');
    const empty = document.getElementById('record-group-select-empty');
    if (!overlay || !list || !empty) return;

    const groups = getRecordGroups();
    list.innerHTML = '';
    empty.style.display = groups.length === 0 ? 'block' : 'none';
    groups.forEach(group => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'record-group-select-item';
        button.innerHTML = `
            <span class="record-group-select-icon">${RECORD_GROUP_ICON}</span>
            <span class="record-group-select-name">${escapeHtml(group.name || '그룹')}</span>
        `;
        button.onclick = () => addRecordToGroup(id, group.id);
        list.appendChild(button);
    });

    overlay.dataset.layerId = String(id);
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('visible'));
}

export function closeAddRecordToGroupModal() {
    const overlay = document.getElementById('record-group-select-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => {
        if (!overlay.classList.contains('visible')) overlay.style.display = 'none';
    }, 200);
    delete overlay.dataset.layerId;
}

function addRecordToGroup(id, groupId) {
    const layer = drawnItems.getLayers().find(item => item.feature?.properties?.id === id);
    if (!layer || !getRecordGroup(groupId)) return;
    layer.feature.properties.groupId = groupId;
    closeAddRecordToGroupModal();
    saveToStorage();
    renderSurveyListCallback();
}

export function removeRecordFromGroup(id) {
    const layer = drawnItems.getLayers().find(item => item.feature?.properties?.id === id);
    if (!layer?.feature?.properties?.groupId) return;
    delete layer.feature.properties.groupId;
    saveToStorage();
    renderSurveyListCallback();
}

function closeRecordGroupMenu() {
    const menu = document.getElementById('record-group-context-menu');
    if (!menu) return;
    menu.classList.remove('visible');
    setTimeout(() => {
        if (!menu.classList.contains('visible')) menu.style.display = 'none';
    }, 100);
    currentRecordGroupMenuId = null;
}

export function handleRecordGroupMenuAction(action) {
    const groupId = currentRecordGroupMenuId;
    if (!groupId) return;
    closeRecordGroupMenu();
    if (action === 'edit') {
        editRecordGroup(groupId);
    } else if (action === 'ungroup') {
        ungroupRecordGroup(groupId);
    } else if (action === 'delete') {
        deleteRecordGroup(groupId);
    }
}

async function editRecordGroup(groupId) {
    const group = getRecordGroup(groupId);
    if (!group) return;
    const name = await showTextPrompt('그룹명을 입력하세요:', group.name || '그룹');
    if (name === null) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
        alert('그룹명을 입력하세요.');
        return;
    }
    group.name = trimmedName;
    saveToStorage();
    renderSurveyListCallback();
}

function ungroupRecordGroup(groupId) {
    const groups = getRecordGroups();
    getLayersForRecordGroup(groupId).forEach(layer => {
        if (layer.feature?.properties) delete layer.feature.properties.groupId;
    });
    const index = groups.findIndex(group => group.id === groupId);
    if (index >= 0) groups.splice(index, 1);
    saveToStorage();
    renderSurveyListCallback();
}

async function deleteRecordGroup(groupId) {
    const group = getRecordGroup(groupId);
    if (!group) return;
    const layers = getLayersForRecordGroup(groupId);
    if (!await showAppConfirm(`'${group.name}' 그룹과 그룹 안의 ${layers.length}개 기록을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`, { title: '그룹 삭제' })) return;
    layers.forEach(layer => {
        drawnItems.removeLayer(layer);
        if (layer._popup) layer.closePopup();
    });
    const groups = getRecordGroups();
    const index = groups.findIndex(item => item.id === groupId);
    if (index >= 0) groups.splice(index, 1);
    saveToStorage();
    renderSurveyListCallback();
}
