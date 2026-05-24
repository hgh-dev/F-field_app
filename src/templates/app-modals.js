/* ==========================================================================
   [모듈] 일반 앱 모달 템플릿 (templates/app-modals.js)
   [역할]
   - 가져오기 경고, 정렬, 내보내기 형식, 프로젝트 이동, 사진/메모 모달 HTML을 body에 주입합니다.
   - index.html을 가볍게 유지하기 위해 정적인 모달 마크업을 분리한 파일입니다.
   [참고]
   - 일반 기능 모달의 HTML 구조나 id를 바꿀 때 확인합니다.
   ========================================================================== */
const APP_MODALS_HTML = `    <div id="import-warning-modal-overlay" class="nav-modal-overlay center-modal-overlay"
        onclick="closeImportWarningModal()">
        <div class="nav-modal-content center-modal-content compact" onclick="event.stopPropagation()">
            <div class="nav-modal-header"
                style="font-size:18px; font-weight:bold; margin-bottom:15px; text-align:center;">불러오기</div>

            <div
                style="font-size:14px; color:#444; line-height:1.5; margin-bottom:20px; background:#f8f9fa; padding:15px; border-radius:12px;">
                <p style="margin:0 0 10px 0; font-weight:bold;">GeoJSON, SHP, GPX 파일을 불러올 수 있습니다.</p>
                <ul
                    style="margin:0; padding-left:20px; color:#666; font-size:13px; display:flex; flex-direction:column; gap:6px;">
                    <li><b>SHP파일</b>은 .shp, .shx, .dbf, .prj 파일을 <b>.ZIP</b> 파일로 압축한 후 불러올 수 있습니다. 그 외의 다른 파일이 포함되면
                        불러오기가 실패할 수 있습니다.</li>
                    <li>여러 개의 파일을 한 번에 불러올 수 있습니다.</li>
                    <li>프로젝트 파일은 해당 프로젝트명으로 새로운 프로젝트가 추가되고, 단일 기록은 현재 프로젝트에 추가됩니다.</li>
                    <li>도형이 많고 수정이 필요 없는 읽기 전용의 SHP파일은 사용자 지도에서 배경지도로 불러오는 것이 적합합니다.</li>
                </ul>
            </div>

            <div style="display:flex; gap:8px;">
                <button onclick="closeImportWarningModal()"
                    style="flex:1; padding:14px; background:#f5f5f5; border:none; border-radius:12px; font-weight:bold; color:#666;">취소</button>
                <button onclick="proceedWithImport()"
                    style="flex:1; padding:14px; background:#3b82f6; border:none; border-radius:12px; font-weight:bold; color:#fff;">불러오기</button>
            </div>
        </div>
    </div>

    <!-- 기록 정렬 설정 모달 -->
    <div id="sort-modal-overlay" class="nav-modal-overlay sort-modal-overlay" onclick="closeSortModal()">
        <div class="nav-modal-content sort-modal-content" onclick="event.stopPropagation()">
            <div class="sort-modal-title">기록 정렬 방식</div>

            <div class="sort-modal-group">
                <div class="sort-modal-group-title">정렬 기준</div>
                <div class="sort-modal-options">
                    <label class="sort-modal-option">
                        <input type="radio" name="sort-by" value="date"> 기록 시간
                    </label>
                    <label class="sort-modal-option">
                        <input type="radio" name="sort-by" value="name"> 기록명
                    </label>
                </div>
            </div>

            <div class="sort-modal-group">
                <div class="sort-modal-group-title">정렬 순서</div>
                <div class="sort-modal-options">
                    <label class="sort-modal-option">
                        <input type="radio" name="sort-order" value="desc"> 내림차순 (최신순)
                    </label>
                    <label class="sort-modal-option">
                        <input type="radio" name="sort-order" value="asc"> 오름차순 (오래된순)
                    </label>
                </div>
            </div>

            <button onclick="applySortSetting()" class="sort-modal-apply-btn">적용</button>
        </div>
    </div>

    <!-- 프로젝트 정렬 설정 모달 -->
    <div id="project-sort-modal-overlay" class="nav-modal-overlay sort-modal-overlay" onclick="closeProjectSortModal()">
        <div class="nav-modal-content sort-modal-content" onclick="event.stopPropagation()">
            <div class="sort-modal-title">프로젝트 정렬 방식</div>

            <div class="sort-modal-group">
                <div class="sort-modal-group-title">정렬 기준</div>
                <div class="sort-modal-options">
                    <label class="sort-modal-option">
                        <input type="radio" name="project-sort-by" value="date"> 생성 시간
                    </label>
                    <label class="sort-modal-option">
                        <input type="radio" name="project-sort-by" value="name"> 프로젝트명
                    </label>
                </div>
            </div>

            <div class="sort-modal-group">
                <div class="sort-modal-group-title">정렬 순서</div>
                <div class="sort-modal-options">
                    <label class="sort-modal-option">
                        <input type="radio" name="project-sort-order" value="desc"> 내림차순
                        (최신순)
                    </label>
                    <label class="sort-modal-option">
                        <input type="radio" name="project-sort-order" value="asc"> 오름차순
                        (오래된순)
                    </label>
                </div>
            </div>

            <button onclick="applyProjectSortSetting()" class="sort-modal-apply-btn">적용</button>
        </div>
    </div>

    <!-- 단일 기록 저장 파일 형식 선택 모달 -->
    <div id="export-format-modal-overlay" class="nav-modal-overlay center-modal-overlay"
        onclick="closeExportFormatModal()">
        <div class="nav-modal-content center-modal-content compact" onclick="event.stopPropagation()">
            <div class="nav-modal-header"
                style="font-size:18px; font-weight:bold; margin-bottom:20px; text-align:center;">기록 저장 형식</div>
            <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
                <button id="btn-export-geojson" onclick="window._resolveExportFormat('geojson')"
                    style="padding:16px; background:#f8f9fa; border:1.5px solid #ddd; border-radius:12px; font-size:15px; font-weight:bold; color:#333; cursor:pointer; text-align:left;">
                    GeoJSON(권장)<div style="font-size:12px; font-weight:normal; color:#888; margin-top:3px;">웹과 앱에서 가장
                        선호하는 표준 형식으로 QGIS에서 불러올 수 있습니다. 이 앱에서 불러올 때 기록 내에 저장한 메모, 사진, 도형의 스타일 정보가 유지됩니다.</div>
                </button>
                <button id="btn-export-shp" onclick="window._resolveExportFormat('shp')"
                    style="padding:16px; background:#f8f9fa; border:1.5px solid #ddd; border-radius:12px; font-size:15px; font-weight:bold; color:#333; cursor:pointer; text-align:left;">
                    Shapefile (.zip)<div style="font-size:12px; font-weight:normal; color:#888; margin-top:3px;">가장 전통적인
                        GIS 데이터 포맷입니다. .shp, .dbf, .shx, .prj파일이 한 압축파일(.zip)로 저장됩니다. 기록 내에 저장한 메모, 사진, 도형의 스타일 정보가
                        사라집니다.
                    </div>
                </button>
                <button id="btn-export-gpx" onclick="window._resolveExportFormat('gpx')"
                    style="padding:16px; background:#f8f9fa; border:1.5px solid #ddd; border-radius:12px; font-size:15px; font-weight:bold; color:#333; cursor:pointer; text-align:left;">
                    GPX<div style="font-size:12px; font-weight:normal; color:#888; margin-top:3px;">이동 경로와 웨이포인트 저장에 특화된
                        형식으로 GPS단말기, 등산/사이클링 앱 등에 사용됩니다. 면은 선으로 변환됩니다.</div>
                </button>
            </div>
            <button onclick="closeExportFormatModal()"
                style="width:100%; padding:14px; background:#f5f5f5; border:none; border-radius:12px; font-weight:bold; color:#666;">취소</button>
        </div>
    </div>

    <!-- 프로젝트 이동 선택 모달 -->
    <div id="project-move-modal-overlay" class="nav-modal-overlay center-modal-overlay"
        onclick="closeMoveProjectModal()">
        <div class="nav-modal-content center-modal-content tall" onclick="event.stopPropagation()">
            <div class="nav-modal-header"
                style="font-size:18px; font-weight:bold; margin-bottom:10px; text-align:center;">프로젝트 이동</div>
            <p style="text-align:center; color:#666; font-size:13px; margin-bottom:20px;">선택한 기록을 어느 프로젝트로 이동할까요?</p>

            <div id="project-move-list"
                style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px; max-height:200px; overflow-y:auto;">
                <!-- 프로젝트 목록 투입 -->
            </div>

            <button onclick="createNewProjectAndMove()"
                style="width:100%; padding:14px; background:#eff6ff; border:1px dashed #3b82f6; border-radius:12px; font-size:15px; font-weight:bold; color:#3b82f6; margin-bottom:8px;">➕
                새 프로젝트 생성</button>

            <button onclick="closeMoveProjectModal()"
                style="width:100%; padding:14px; background:#f5f5f5; border:none; border-radius:12px; font-size:15px; font-weight:bold; color:#666;">취소</button>
        </div>
    </div>

    <!-- 기록 그룹 선택 모달 -->
    <div id="record-group-select-modal-overlay" class="nav-modal-overlay center-modal-overlay"
        onclick="closeAddRecordToGroupModal()">
        <div class="nav-modal-content center-modal-content compact" onclick="event.stopPropagation()">
            <div class="nav-modal-header"
                style="font-size:18px; font-weight:bold; margin-bottom:10px; text-align:center;">그룹에 추가</div>
            <p id="record-group-select-empty"
                style="display:none; text-align:center; color:#666; font-size:13px; margin:0 0 18px;">추가할 그룹이 없습니다.</p>
            <div id="record-group-select-list"
                style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px; max-height:240px; overflow-y:auto;">
            </div>
            <button onclick="closeAddRecordToGroupModal()"
                style="width:100%; padding:14px; background:#f5f5f5; border:none; border-radius:12px; font-size:15px; font-weight:bold; color:#666;">취소</button>
        </div>
    </div>

    <!-- 파일 입력 (숨김) - multiple: 다중 파일 선택, .zip: Shapefile 지원 -->
    <input type="file" id="geoJsonInput" style="display:none" onchange="handleFileSelect(this)"
        accept=".geojson,.json,.gpx,.zip,application/geo+json,application/json,application/gpx+xml,application/xml,text/xml,application/zip,application/x-zip-compressed,*/*"
        multiple>
    <!-- 사진 확대 보기 모달 (갤러리 뷰어) -->
    <div id="photo-modal" onclick="if(event.target === this) closePhotoModal()">
        <!-- 상단 컨트롤 (다운로드, 닫기) -->
        <div class="photo-modal-controls">
            <button id="photo-modal-download" onclick="downloadCurrentPhoto()">
                <svg viewBox="0 0 24 24">
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
            </button>
            <button id="photo-modal-close" onclick="closePhotoModal()">
                <svg viewBox="0 0 24 24">
                    <path
                        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
            </button>
        </div>

        <div class="photo-modal-content">
            <button id="photo-prev-btn" class="photo-nav-btn" onclick="prevPhoto()">
                <svg viewBox="0 0 24 24">
                    <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
            </button>
            <img id="photo-modal-img" src="" alt="확대된 사진">
            <button id="photo-next-btn" class="photo-nav-btn" onclick="nextPhoto()">
                <svg viewBox="0 0 24 24">
                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                </svg>
            </button>
        </div>

        <div id="photo-counter">1 / 1</div>
    </div>

    <!-- 사진 선택 모달 (중앙 오버레이) -->
    <div id="photo-modal-overlay" class="modal-overlay" onclick="closePhotoSelectMenu()"></div>
    <div id="photo-modal-container" class="modal-container">
        <div class="modal-title">사진 첨부</div>
        <p style="text-align:center; font-size:12px; color:#999; margin: -6px 0 4px;">사진은 최대 5장까지 첨부가 가능합니다.</p>

        <button class="modal-btn primary" onclick="handlePhotoMenuAction('camera')">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
            </svg>
            촬영하기
        </button>

        <button class="modal-btn secondary" onclick="handlePhotoMenuAction('gallery')">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path
                    d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
            갤러리 선택
        </button>

        <button class="modal-btn cancel" onclick="closePhotoSelectMenu()">
            취소
        </button>
    </div>

    <!-- 상세 메모 입력 모달 -->
    <div id="memo-modal-overlay" class="modal-overlay" onclick="closeMemoModal()"></div>
    <div id="memo-modal-container" class="modal-container">
        <div class="modal-title">상세 메모</div>
        <textarea id="memo-input-textarea" placeholder="메모를 입력하세요&#10;(줄바꿈: 엔터키 사용 가능)"
            style="width:100%; height:120px; padding:10px; border-radius:8px; border:1px solid #ddd; resize:none; font-size:14px; box-sizing:border-box; font-family:inherit; line-height:1.5; outline:none;"></textarea>
        <button class="modal-btn primary" onclick="saveMemoAction()">저장</button>
        <button class="modal-btn cancel" onclick="closeMemoModal()">취소</button>
    </div>`;

export function injectAppModals() {
    if (document.getElementById('import-warning-modal-overlay')) return;
    document.body.insertAdjacentHTML('beforeend', APP_MODALS_HTML);
}
