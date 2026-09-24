/* 기록 설명과 기록명 편집 UI */
import { drawnItems } from './draw.js';
import { saveToStorage } from './data.js';
import { showAppPrompt } from './app-dialog.js';
import { getRecordName, setRecordName } from './utils.js';
import { updateLayerInfo } from './ui-layer-detail.js';
import { renderSurveyList } from './ui-project.js';

export let currentMemoLayerId = null;

export function editLayerDescription(id) {
    const layer = drawnItems.getLayers().find(item => item.feature.properties.id === id);
    if (!layer) return;

    currentMemoLayerId = id;
    document.getElementById('memo-input-textarea').value = layer.feature.properties.description || '';
    const overlay = document.getElementById('memo-modal-overlay');
    const container = document.getElementById('memo-modal-container');
    overlay.style.display = 'flex';
    container.style.display = 'flex';
    setTimeout(() => {
        overlay.classList.add('visible');
        container.classList.add('visible');
        document.getElementById('memo-input-textarea').focus();
    }, 10);
}

export function closeMemoModal() {
    const overlay = document.getElementById('memo-modal-overlay');
    const container = document.getElementById('memo-modal-container');
    overlay.classList.remove('visible');
    container.classList.remove('visible');
    setTimeout(() => {
        overlay.style.display = 'none';
        container.style.display = 'none';
    }, 200);
    currentMemoLayerId = null;
}

export function saveMemoAction() {
    if (currentMemoLayerId === null) return;
    const layer = drawnItems.getLayers().find(item => item.feature.properties.id === currentMemoLayerId);
    if (!layer) {
        closeMemoModal();
        return;
    }

    layer.feature.properties.description = document.getElementById('memo-input-textarea').value;
    updateLayerInfo(layer);
    saveToStorage();
    renderSurveyList();
    layer.fire('click');
    closeMemoModal();
}

export async function editLayerMemo(id) {
    const layer = drawnItems.getLayers().find(item => item.feature.properties.id === id);
    if (!layer) return;

    const existingName = getRecordName(layer.feature.properties, '');
    const input = await showAppPrompt('기록명을 입력하세요:', existingName);
    if (input === null || input.trim() === '') return;

    setRecordName(layer.feature.properties, input.trim());
    updateLayerInfo(layer);
    saveToStorage();
    renderSurveyList();
    layer.fire('click');
}
