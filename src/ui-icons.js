// Shared presentation icons. Record symbols and saved styles remain in config.js.
const icon = content => `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;

export const UI_ICONS = Object.freeze({
    pencil: icon('<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/>'),
    pin: icon('<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'),
    polygon: icon('<path d="m12 3 9 7-3 11H6L3 10Z"/>'),
    route: icon('<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h10a4 4 0 0 1 0 8H7a3 3 0 0 0 0 6h10"/>'),
    memo: icon('<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/><path d="m16 3 5 5-9 9-5 1 1-5Z"/><path d="m14 5 5 5"/>'),
    camera: icon('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z"/><circle cx="12" cy="13" r="4"/>'),
    copy: icon('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
    share: icon('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>'),
    search: icon('<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>'),
    car: icon('<path d="m5 7 2-4h10l2 4 2 3v8H3v-8Z"/><path d="M5 7h14M3 13h18M5 18v3m14-3v3"/><circle cx="7" cy="10" r=".5"/><circle cx="17" cy="10" r=".5"/>'),
    chevron: icon('<path d="m6 9 6 6 6-6"/>')
});

// The same eye artwork is used for records and native map-layer controls.
export function visibilityIcon(hidden = false, mixed = false) {
    const eye = '<path d="M2.1 12a1 1 0 0 1 0-.7C3.8 7.7 7.5 5 12 5s8.2 2.7 9.9 6.3a1 1 0 0 1 0 .7C20.2 16 16.5 19 12 19S3.8 16 2.1 12Z"/>';
    const closed = '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.5 5.3A12 12 0 0 1 12 5c4.5 0 8.2 2.7 9.9 6.3a1 1 0 0 1 0 .7A16 16 0 0 1-3.1 4.1M6 6.3A16 16 0 0 0 2.1 11.3a1 1 0 0 0 0 .7C3.8 16 7.5 19 12 19a12 12 0 0 0 4.2-.8"/>';
    return icon(hidden ? closed : eye + (mixed ? '<path d="M9 12h6"/>' : '<circle cx="12" cy="12" r="3"/>'));
}
