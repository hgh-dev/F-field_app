/* ==========================================================================
   [모듈] 기록 그룹 UI (ui-record-groups.js)
   [역할]
   - 여러 기록을 그룹으로 묶고, 그룹 이름 변경/삭제/접기/표시 전환을 관리합니다.
   - 기록 목록에서 그룹 단위로 항목을 렌더링하고 메뉴 동작을 처리합니다.
   [참고]
   - 기록 그룹 기능이나 그룹 목록 표시가 이상할 때 확인합니다.
   ========================================================================== */
import { isRecordSelected } from './record-selection.js';
import { L } from './vendor-globals.js';
import { SVG_ICONS } from './config.js';
import { AppState } from './state.js';
import { updateLayerOrder } from './map.js';
import { drawnItems } from './draw.js';
import { saveToStorage } from './data.js';
import { closeAllDropdowns } from './ui-dropdown.js';
import { showAppConfirm, showTextPrompt } from './app-dialog.js';
import { scheduleViewportVectorOptimization } from './ui-viewport.js';

export const RECORD_GROUP_ICON = SVG_ICONS.folder;
export const RECORD_GROUP_TOGGLE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l10-7z"/></svg>';
const MOVE_FRONT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="18" x2="19" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="9" y1="13" x2="9" y2="5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="6.8,7.7 9,5.5 11.2,7.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="15" y1="13" x2="15" y2="5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="12.8,7.7 15,5.5 17.2,7.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MOVE_FORWARD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="18" x2="19" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="12" y1="13" x2="12" y2="5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="9.8,7.7 12,5.5 14.2,7.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MOVE_BACKWARD_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="12" y1="10.5" x2="12" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="9.8,15.8 12,18 14.2,15.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MOVE_BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="9" y1="10.5" x2="9" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="6.8,15.8 9,18 11.2,15.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="15" y1="10.5" x2="15" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="12.8,15.8 15,18 17.2,15.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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

