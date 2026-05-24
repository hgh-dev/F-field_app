/* ==========================================================================
   [모듈] 드롭다운/아코디언 메뉴 (ui-dropdown.js)
   [역할]
   - 프로젝트 메뉴, 더보기 메뉴, 아코디언 같은 작은 펼침 UI를 열고 닫습니다.
   - 다른 메뉴가 열릴 때 기존 메뉴를 닫아 화면 겹침을 줄입니다.
   [참고]
   - 작은 팝업 메뉴가 닫히지 않거나 동시에 여러 개 열릴 때 확인합니다.
   ========================================================================== */
/* --------------------------------------------------------------------------
   5-2. 드롭다운
   -------------------------------------------------------------------------- */
/**
 * [함수] toggleAccordion
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleAccordion(contentId, headerElement) {
    const content = document.getElementById(contentId);
    if (!content) return;
    const isVisible = window.getComputedStyle(content).display === 'block';
    if (isVisible) {
        content.style.display = 'none';
        headerElement.classList.remove('active');
    } else {
        content.style.display = 'block';
        headerElement.classList.add('active');
    }
}

/**
 * [함수] toggleMoreMenu
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleMoreMenu(event) {
    event.stopPropagation();
    closeAllDropdowns();
    const menu = document.getElementById('more-menu');
    if (menu) menu.classList.toggle('visible');
}

/**
 * [함수] toggleProjectMenu
 * [역할] 현재 상태를 기준으로 표시/동작을 반전 전환한다.
 * [원리] 현재 클래스/상태 플래그를 읽어 분기한 뒤 반대 상태로 전환하고,
 *        연관 메뉴·패널의 표시 상태를 함께 동기화해 UI 충돌을 방지한다.
 */
export function toggleProjectMenu(event) {
    event.stopPropagation();
    closeAllDropdowns();
    const menu = document.getElementById('project-menu');
    if (menu) menu.classList.toggle('visible');
}

/**
 * [함수] closeAllDropdowns
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeAllDropdowns() {
    const dropdowns = document.querySelectorAll('.dropdown-menu');
    dropdowns.forEach(menu => {
        if (menu.classList.contains('visible')) {
            menu.classList.remove('visible');
        }
    });
}

