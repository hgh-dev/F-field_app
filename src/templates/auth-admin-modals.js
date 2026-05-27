/* ==========================================================================
   [모듈] 인증/관리자 모달 템플릿 (templates/auth-admin-modals.js)
   [역할]
   - 로그인, 계정, 관리자 메뉴, 인증 코드, 공지 배지 설정 모달 HTML을 body에 주입합니다.
   - 인증/관리자 UI가 참조하는 id와 버튼 구조를 제공합니다.
   [참고]
   - 인증 관련 모달의 HTML 구조나 id를 바꿀 때 확인합니다.
   ========================================================================== */
const AUTH_ADMIN_MODALS_HTML = `    <div id="auth-modal-overlay" class="nav-modal-overlay center-modal-overlay">
        <div class="nav-modal-content center-modal-content compact auth-modal-content delete-account-modal-content"
            onclick="event.stopPropagation()">
            <div class="auth-modal-header">
                <div id="auth-modal-title" class="auth-modal-title">계정 로그인</div>
                <button id="auth-modal-close" class="auth-modal-close" type="button" aria-label="닫기">×</button>
            </div>
            <div class="auth-summary">
                <div id="auth-avatar" class="auth-avatar" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                        <path
                            d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.31 0-10 1.67-10 5v2h20v-2c0-3.33-6.69-5-10-5z" />
                    </svg>
                </div>
                <div class="auth-summary-main">
                    <div id="auth-status-text" class="auth-status-text">비회원</div>
                    <div id="auth-account-email" class="auth-account-email">로그인이 필요합니다.</div>
                </div>
                <div id="auth-tier-badge" class="auth-tier-badge">FREE</div>
            </div>
            <div id="auth-message" class="auth-message hidden"></div>
            <div id="auth-signed-out-section" class="auth-section">
                <div id="auth-hint" class="auth-hint">Google 계정으로 로그인하면 권한 인증과 프리미엄 기능을 사용할 수 있습니다.</div>
                <button id="auth-google-btn" class="auth-google-btn" type="button">
                    <span class="auth-google-mark">G</span>
                    Google로 계속하기
                </button>
                <div class="auth-legal-copy">로그인하면 개인정보처리방침에 동의한 것으로 간주됩니다.</div>
            </div>
            <div id="auth-account-section" class="auth-section hidden">
                <div class="auth-card">
                    <div class="auth-card-title">권한 활성화</div>
                    <div id="auth-permission-copy" class="auth-card-copy">일반 계정으로 사용 중입니다.</div>
                </div>
                <div class="auth-divider"></div>
                <button id="auth-logout-btn" class="auth-secondary-btn" type="button"
                    style="display:none;">로그아웃</button>
                <button id="auth-delete-account-btn" class="auth-delete-link" type="button"
                    style="display:none;">회원탈퇴</button>
            </div>
        </div>
    </div>

    <div id="account-actions-modal-overlay" class="nav-modal-overlay center-modal-overlay">
        <div class="nav-modal-content center-modal-content compact auth-modal-content account-actions-content"
            onclick="event.stopPropagation()">
            <div class="account-actions-title">계정</div>
            <button id="settings-logout-btn" class="auth-secondary-btn" type="button">로그아웃</button>
            <button id="settings-delete-account-btn" class="auth-delete-link" type="button">회원탈퇴</button>
        </div>
    </div>

    <div id="delete-account-modal-overlay" class="nav-modal-overlay center-modal-overlay">
        <div class="nav-modal-content center-modal-content compact auth-modal-content"
            onclick="event.stopPropagation()">
            <div class="auth-modal-header">
                <div class="auth-modal-title">회원탈퇴</div>
                <button id="delete-account-modal-close" class="auth-modal-close" type="button"
                    aria-label="닫기">×</button>
            </div>
            <div class="delete-account-info-box">
                <div style="font-weight:700; color:#111827; margin-bottom:8px;">계정 삭제 안내</div>
                <div style="margin-bottom:8px;">Google 로그인으로 생성된 F-Field 계정은 앱 안에서 직접 삭제할 수 있습니다. 계정 삭제 시 Supabase Auth
                    계정과 권한 정보가 삭제됩니다.</div>
                <div style="font-weight:600; color:#111827; margin-bottom:6px;">삭제되는 데이터</div>
                <ul style="margin:0 0 8px 18px; padding:0;">
                    <li>Google 로그인으로 생성된 F-Field 계정 정보</li>
                    <li>Supabase에 저장된 사용자 ID, 권한 등급, 권한 부여 출처</li>
                    <li>해당 계정의 로그인 세션</li>
                </ul>
                <div style="font-weight:600; color:#111827; margin-bottom:6px;">기기에 남을 수 있는 데이터</div>
                <div style="margin-bottom:8px;">기기 내부에 저장된 현장 기록, 프로젝트, 사진, 설정값은 계정 삭제만으로 자동 삭제되지 않을 수 있습니다. 앱 내 삭제 기능이나
                    앱 데이터 삭제를 통해 별도로 지워야 합니다.</div>
                <div>앱에서 계정 삭제가 되지 않으면 <a href="mailto:hussell.app@gmail.com">hussell.app@gmail.com</a> 으로 문의하세요.</div>
            </div>
            <ul class="delete-account-list">
                <li>탈퇴하려면 입력창에 '탈퇴'를 입력하세요.</li>
            </ul>
            <input id="delete-account-confirm-input" class="delete-account-confirm-input" type="text" autocomplete="off"
                placeholder="탈퇴">
            <button id="delete-account-confirm-btn" class="auth-danger-btn" type="button" disabled>최종 탈퇴</button>
        </div>
    </div>

    <div id="verification-code-create-modal-overlay" class="nav-modal-overlay center-modal-overlay">
        <div class="nav-modal-content center-modal-content compact auth-modal-content"
            onclick="event.stopPropagation()">
            <div class="auth-modal-header">
                <div class="auth-modal-title">인증코드 생성</div>
                <button id="verification-code-create-modal-close" class="auth-modal-close" type="button"
                    aria-label="닫기">×</button>
            </div>
            <div class="verification-code-form">
                <div class="verification-code-field">
                    <label class="verification-code-label" for="verification-code-max-uses">사용 가능 횟수</label>
                    <input id="verification-code-max-uses" class="verification-code-input" type="number" min="1"
                        max="1000" step="1" value="1" inputmode="numeric">
                </div>
                <div class="verification-code-field">
                    <label class="verification-code-label" for="verification-code-assigned-to">assigned_to</label>
                    <input id="verification-code-assigned-to" class="verification-code-input" type="text"
                        autocomplete="off" placeholder="비워두면 누구나 사용 가능">
                    <div class="verification-code-help">사용자 이메일 또는 UUID를 입력할 수 있습니다.</div>
                </div>
                <div class="verification-code-field">
                    <label class="verification-code-label" for="verification-code-expires-at">권한 만료일</label>
                    <input id="verification-code-expires-at" class="verification-code-input" type="datetime-local">
                    <div class="verification-code-help">이 코드로 인증된 계정의 권한이 끝나는 날짜입니다. 비워두면 만료일이 없습니다.</div>
                </div>
                <div class="verification-code-field">
                    <label class="verification-code-label" for="verification-code-memo">memo</label>
                    <textarea id="verification-code-memo" class="verification-code-textarea"
                        placeholder="관리자 메모"></textarea>
                </div>
                <div id="verification-code-result" class="verification-code-result">
                    <div id="verification-code-result-value" class="verification-code-value"></div>
                    <div id="verification-code-result-meta" class="verification-code-meta"></div>
                </div>
                <button id="verification-code-create-submit-btn" class="auth-google-btn" type="button">생성</button>
            </div>
        </div>
    </div>

    <div id="notice-badge-settings-modal-overlay" class="nav-modal-overlay center-modal-overlay">
        <div class="nav-modal-content center-modal-content compact auth-modal-content"
            onclick="event.stopPropagation()">
            <div class="auth-modal-header">
                <div class="auth-modal-title">공지 뱃지 설정</div>
                <button id="notice-badge-settings-modal-close" class="auth-modal-close" type="button"
                    aria-label="닫기">×</button>
            </div>
            <div class="verification-code-form">
                <div class="verification-code-field">
                    <label class="verification-code-label">뱃지 표시</label>
                    <div class="settings-toggle" aria-label="공지 뱃지 표시">
                        <label>
                            <input type="radio" name="notice-badge-enabled-select" value="false">
                        </label>
                        <label>
                            <input type="radio" name="notice-badge-enabled-select" value="true">
                        </label>
                        <span class="settings-toggle-thumb"></span>
                    </div>
                </div>
                <div class="verification-code-field">
                    <label class="verification-code-label" for="notice-badge-until">표시 종료 날짜/시간</label>
                    <input id="notice-badge-until" class="verification-code-input" type="datetime-local">
                    <div id="notice-badge-current-status" class="verification-code-help"></div>
                </div>
                <button id="notice-badge-save-btn" class="auth-google-btn" type="button">저장</button>
            </div>
        </div>
    </div>

    <div id="api-key-settings-modal-overlay" class="nav-modal-overlay center-modal-overlay">
        <div class="nav-modal-content center-modal-content compact auth-modal-content"
            onclick="event.stopPropagation()">
            <div class="auth-modal-header">
                <div class="auth-modal-title">API키 관리</div>
                <button id="api-key-settings-modal-close" class="auth-modal-close" type="button"
                    aria-label="닫기">×</button>
            </div>
            <div class="verification-code-form">
                <div class="verification-code-field">
                    <label class="verification-code-label" for="api-key-vworld-key">VWorld API 키</label>
                    <input id="api-key-vworld-key" class="verification-code-input" type="text"
                        autocomplete="off" spellcheck="false" placeholder="VWorld API 키">
                </div>
                <div class="verification-code-field">
                    <label class="verification-code-label" for="api-key-vworld-expires-at">만료일</label>
                    <input id="api-key-vworld-expires-at" class="verification-code-input" type="datetime-local">
                    <div id="api-key-current-status" class="verification-code-help"></div>
                </div>
                <button id="api-key-save-btn" class="auth-google-btn" type="button">저장</button>
            </div>
        </div>
    </div>

    <div id="auth-info-modal-overlay" class="nav-modal-overlay center-modal-overlay">
        <div class="nav-modal-content center-modal-content compact auth-modal-content"
            onclick="event.stopPropagation()">
            <div class="auth-modal-header">
                <div class="auth-modal-title">인증정보</div>
                <button id="auth-info-modal-close" class="auth-modal-close" type="button" aria-label="닫기">×</button>
            </div>
            <div id="auth-info-list" class="auth-info-list">
                <div class="auth-info-item">
                    <div class="auth-info-label">인증일</div>
                    <div id="auth-info-verified-at" class="auth-info-value">불러오는 중...</div>
                </div>
                <div class="auth-info-item">
                    <div class="auth-info-label">만료일</div>
                    <div id="auth-info-expires-at" class="auth-info-value">불러오는 중...</div>
                </div>
                <div class="auth-info-item">
                    <div class="auth-info-label">남은 기간</div>
                    <div id="auth-info-remaining" class="auth-info-value">불러오는 중...</div>
                </div>
            </div>
        </div>
    </div>

    <div id="admin-users-modal-overlay" class="nav-modal-overlay center-modal-overlay">
        <div class="nav-modal-content center-modal-content compact auth-modal-content"
            onclick="event.stopPropagation()">
            <div class="auth-modal-header">
                <div class="auth-modal-title">회원 권한 관리</div>
                <button id="admin-users-modal-close" class="auth-modal-close" type="button" aria-label="닫기">×</button>
            </div>
            <div class="admin-users-toolbar">
                <input id="admin-users-search" class="admin-users-search" type="search" placeholder="이메일 검색">
                <button id="admin-users-refresh-btn" class="admin-user-save" type="button">새로고침</button>
            </div>
            <div id="admin-users-tier-tabs" class="admin-users-tier-tabs" role="tablist" aria-label="회원 등급 필터">
                <button class="admin-users-tier-tab active" type="button" data-tier-filter="all">전체</button>
                <button class="admin-users-tier-tab" type="button" data-tier-filter="admin">admin</button>
                <button class="admin-users-tier-tab" type="button" data-tier-filter="verified">verified</button>
                <button class="admin-users-tier-tab" type="button" data-tier-filter="premium">premium</button>
                <button class="admin-users-tier-tab" type="button" data-tier-filter="free">free</button>
            </div>
            <div id="admin-users-tier-count" class="admin-users-tier-count">회원 수 : 0명</div>
            <div id="admin-users-list" class="admin-users-list">
                <div class="verification-code-help">불러오는 중...</div>
            </div>
        </div>
    </div>

    <div id="admin-menu-modal-overlay" class="nav-modal-overlay settings-page-overlay" onclick="closeAdminMenuModal()">
        <div class="nav-modal-content settings-page-content" onclick="event.stopPropagation()">
            <header class="settings-page-header">
                <button class="settings-back-btn" type="button" onclick="closeAdminMenuModal()"
                    aria-label="관리자 메뉴 닫기"></button>
                <div class="settings-page-title">관리자 메뉴</div>
                <div></div>
            </header>
            <div id="admin-api-key-warning" class="admin-api-key-warning"></div>
            <section class="settings-section">
                <div id="settings-admin-users-row" class="settings-row settings-link-row settings-admin-users-row">
                    <div>
                        <div class="settings-label">회원 권한 관리</div>
                        <div class="settings-help">회원 이메일과 권한 등급을 확인하고 변경합니다.</div>
                    </div>
                    <span class="settings-chevron"></span>
                </div>
                <div id="settings-verification-code-create-row"
                    class="settings-row settings-link-row settings-code-create-row">
                    <div>
                        <div class="settings-label">인증코드 생성</div>
                        <div class="settings-help">관리자 계정에서 새 인증코드를 발급합니다.</div>
                    </div>
                    <span class="settings-chevron"></span>
                </div>
                <div id="settings-notice-badge-row" class="settings-row settings-link-row settings-notice-badge-row">
                    <div>
                        <div class="settings-label">공지 뱃지 설정</div>
                        <div class="settings-help">공지사항 버튼에 표시할 파란 뱃지 시간을 설정합니다.</div>
                    </div>
                    <span class="settings-chevron"></span>
                </div>
                <div id="settings-api-key-row" class="settings-row settings-link-row settings-api-key-row">
                    <div>
                        <div class="settings-label">API키 관리</div>
                        <div class="settings-help">VWorld API 키와 만료일을 앱 안에서 관리합니다.</div>
                    </div>
                    <span class="settings-chevron"></span>
                </div>
            </section>
        </div>
    </div>`;

export function injectAuthAdminModals() {
    if (document.getElementById('auth-modal-overlay')) return;
    document.body.insertAdjacentHTML('beforeend', AUTH_ADMIN_MODALS_HTML);
}
