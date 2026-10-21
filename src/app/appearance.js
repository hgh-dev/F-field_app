// Appearance is a device preference, independent of projects and map styles.
const STORAGE_KEY = 'setting_appearance_mode';
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const normalize = value => ['light', 'dark'].includes(value) ? value : 'system';
let mode = 'system';
try { mode = normalize(localStorage.getItem(STORAGE_KEY)); } catch { /* Use the device default. */ }

export function getAppearanceMode() { return mode; }

function applyAppearance() {
    document.documentElement.dataset.theme = mode === 'dark' || (mode === 'system' && systemTheme.matches) ? 'dark' : 'light';
    document.dispatchEvent(new CustomEvent('appearance-changed'));
}

export function setAppearanceMode(value) {
    mode = normalize(value);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* The choice still applies for this session. */ }
    applyAppearance();
}

systemTheme.addEventListener('change', () => {
    if (mode === 'system') applyAppearance();
});
window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    mode = normalize(event.newValue);
    applyAppearance();
});
applyAppearance();
