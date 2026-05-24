/* ==========================================================================
   [모듈] 지도 컨텍스트 메뉴 (ui-context-menu.js)
   [역할]
   - 지도 위 특정 위치에서 열리는 메뉴와 해당 위치 기반 액션을 관리합니다.
   - 좌표 복사, 위치 공유, 기록 생성 같은 빠른 동작을 연결합니다.
   [참고]
   - 지도 길게 누르기/우클릭 메뉴 동작을 바꿀 때 확인합니다.
   ========================================================================== */
import { SVG_ICONS } from './config.js';

let currentContextId = null;
let contextMenuActions = {};

export function configureContextMenuActions(actions = {}) {
    contextMenuActions = actions;
}

/**
 * [함수] initContextMenu
 * [역할] 초기 이벤트와 기본 상태를 설정한다.
 * [원리] 초기 1회 실행 구간에서 기본값과 이벤트 연결을 세팅하고,
 *        중복 등록/중복 실행을 방지하는 가드 조건으로 안정성을 확보한다.
 */
export function initContextMenu() {
    if (document.getElementById('global-context-menu')) return;
    const menu = document.createElement('div');
    menu.id = 'global-context-menu';
    menu.className = 'more-context-menu';
    menu.innerHTML = `
        <div class="more-menu-item" onclick="handleMenuAction('save')">
            ${SVG_ICONS.save} 저장
        </div>
        <div class="more-menu-item" onclick="handleMenuAction('edit')">
            ${SVG_ICONS.edit} 기록명 수정
        </div>
        <div class="more-menu-item" onclick="handleMenuAction('move')">
            ${SVG_ICONS.folder_move}
            프로젝트 이동
        </div>
        <div id="record-menu-add-group" class="more-menu-item" onclick="handleMenuAction('add-group')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4h13v10H7V4zm-3 3h2v8h11v2H4V7zm-3 3h2v8h11v2H1V10z"/>
                <path d="M18 16v-3h-3v-2h3V8h2v3h3v2h-3v3h-2z"/>
            </svg>
            그룹에 추가
        </div>
        <div id="record-menu-remove-group" class="more-menu-item" onclick="handleMenuAction('remove-group')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5h9v7H4V5zm-2 3h1v6h9v1H2V8zm-2 3h1v6h9v1H0v-7z"/>
                <path d="M15 9v-3l7 4.5-7 4.5v-3h-5V9h5z"/>
            </svg>
            그룹에서 제외
        </div>
        <hr style="width:100%; margin:4px 0; border:none; border-top:1px solid #f0f0f0;">
        <div class="more-menu-item" onclick="handleMenuAction('front')">
            <svg viewBox="0 0 24 24">
                <line x1="5" y1="18" x2="19" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <line x1="9" y1="13" x2="9" y2="5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <polyline points="6.8,7.7 9,5.5 11.2,7.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <line x1="15" y1="13" x2="15" y2="5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <polyline points="12.8,7.7 15,5.5 17.2,7.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            맨앞으로
        </div>
        <div class="more-menu-item" onclick="handleMenuAction('forward')">
            <svg viewBox="0 0 24 24">
                <line x1="5" y1="18" x2="19" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <line x1="12" y1="13" x2="12" y2="5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <polyline points="9.8,7.7 12,5.5 14.2,7.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            앞으로
        </div>
        <div class="more-menu-item" onclick="handleMenuAction('backward')">
            <svg viewBox="0 0 24 24">
                <line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <line x1="12" y1="10.5" x2="12" y2="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <polyline points="9.8,15.8 12,18 14.2,15.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            뒤로
        </div>
        <div class="more-menu-item" onclick="handleMenuAction('back')">
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
        <div class="more-menu-item danger" onclick="handleMenuAction('delete')">
            ${SVG_ICONS.trash} 삭제
        </div>
    `;
    document.body.appendChild(menu);
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.btn-more') && !e.target.closest('.more-context-menu')) {
            closeContextMenu();
        }
    }, true);
}

