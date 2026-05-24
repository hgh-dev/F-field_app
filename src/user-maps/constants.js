/* ==========================================================================
   [모듈] 사용자지도 상수 (user-maps/constants.js)
   [역할]
   - 사용자지도 저장 키, 기본 줌, 기본 스타일, 레이어 z-index 기준값을 보관합니다.
   - 사용자지도 하위 모듈들이 함께 쓰는 고정값을 한곳에서 관리합니다.
   [참고]
   - 기능 로직은 넣지 않고 사용자지도 관련 상수만 둡니다.
   ========================================================================== */
export const USER_MAPS_KEY = 'f-field-user-maps-v1';
export const USER_MAP_DATA_STORE = 'f-field-user-map-data-v1';
export const DEFAULT_MAX_ZOOM = 22;
export const SHP_VIEWPORT_BUFFER_RATIO = 0.35;
export const DEFAULT_VECTOR_STYLE = {
    color: '#2563eb',
    weight: 2,
    opacity: 0.85,
    fillColor: '#2563eb',
    fillOpacity: 0.18
};
export const USER_MAP_Z_INDEX_BASE = 380;

