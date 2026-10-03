// 작업 선택은 지도 표시 설정과 분리하며, 저장하거나 다른 프로젝트로 넘기지 않습니다.
import { AppState } from './state.js';

let projectId;
let active = false;
const selectedIds = new Set();

function syncProject() {
    if (projectId === AppState.currentProjectId) return;
    projectId = AppState.currentProjectId;
    active = false;
    selectedIds.clear();
}

export function isRecordSelectionMode() {
    syncProject();
    return active;
}

export function setRecordSelectionMode(value) {
    syncProject();
    active = Boolean(value);
    selectedIds.clear();
}

export function isRecordSelected(layer) {
    return isRecordSelectionMode() && selectedIds.has(String(layer.feature?.properties?.id));
}

export function selectRecord(layer, selected) {
    if (!isRecordSelectionMode()) return;
    const id = String(layer.feature?.properties?.id);
    if (selected) selectedIds.add(id);
    else selectedIds.delete(id);
}

export function pruneRecordSelection(layers) {
    syncProject();
    const ids = new Set(layers.map(layer => String(layer.feature?.properties?.id)));
    for (const id of selectedIds) if (!ids.has(id)) selectedIds.delete(id);
}