/**
 * [함수] openContextMenu
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openContextMenu(e, id) {
    e.stopPropagation();
    e.preventDefault();
    initContextMenu();
    contextMenuActions.closeAllDropdowns?.();
    const groupMenu = document.getElementById('record-group-context-menu');
    if (groupMenu) {
        groupMenu.classList.remove('visible');
        groupMenu.style.display = 'none';
    }
    currentContextId = id;
    const menu = document.getElementById('global-context-menu');
    menu.classList.remove('visible');
    const isGrouped = contextMenuActions.isLayerInRecordGroup?.(id);
    const addGroupItem = document.getElementById('record-menu-add-group');
    const removeGroupItem = document.getElementById('record-menu-remove-group');
    if (addGroupItem) addGroupItem.style.display = (!isGrouped && contextMenuActions.hasRecordGroups?.()) ? 'flex' : 'none';
    if (removeGroupItem) removeGroupItem.style.display = isGrouped ? 'flex' : 'none';
    const rect = e.currentTarget.getBoundingClientRect();
    let top = rect.bottom + 5;
    let right = window.innerWidth - rect.right;
    const bottomGap = getBottomViewportGap();
    menu.style.display = 'flex';
    menu.style.visibility = 'hidden';
    const menuHeight = menu.offsetHeight || 320;
    top = Math.min(top, window.innerHeight - menuHeight - bottomGap);
    top = Math.max(8, top);
    menu.style.top = top + 'px';
    menu.style.right = right + 'px';
    menu.style.left = 'auto';
    menu.style.visibility = 'visible';
    requestAnimationFrame(() => menu.classList.add('visible'));
}

function getBottomViewportGap() {
    const cssValue = getComputedStyle(document.documentElement).getPropertyValue('--app-bottom-gap-roomy').trim();
    const parsed = parseFloat(cssValue);
    if (Number.isFinite(parsed)) return Math.max(8, parsed);

    const isRoomyFoldableViewport = (
        (window.innerWidth >= 700 && window.innerWidth <= 1100 && window.innerHeight >= window.innerWidth) ||
        (window.innerWidth >= 700 && window.innerWidth > window.innerHeight)
    );
    return isRoomyFoldableViewport ? 42 : 18;
}

/**
 * [함수] closeContextMenu
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeContextMenu() {
    const menu = document.getElementById('global-context-menu');
    if (menu) {
        menu.classList.remove('visible');
        setTimeout(() => {
            if (!menu.classList.contains('visible')) menu.style.display = 'none';
        }, 100);
    }
    currentContextId = null;
}

/**
 * [함수] handleMenuAction
 * [역할] 이벤트 입력을 받아 분기 처리하고 후속 함수를 호출한다.
 * [원리] 이벤트 컨텍스트를 해석해 예외/가드 조건을 먼저 처리하고,
 *        조건에 맞는 작업 함수로 분기해 사용자 의도에 맞는 동작을 실행한다.
 */
export function handleMenuAction(action) {
    const id = currentContextId;
    if (!id) return;
    closeContextMenu();
    setTimeout(() => {
        if (action === 'save') {
            contextMenuActions.exportSingleLayer?.(id);
        } else if (action === 'edit') {
            contextMenuActions.editLayerMemo?.(id);
        } else if (action === 'move') {
            contextMenuActions.openMoveProjectModal?.(id);
        } else if (action === 'add-group') {
            contextMenuActions.openAddRecordToGroupModal?.(id);
        } else if (action === 'remove-group') {
            contextMenuActions.removeRecordFromGroup?.(id);
        } else if (['front', 'forward', 'backward', 'back'].includes(action)) {
            contextMenuActions.moveLayerById?.(id, action);
        } else if (action === 'delete') {
            contextMenuActions.deleteLayerById?.(id);
        }
    }, 50);
}
 
