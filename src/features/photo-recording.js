/* ==========================================================================
   [모듈] 사진 점 기록 시작 기능 (features/photo-recording.js)
   [역할]
   - 사진 촬영 또는 갤러리 선택으로 새 점 기록을 시작합니다.
   - 사진 기록 권한 확인, 임시 파일 input 생성, 선택된 사진 압축을 처리합니다.
   [참고]
   - 사진을 첨부한 점 기록 시작 흐름을 바꿀 때 확인합니다.
   ========================================================================== */
import { AUTH_FEATURES } from '../auth.js';
import { AppState } from '../state.js';
import { currentEditLayerId, startDraw } from '../draw.js';
import { closeBottomSheet, highlightButton, openPhotoSelectMenu } from '../ui.js';
import { resizeImage } from '../utils.js';

/**
 * 사진 첨부용 점 기록 시작 메뉴를 엽니다.
 * 동작 원리: 임시 file input DOM을 만들고 메뉴 선택(촬영/갤러리)으로 분기합니다.
 */
export function startPhotoPoint({ ensureFeatureAccess }) {
    if (!ensureFeatureAccess(AUTH_FEATURES.PHOTO_RECORDING, '사진 기록은 인증된 회원과 관리자 계정만 사용할 수 있습니다.')) return;
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    closeBottomSheet();

    const tempId = 'new-photo-point';
    let div = document.getElementById(`temp-inputs-${tempId}`);
    if (!div) {
        div = document.createElement('div');
        div.id = `temp-inputs-${tempId}`;
        div.style.display = 'none';
        div.innerHTML = `<input type="file" id="input-cam-${tempId}" accept="image/*" capture="environment" onchange="processPendingPhotoFiles(this)">
                         <input type="file" id="input-gal-${tempId}" accept="image/*" multiple onchange="processPendingPhotoFiles(this)">`;
        document.body.appendChild(div);
    }
    openPhotoSelectMenu(null, tempId);
}

/**
 * 사진 점 기록 전처리(리사이즈/임시저장) 후 마커 그리기를 시작합니다.
 * 동작 원리: 파일을 base64로 읽고 resizeImage를 거쳐 AppState.pendingPhotos에 보관합니다.
 */
export function processPendingPhotoFiles(input, { ensureFeatureAccess }) {
    if (!ensureFeatureAccess(AUTH_FEATURES.PHOTO_RECORDING, '사진 기록은 인증된 회원과 관리자 계정만 사용할 수 있습니다.')) {
        input.value = '';
        return;
    }
    const files = input.files;
    if (!files || files.length === 0) return;
    if (files.length > 5) {
        alert('사진은 최대 5장까지만 저장할 수 있습니다.');
        input.value = '';
        return;
    }

    const promises = Array.from(files).map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                resizeImage(e.target.result, 800, 0.8).then(resolve);
            };
            reader.readAsDataURL(file);
        });
    });
    Promise.all(promises).then(results => {
        AppState.pendingPhotos = results;
        input.value = '';

        const tempDiv = document.getElementById('temp-inputs-new-photo-point');
        if (tempDiv) tempDiv.remove();

        // 전처리 완료 후 마커 드로어를 시작하면 created 이벤트에서 사진이 레이어에 귀속됩니다.
        startDraw('marker');
        highlightButton('btn-photo-point');
    });
}
