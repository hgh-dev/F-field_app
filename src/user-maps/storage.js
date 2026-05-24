/* ==========================================================================
   [모듈] 사용자지도 목록 저장소 (user-maps/storage.js)
   [역할]
   - 사용자지도 목록 메타데이터를 localStorage에 저장하고 불러옵니다.
   - 실제 대용량 지도 데이터 저장은 다른 저장소를 사용하고, 이 파일은 목록 정보만 다룹니다.
   [참고]
   - 사용자지도 목록이 새로고침 후 사라질 때 확인합니다.
   ========================================================================== */
import { USER_MAPS_KEY } from './constants.js';

export function loadUserMapsFromStorage() {
    try {
        const parsed = JSON.parse(localStorage.getItem(USER_MAPS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveUserMapsToStorage(userMaps) {
    localStorage.setItem(USER_MAPS_KEY, JSON.stringify(userMaps));
}