function getRecordLayers() {
    return drawnItems.getLayers().filter(layer => layer.feature?.properties);
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

function setRecordPathDisplay(layer, isVisible) {
    if (layer instanceof L.Marker) return;
    if (layer._path) layer._path.style.display = isVisible ? '' : 'none';
}

function applyRecordLayerVisibility(layer, isHidden) {
    if (!layer?.feature?.properties) return;
    layer.feature.properties.isHidden = isHidden;
    if (isHidden) {
        if (layer instanceof L.Marker) {
            layer.setOpacity(0);
        } else {
            layer.setStyle({ opacity: 0, fillOpacity: 0, stroke: false });
            setRecordPathDisplay(layer, false);
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
        setRecordPathDisplay(layer, true);
    }
    setRecordLayerInteractivity(layer, true);
}

function getLayerDisplayOrder(layer, fallbackIndex = 0) {
    const value = Number(layer.feature?.properties?.displayOrder);
    return Number.isFinite(value) ? value : fallbackIndex;
}

function getDisplayOrderedRecordLayers() {
    return drawnItems.getLayers().sort((a, b) => {
        const indexA = drawnItems.getLayers().indexOf(a);
        const indexB = drawnItems.getLayers().indexOf(b);
        const orderA = getLayerDisplayOrder(a, indexA);
        const orderB = getLayerDisplayOrder(b, indexB);
        if (orderA !== orderB) return orderA - orderB;
        return (a.feature?.properties?.id || 0) - (b.feature?.properties?.id || 0);
    });
}

function reorderRecordLayers(nextLayers) {
    nextLayers.forEach((layer, index) => {
        if (!layer.feature) layer.feature = { type: 'Feature', properties: {} };
        if (!layer.feature.properties) layer.feature.properties = {};
        layer.feature.properties.displayOrder = index;
    });
    nextLayers.forEach(layer => drawnItems.removeLayer(layer));
    nextLayers.forEach(layer => drawnItems.addLayer(layer));
    updateLayerOrder();
    saveToStorage();
    renderSurveyListCallback();
    scheduleViewportVectorOptimization();
}

function getDisplayOrderBlocks() {
    const layers = getDisplayOrderedRecordLayers();
    const groupBlocks = new Map();
    const blocks = [];

    layers.forEach(layer => {
        const groupId = layer.feature?.properties?.groupId;
        if (!groupId) {
            blocks.push({ type: 'record', id: layer.feature?.properties?.id, layers: [layer] });
            return;
        }

        let block = groupBlocks.get(groupId);
        if (!block) {
            block = { type: 'group', id: groupId, layers: [] };
            groupBlocks.set(groupId, block);
            blocks.push(block);
        }
        block.layers.push(layer);
    });

    return blocks;
}

function moveRecordGroupById(groupId, position) {
    const blocks = getDisplayOrderBlocks();
    if (blocks.length < 2) return;

    const currentIndex = blocks.findIndex(block => block.type === 'group' && block.id === groupId);
    if (currentIndex < 0) return;

    let targetIndex = currentIndex;
    if (position === 'front') {
        targetIndex = blocks.length - 1;
    } else if (position === 'forward') {
        targetIndex = Math.min(currentIndex + 1, blocks.length - 1);
    } else if (position === 'back') {
        targetIndex = 0;
    } else if (position === 'backward') {
        targetIndex = Math.max(currentIndex - 1, 0);
    }

    if (targetIndex === currentIndex) return;

    const nextBlocks = [...blocks];
    const [targetBlock] = nextBlocks.splice(currentIndex, 1);
    nextBlocks.splice(targetIndex, 0, targetBlock);
    reorderRecordLayers(nextBlocks.flatMap(block => block.layers));
}

function ensureCreateRecordGroupModal() {
    let overlay = document.getElementById('record-group-create-modal-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'record-group-create-modal-overlay';
    overlay.className = 'nav-modal-overlay center-modal-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
        <div class="nav-modal-content center-modal-content" data-record-group-create-content>
            <div class="nav-modal-header" style="font-size:18px; font-weight:bold; margin-bottom:10px; text-align:center;">그룹 만들기</div>
            <label for="record-group-create-name" style="display:block; font-size:13px; font-weight:700; color:#374151; margin-bottom:6px;">그룹명</label>
            <input id="record-group-create-name" type="text" autocomplete="off"
                style="width:100%; box-sizing:border-box; padding:12px; border:1px solid #d1d5db; border-radius:10px; font-size:15px; margin-bottom:14px;">
            <button id="record-group-create-submit" type="button"
                style="width:100%; padding:14px; background:#3b82f6; border:none; border-radius:12px; font-size:15px; font-weight:bold; color:white; margin-bottom:8px;">그룹 만들기</button>
            <button id="record-group-create-cancel" type="button"
                style="width:100%; padding:14px; background:#f5f5f5; border:none; border-radius:12px; font-size:15px; font-weight:bold; color:#666;">취소</button>
        </div>
    `;

    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeCreateRecordGroupModal();
    });
    overlay.querySelector('[data-record-group-create-content]')?.addEventListener('click', event => {
        event.stopPropagation();
    });
    overlay.querySelector('#record-group-create-cancel')?.addEventListener('click', closeCreateRecordGroupModal);
    overlay.querySelector('#record-group-create-submit')?.addEventListener('click', createRecordGroupFromModal);

    document.body.appendChild(overlay);
    return overlay;
}

export function closeCreateRecordGroupModal() {
    const overlay = document.getElementById('record-group-create-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => {
        if (!overlay.classList.contains('visible')) overlay.style.display = 'none';
    }, 200);
}

function createRecordGroupFromModal() {
    const overlay = document.getElementById('record-group-create-modal-overlay');
    if (!overlay) return;

    const input = overlay.querySelector('#record-group-create-name');
    const trimmedName = input?.value?.trim() || '';
    if (!trimmedName) {
        alert('그룹명을 입력하세요.');
        input?.focus();
        return;
    }

    const group = {
        id: makeRecordGroupId(),
        name: trimmedName,
        collapsed: false,
        createdAt: new Date().toISOString()
    };
    getRecordGroups().push(group);

    closeCreateRecordGroupModal();
    saveToStorage();
    renderSurveyListCallback();
}

export function groupSelectedLayers() {
    closeAllDropdowns();
    const overlay = ensureCreateRecordGroupModal();
    const input = overlay.querySelector('#record-group-create-name');
    if (input) input.value = getDefaultRecordGroupName();
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('visible'));
    requestAnimationFrame(() => {
        input?.focus();
        input?.select();
    });
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
            ${SVG_ICONS.file_group_ungroup}
            그룹 해제
        </div>
        <hr style="width:100%; margin:4px 0; border:none; border-top:1px solid #f0f0f0;">
        <div class="more-menu-item" onclick="handleRecordGroupMenuAction('front')">
            ${MOVE_FRONT_ICON} 맨앞으로
        </div>
        <div class="more-menu-item" onclick="handleRecordGroupMenuAction('forward')">
            ${MOVE_FORWARD_ICON} 앞으로
        </div>
        <div class="more-menu-item" onclick="handleRecordGroupMenuAction('backward')">
            ${MOVE_BACKWARD_ICON} 뒤로
        </div>
        <div class="more-menu-item" onclick="handleRecordGroupMenuAction('back')">
            ${MOVE_BACK_ICON} 맨뒤로
        </div>
        <hr style="width:100%; margin:4px 0; border:none; border-top:1px solid #f0f0f0;">
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
    const menuHeight = menu.offsetHeight || 320;
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
    empty.style.display = 'none';
    const createButton = document.createElement('button');
    createButton.type = 'button';
    createButton.className = 'record-group-select-item';
    createButton.innerHTML = `
        <span class="record-group-select-icon">
            ${SVG_ICONS.file_group_add}
        </span>
        <span class="record-group-select-name">새 그룹 만들기</span>
    `;
    createButton.onclick = () => createGroupAndAddRecord(id);
    list.appendChild(createButton);

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

export function openAddSelectedRecordsToGroupModal() {
    closeAllDropdowns();
    const layers = getRecordLayers().filter(isRecordSelected);
    if (!layers.length) {
        alert('선택된 기록이 없습니다.');
        return;
    }
    const overlay = document.getElementById('record-group-select-modal-overlay');
    const list = document.getElementById('record-group-select-list');
    const empty = document.getElementById('record-group-select-empty');
    if (!overlay || !list || !empty) return;
    const projectId = AppState.currentProjectId;
    const groups = getRecordGroups();
    list.innerHTML = '';
    empty.textContent = '그룹이 없습니다. 선택 모드를 완료한 뒤 그룹을 만들어 주세요.';
    empty.style.display = groups.length ? 'none' : 'block';
    groups.forEach(group => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'record-group-select-item';
        button.innerHTML = `<span class="record-group-select-icon">${RECORD_GROUP_ICON}</span><span class="record-group-select-name">${escapeHtml(group.name || '그룹')}</span>`;
        button.onclick = () => {
            if (AppState.currentProjectId !== projectId || !getRecordGroup(group.id)) {
                closeAddRecordToGroupModal();
                return;
            }
            layers.filter(layer => drawnItems.hasLayer(layer)).forEach(layer => {
                layer.feature.properties.groupId = group.id;
            });
            group.collapsed = false;
            closeAddRecordToGroupModal();
            saveToStorage();
            renderSurveyListCallback();
        };
        list.appendChild(button);
    });
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

async function createGroupAndAddRecord(id) {
    const layer = drawnItems.getLayers().find(item => item.feature?.properties?.id === id);
    if (!layer) return;
    const name = await showTextPrompt('그룹명을 입력하세요:', getDefaultRecordGroupName());
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
    getRecordGroups().push(group);
    layer.feature.properties.groupId = group.id;
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
    } else if (['front', 'forward', 'backward', 'back'].includes(action)) {
        moveRecordGroupById(groupId, action);
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
