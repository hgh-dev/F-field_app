/* ==========================================================================
   [모듈] 앱 공통 대화상자 (app-dialog.js)
   [역할]
   - 브라우저 기본 alert/confirm/prompt 대신 앱 디자인에 맞는 공통 알림창을 제공합니다.
   - 확인창, 입력창, 전역 alert 교체를 한곳에서 관리합니다.
   [참고]
   - 화면에 뜨는 공통 팝업의 동작을 바꾸려면 이 파일을 확인합니다.
   ========================================================================== */
let activeDialog = null;

function ensureDialog() {
    let overlay = document.getElementById('app-dialog-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'app-dialog-overlay';
    overlay.className = 'app-dialog-overlay';
    overlay.innerHTML = `
        <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" onclick="event.stopPropagation()">
            <div id="app-dialog-title" class="app-dialog-title"></div>
            <div id="app-dialog-message" class="app-dialog-message"></div>
            <input id="app-dialog-input" class="app-dialog-input" type="text">
            <div id="app-dialog-actions" class="app-dialog-actions"></div>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

function normalizeMessage(message) {
    return String(message ?? '').replace(/\n/g, '<br>');
}

function closeDialog(result) {
    if (!activeDialog) return;
    const { overlay, resolve, previousFocus } = activeDialog;
    overlay.classList.remove('visible');
    overlay.style.display = 'none';
    activeDialog = null;
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    resolve(result);
}

function openDialog({
    title = '알림',
    message = '',
    type = 'alert',
    defaultValue = '',
    okText = '확인',
    cancelText = '취소',
    inputType = 'text',
    inputMode = '',
    pattern = '',
    maxLength = null,
    autocomplete = 'off'
}) {
    const overlay = ensureDialog();
    const titleEl = overlay.querySelector('#app-dialog-title');
    const messageEl = overlay.querySelector('#app-dialog-message');
    const inputEl = overlay.querySelector('#app-dialog-input');
    const actionsEl = overlay.querySelector('#app-dialog-actions');

    if (activeDialog) closeDialog(type === 'confirm' ? false : null);

    titleEl.textContent = title;
    messageEl.innerHTML = normalizeMessage(message);
    inputEl.style.display = type === 'prompt' ? 'block' : 'none';
    inputEl.type = inputType || 'text';
    inputEl.inputMode = inputMode || '';
    if (pattern) inputEl.setAttribute('pattern', pattern);
    else inputEl.removeAttribute('pattern');
    if (maxLength) inputEl.setAttribute('maxlength', String(maxLength));
    else inputEl.removeAttribute('maxlength');
    inputEl.autocomplete = autocomplete || 'off';
    inputEl.value = defaultValue ?? '';

    actionsEl.innerHTML = '';
    if (type !== 'alert') {
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'app-dialog-btn secondary';
        cancelBtn.textContent = cancelText;
        cancelBtn.onclick = () => closeDialog(type === 'confirm' ? false : null);
        actionsEl.appendChild(cancelBtn);
    }

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'app-dialog-btn primary';
    okBtn.textContent = okText;
    okBtn.onclick = () => closeDialog(type === 'prompt' ? inputEl.value : true);
    actionsEl.appendChild(okBtn);

    overlay.onclick = () => {
        if (type === 'alert') closeDialog(true);
    };

    return new Promise((resolve) => {
        activeDialog = { overlay, resolve, previousFocus: document.activeElement };
        overlay.style.display = 'flex';
        requestAnimationFrame(() => {
            overlay.classList.add('visible');
            if (type === 'prompt') {
                inputEl.focus();
                inputEl.select();
            } else {
                okBtn.focus();
            }
        });

        overlay.onkeydown = (event) => {
            if (event.key === 'Escape') closeDialog(type === 'confirm' ? false : null);
            if (event.key === 'Enter' && type === 'prompt') closeDialog(inputEl.value);
        };
    });
}

export function showAppAlert(message, options = {}) {
    return openDialog({ title: options.title || '알림', message, type: 'alert', okText: options.okText || '확인' });
}

export function showAppConfirm(message, options = {}) {
    return openDialog({
        title: options.title || '확인',
        message,
        type: 'confirm',
        okText: options.okText || '확인',
        cancelText: options.cancelText || '취소'
    });
}

export function showAppPrompt(message, defaultValue = '', options = {}) {
    return openDialog({
        title: options.title || message || '입력',
        message: options.message || '',
        type: 'prompt',
        defaultValue,
        okText: options.okText || '저장',
        cancelText: options.cancelText || '취소',
        inputType: options.inputType || 'text',
        inputMode: options.inputMode || '',
        pattern: options.pattern || '',
        maxLength: options.maxLength || null,
        autocomplete: options.autocomplete || 'off'
    });
}

export function showTextPrompt(message, defaultValue = '', options = {}) {
    return showAppPrompt(message, defaultValue, options);
}

export function installGlobalAppDialogs() {
    if (window.__fFieldDialogsInstalled) return;
    window.__fFieldDialogsInstalled = true;
    window.alert = (message) => {
        showAppAlert(message);
    };
}
