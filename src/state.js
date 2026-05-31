/* ==========================================================================
   [모듈] 앱 전역 상태 저장소 (state.js)
   [역할]
   - 현재 프로젝트, 기록 목록, 위치 추적, 편집 상태, UI 상태 같은 앱 공통 상태를 보관합니다.
   - 여러 모듈이 공유하는 값을 AppState 하나로 접근하게 합니다.
   [참고]
   - 상태값을 추가할 때는 저장/복원 대상인지도 함께 확인합니다.
   ========================================================================== */
export const AppState = {
    /* ----------------------------------------------------------------------
       1) 사용자 설정 상태 (localStorage 기반)
       ---------------------------------------------------------------------- */
    // 좌표 표시 방식 (0: 도분초 DMS, 1: Decimal, 2: TM)
    coordMode: parseInt(localStorage.getItem('setting_coord_mode')) || 0,
    // 폴리곤 내부 채움 기본값 (새 기록은 면 없음)
    isPolygonFill: false,
    // 측량/수정 중 스냅 사용 여부
    isSnapEnabled: localStorage.getItem('setting_snap_enabled') !== 'false',
    // 빠른 지도 이동 후 도형 렌더링을 마지막 이동 이후로 지연할지 여부
    isVectorRenderDelayEnabled: true,

    /* ----------------------------------------------------------------------
       2) 지도 위치/추적 상태
       ---------------------------------------------------------------------- */
    // 내 위치 따라가기 모드 ON/OFF
    isFollowing: false,
    // geolocation.watchPosition() 구독 ID (중지 시 clearWatch에 사용)
    watchId: null,
    // 최근 방향각(0~360), 위치 아이콘 회전에 사용
    lastHeading: 0,
    // 최근 GPS 좌표 (초기값은 기본 지도 중심과 동일)
    lastGpsLat: 37.245911,
    lastGpsLng: 126.960302,

    /* ----------------------------------------------------------------------
       3) 지도 오버레이/임시 레이어 상태
       ---------------------------------------------------------------------- */
    // 현재 위치 화살표 마커
    trackingMarker: null,
    // 현재 위치 정확도 반경(파란 원)
    trackingCircle: null,
    // 지번/경계 조회 시 표시되는 임시 경계 레이어
    currentBoundaryLayer: null,
    // 주소/좌표 검색 결과 임시 마커
    currentSearchMarker: null,

    /* ----------------------------------------------------------------------
       4) 그리기/편집 모드 상태
       ---------------------------------------------------------------------- */
    // 현재 활성 드로어 객체 또는 트랙 모드 식별값('track')
    currentDrawer: null,
    // 수동 완료 버튼 처리 시 자동 완료 로직과 충돌을 막는 플래그
    isManualFinish: false,

    /* ----------------------------------------------------------------------
       5) 외부 데이터(산림) 로딩 상태
       ---------------------------------------------------------------------- */
    // 산림 데이터 GeoJSON 결과 레이어
    forestDataLayer: null,
    // 산림 레이어 표시 상태
    isForestActive: false,
    // 비동기 요청 역전(out-of-order) 방지용 시퀀스 번호
    lastForestRequestId: 0,

    /* ----------------------------------------------------------------------
       6) 프로젝트/기록 데이터 상태
       ---------------------------------------------------------------------- */
    // 전체 프로젝트 목록
    projects: [],
    // 현재 선택된 프로젝트 ID
    currentProjectId: null,

    /* ----------------------------------------------------------------------
       7) 목록 정렬 상태 (localStorage 기반)
       ---------------------------------------------------------------------- */
    // 기록 정렬 기준/방향
    sortBy: localStorage.getItem('setting_sort_by') || 'date',
    sortOrder: localStorage.getItem('setting_sort_order') || 'asc',

    // 프로젝트 정렬 기준/방향
    projectSortBy: localStorage.getItem('setting_project_sort_by') || 'date',
    projectSortOrder: localStorage.getItem('setting_project_sort_order') || 'asc',

    /* ----------------------------------------------------------------------
       8) 트랙 기록 상태
       ---------------------------------------------------------------------- */
    // 트랙 점 추가 최소 거리(m): 너무 촘촘한 기록을 방지
    trackInterval: parseInt(localStorage.getItem('setting_track_interval')) || 10,
    // 트랙 전용 geolocation.watchPosition 구독 ID
    trackWatchId: null,
    // 기록 중 임시로 그리는 polyline
    trackPolyline: null,
    // 직전 기록 좌표(거리 계산 기준점)
    lastTrackLatLng: null,

    /* ----------------------------------------------------------------------
       9) 절전모드/화면 꺼짐 방지 상태
       ---------------------------------------------------------------------- */
    // Screen Wake Lock 객체
    wakeLock: null,
    // 절전모드 슬라이더 드래그 관련 상태
    sleepSliderThumb: null,
    isDraggingSleepSlider: false,
    sleepStartX: 0,
    sleepCurrentX: 0,
    sleepMaxDragX: 0,
    // 레이어 클릭 직후 map click 핸들러 오작동을 막는 이벤트 가드 플래그
    isLayerClicked: false,
    // 사진 포인트 생성 전 임시로 보관하는 전처리 이미지 배열
    pendingPhotos: null
};
