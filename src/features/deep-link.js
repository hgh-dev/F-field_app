/* ==========================================================================
   [모듈] URL 딥링크 처리 (features/deep-link.js)
   [역할]
   - URL의 lat/lng 파라미터를 읽어 지도 위치를 이동하고 해당 지점 정보를 조회합니다.
   - 외부에서 공유 링크로 앱을 열었을 때 첫 화면 위치를 맞춥니다.
   [참고]
   - 공유 링크나 좌표 링크 진입 동작을 바꿀 때 확인합니다.
   ========================================================================== */
import { map } from '../map.js';
import { fetchAndHighlightBoundary, showInfoPopup } from '../ui.js';

/**
 * URL 딥링크(lat,lng)를 읽어 해당 좌표로 이동하고 정보 조회를 실행합니다.
 * 동작 원리: setView 직후 약간 지연 후 조회를 호출해 지도 이동/렌더 타이밍 경합을 줄입니다.
 */
export async function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get('lat'));
    const lng = parseFloat(params.get('lng'));

    if (!isNaN(lat) && !isNaN(lng)) {
        map.setView([lat, lng], 19);
        setTimeout(() => {
            showInfoPopup(lat, lng);
            fetchAndHighlightBoundary(lng, lat);
        }, 500);
    }
}
