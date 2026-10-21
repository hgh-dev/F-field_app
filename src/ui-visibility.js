import { visibilityIcon } from './ui-icons.js';

// Keep native inputs, IDs, names and change handlers. CSS reflects :checked and
// :indeterminate, including state changed programmatically by map/group actions.
export function enhanceVisibilityControls(root) {
    if (!root) return;
    root.querySelectorAll('.map-layer-row input[type="checkbox"], .map-layer-row input[type="radio"], .user-map-parent-checkbox, .user-map-group-checkbox, .user-map-category-rows input[type="checkbox"]').forEach(input => {
        if (input.parentElement?.classList.contains('layer-visibility')) return;
        const wrapper = document.createElement('span');
        wrapper.className = 'layer-visibility';
        if (!input.hasAttribute('aria-label')) {
            const row = input.closest('.map-layer-row, .survey-item, .survey-group-header');
            const name = row?.querySelector('.map-layer-name, .survey-name, .survey-group-name')?.textContent.trim();
            input.setAttribute('aria-label', `${name || '지도'} 표시`);
        }
        input.before(wrapper);
        wrapper.appendChild(input);
        const visual = document.createElement('span');
        visual.className = 'visibility-artwork';
        visual.setAttribute('aria-hidden', 'true');
        visual.innerHTML = `<span class="eye-on">${visibilityIcon()}</span><span class="eye-off">${visibilityIcon(true)}</span><span class="eye-mixed">${visibilityIcon(false, true)}</span>`;
        wrapper.appendChild(visual);
    });
}
