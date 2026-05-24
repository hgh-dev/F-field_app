/* ==========================================================================
   [모듈] 사용자지도 액션 모달 (user-maps/action-modal.js)
   [역할]
   - 사용자지도 항목의 더보기 메뉴를 모달로 표시합니다.
   - 편집, 스타일, 확대, 삭제 같은 사용자지도 단위 버튼을 연결합니다.
   [참고]
   - 사용자지도 목록에서 항목 메뉴 UI가 이상할 때 확인합니다.
   ========================================================================== */
import { escapeHtml, getUserMapLabel } from './utils.js';

export function closeUserMapActionModal() {
    const overlay = document.getElementById('user-map-action-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 160);
}

export function showUserMapActionModal(item, event = null, actions = {}) {
    if (!item) return;
    const id = item.id;

    closeUserMapActionModal();

    const overlay = document.createElement('div');
    overlay.id = 'user-map-action-modal-overlay';
    overlay.className = 'nav-modal-overlay visible';
    overlay.style.display = 'block';
    overlay.style.background = 'transparent';
    overlay.style.zIndex = '10030';
    overlay.innerHTML = `
        <div id="user-map-action-panel" onclick="event.stopPropagation()" style="position:fixed; width:min(220px, calc(100vw - 32px)); background:#fff; border-radius:8px; padding:6px 0; box-sizing:border-box; box-shadow:0 8px 20px rgba(0,0,0,0.15); overflow:hidden;">
            <div style="padding:8px 12px 6px 12px; border-bottom:1px solid #f0f0f0;">
                <div style="font-size:13px; font-weight:800; color:#111827; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.name)}</div>
                <div style="font-size:11px; color:#6b7280; margin-top:2px;">${getUserMapLabel(item)}</div>
            </div>
            <div id="user-map-action-edit" class="more-menu-item">
                <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
                수정
            </div>
            <div id="user-map-action-fit" class="more-menu-item">
                <svg viewBox="0 0 24 24"><path d="M9 3H3v6h2V6.41l4.29 4.3 1.42-1.42L6.41 5H9V3zm6 0v2h2.59l-4.3 4.29 1.42 1.42 4.29-4.3V9h2V3h-6zM5 17.59V15H3v6h6v-2H6.41l4.3-4.29-1.42-1.42L5 17.59zM19 17.59l-4.29-4.3-1.42 1.42 4.3 4.29H15v2h6v-6h-2v2.59z"/></svg>
                레이어로 확대/축소
            </div>
            <hr style="width:100%; margin:4px 0; border:none; border-top:1px solid #f0f0f0;">
            <div id="user-map-action-front" class="more-menu-item">
                <svg viewBox="0 0 24 24">
                    <line x1="5" y1="18" x2="19" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <line x1="9" y1="13" x2="9" y2="5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <polyline points="6.8,7.7 9,5.5 11.2,7.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    <line x1="15" y1="13" x2="15" y2="5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <polyline points="12.8,7.7 15,5.5 17.2,7.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                맨앞으로
            </div>
            <div id="user-map-action-forward" class="more-menu-item">
                <svg viewBox="0 0 24 24">
                    <line x1="5" y1="18" x2="19" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <line x1="12" y1="13" x2="12" y2="5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <polyline points="9.8,7.7 12,5.5 14.2,7.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                앞으로
            </div>
            <div id="user-map-action-backward" class="more-menu-item">
                <svg viewBox="0 0 24 24">
                    <line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <line x1="12" y1="10.5" x2="12" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <polyline points="9.8,15.8 12,18 14.2,15.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                뒤로
            </div>
            <div id="user-map-action-back" class="more-menu-item">
                <svg viewBox="0 0 24 24">
                    <line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <line x1="9" y1="10.5" x2="9" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <polyline points="6.8,15.8 9,18 11.2,15.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    <line x1="15" y1="10.5" x2="15" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                    <polyline points="12.8,15.8 15,18 17.2,15.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                맨뒤로
            </div>
            <hr style="width:100%; margin:4px 0; border:none; border-top:1px solid #f0f0f0;">
            ${item.type === 'shp' ? `
            <div id="user-map-action-category" class="more-menu-item">
                <svg viewBox="0 0 24 24"><path d="M3 5h18v2H3V5zm0 6h12v2H3v-2zm0 6h18v2H3v-2z"/></svg>
                ${item.styleMode === 'categorized' ? '분류 취소' : '속성 분류'}
            </div>
            <hr style="width:100%; margin:4px 0; border:none; border-top:1px solid #f0f0f0;">
            ` : ''}
            <div id="user-map-action-delete" class="more-menu-item danger">
                <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                삭제
            </div>
        </div>
    `;

    overlay.onclick = closeUserMapActionModal;
    document.body.appendChild(overlay);
    positionUserMapActionPanel(overlay.querySelector('#user-map-action-panel'), event);

    overlay.querySelector('#user-map-action-front').onclick = () => { actions.moveLayer?.(id, 'front'); closeUserMapActionModal(); };
    overlay.querySelector('#user-map-action-forward').onclick = () => { actions.moveLayer?.(id, 'forward'); closeUserMapActionModal(); };
    overlay.querySelector('#user-map-action-backward').onclick = () => { actions.moveLayer?.(id, 'backward'); closeUserMapActionModal(); };
    overlay.querySelector('#user-map-action-back').onclick = () => { actions.moveLayer?.(id, 'back'); closeUserMapActionModal(); };
    overlay.querySelector('#user-map-action-edit').onclick = () => { closeUserMapActionModal(); actions.edit?.(id); };
    overlay.querySelector('#user-map-action-fit').onclick = () => { closeUserMapActionModal(); actions.fit?.(id); };
    const categoryAction = overlay.querySelector('#user-map-action-category');
    if (categoryAction) {
        categoryAction.onclick = () => {
            closeUserMapActionModal();
            if (item.styleMode === 'categorized') actions.clearCategorization?.(id);
            else actions.openCategoryModal?.(id);
        };
    }
    overlay.querySelector('#user-map-action-delete').onclick = () => { closeUserMapActionModal(); actions.delete?.(id); };
}

function positionUserMapActionPanel(panel, event) {
    if (!panel) return;

    const margin = 12;
    const source = event?.currentTarget || event?.target;
    const sourceRect = source?.getBoundingClientRect?.();
    const fallbackX = window.innerWidth / 2;
    const fallbackY = window.innerHeight / 2;

    let x = sourceRect ? sourceRect.left + sourceRect.width / 2 : event?.clientX || fallbackX;
    let y = sourceRect ? sourceRect.top : event?.clientY || fallbackY;

    panel.style.left = '0px';
    panel.style.top = '0px';
    const panelRect = panel.getBoundingClientRect();

    let left = x - panelRect.width / 2;
    let top = y - panelRect.height - 6;

    if (top < margin && sourceRect) {
        top = sourceRect.bottom + 6;
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - panelRect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - panelRect.height - margin));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
}
