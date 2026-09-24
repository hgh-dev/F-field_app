/* 좌표 표시 UI */
import { AppState } from './state.js';
import { formatCoordinate } from './utils.js';

export function updateCoordDisplay() {
    const text = formatCoordinate(AppState.lastGpsLat, AppState.lastGpsLng, AppState.coordMode);
    const element = document.getElementById('coord-display');
    if (element) element.innerText = text;
}
