/* ==========================================================================
   [모듈] 기록 생성 플로팅 버튼 (ui-record-fab.js)
   [역할]
   - 점/선/면/사진/트랙 기록을 시작하는 플로팅 버튼 묶음을 열고 닫습니다.
   - 기록 모드 버튼의 선택 상태와 활성 표시를 관리합니다.
   [참고]
   - 하단 기록 버튼이나 기록 모드 버튼 표시가 이상할 때 확인합니다.
   ========================================================================== */
/**
 * [함수] resetButtonStyles
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function resetButtonStyles() {
    document.querySelectorAll('.bottom-btn').forEach(btn => btn.classList.remove('active-btn'));
    resetRecordFabMain();
}

/**
 * [함수] highlightButton
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function highlightButton(btnId) {
    resetButtonStyles();
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.classList.add('active-btn');
        setRecordFabMainIcon(btn);
    }
}

export function toggleRecordFab() {
    const fab = document.getElementById('record-fab');
    if (!fab) return;

    const mainBtn = document.getElementById('record-fab-main');
    if (mainBtn?.classList.contains('is-recording')) {
        closeRecordFab();
        return;
    }

    const isExpanded = fab.classList.toggle('expanded');
    if (mainBtn) {
        mainBtn.setAttribute('aria-label', isExpanded ? '기록 도구 닫기' : '기록 도구 열기');
    }
}

export function closeRecordFab() {
    const fab = document.getElementById('record-fab');
    if (!fab) return;

    fab.classList.remove('expanded');
    const mainBtn = document.getElementById('record-fab-main');
    if (mainBtn) mainBtn.setAttribute('aria-label', '기록 도구 열기');
}

function resetRecordFabMain() {
    closeRecordFab();
    const mainBtn = document.getElementById('record-fab-main');
    const activeIcon = document.getElementById('record-fab-active-icon');
    if (mainBtn) mainBtn.classList.remove('is-recording');
    if (activeIcon) activeIcon.innerHTML = '';
}

function setRecordFabMainIcon(sourceBtn) {
    closeRecordFab();
    const mainBtn = document.getElementById('record-fab-main');
    const activeIcon = document.getElementById('record-fab-active-icon');
    const icon = sourceBtn?.querySelector('.icon-box');
    if (!mainBtn || !activeIcon || !icon) return;

    activeIcon.innerHTML = icon.innerHTML;
    mainBtn.classList.add('is-recording');
}

