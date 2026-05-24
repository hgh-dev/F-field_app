/* ==========================================================================
   [모듈] 앱 설정과 고정 상수 (config.js)
   [역할]
   - 앱 버전, 공유 URL, VWorld API 키, localStorage 키, 공통 SVG 아이콘을 보관합니다.
   - 여러 파일에서 함께 쓰는 변하지 않는 값을 한곳에서 관리합니다.
   [참고]
   - 기능 로직은 넣지 않고, 설정값과 상수만 둡니다.
   ========================================================================== */
export const APP_VERSION = "1.0.3"; // 현재 앱 버전
export const SHARE_BASE_URL = "https://f-field.app/";

/**
 * VWORLD_API_KEY
 * 국토교통부 VWorld 지도 서비스를 이용하기 위한 인증 키입니다.
 * Supabase 앱 설정에서 받은 값을 우선 사용하고, 네트워크 오류 시 로컬 캐시 또는 기본값을 씁니다.
 */
export const DEFAULT_VWORLD_API_KEY = "9FA62223-726F-3193-8BF1-F6530711D503";
export const VWORLD_API_KEY_CACHE_KEY = 'f-field-vworld-api-key-cache';
export const APP_SETTINGS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getCachedVworldApiKey() {
   try {
      if (typeof localStorage === 'undefined') return '';
      const raw = localStorage.getItem(VWORLD_API_KEY_CACHE_KEY);
      if (!raw) return '';
      const cached = JSON.parse(raw);
      const key = typeof cached.key === 'string' ? cached.key.trim() : '';
      const expiresAt = typeof cached.expiresAt === 'string' ? cached.expiresAt : '';
      if (!key) return '';
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return '';
      return key;
   } catch (_error) {
      return '';
   }
}

export let VWORLD_API_KEY = getCachedVworldApiKey() || DEFAULT_VWORLD_API_KEY;

export function setVworldApiKey(key, options = {}) {
   const nextKey = typeof key === 'string' ? key.trim() : '';
   if (!nextKey) return VWORLD_API_KEY;

   VWORLD_API_KEY = nextKey;
   try {
      if (typeof localStorage === 'undefined') return VWORLD_API_KEY;
      localStorage.setItem(VWORLD_API_KEY_CACHE_KEY, JSON.stringify({
         key: nextKey,
         expiresAt: options.expiresAt || null,
         updatedAt: options.updatedAt || new Date().toISOString(),
         fetchedAt: new Date().toISOString()
      }));
   } catch (_error) {
      // localStorage를 사용할 수 없는 환경에서는 현재 세션 값만 갱신합니다.
   }

   if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('f-field:vworld-api-key-change', { detail: { key: nextKey } }));
   }
   return VWORLD_API_KEY;
}

/**
 * LocalStorage Keys
 * 브라우저의 로컬 스토리지(내부 저장소)에 데이터를 저장할 때 사용하는 키(Key) 이름입니다.
 * - STORAGE_KEY: 사용자가 그린 도형(측량 기록)과 프로젝트 데이터를 저장함
 * - SEARCH_HISTORY_KEY: 주소 검색 기록을 저장함
 * - SEARCH_SETTING_KEY: 검색 기록 저장 기능의 켜짐/꺼짐 상태를 저장함
 **/
export const STORAGE_KEY = "my_survey_data_v4";
export const SEARCH_HISTORY_KEY = 'my_search_history';
export const SEARCH_SETTING_KEY = 'my_search_setting_enabled';


/* --------------------------------------------------------------------------
   1. 리소스 (Resources)
   -------------------------------------------------------------------------- */
// 앱에서 사용하는 아이콘(그림)들을 SVG 코드로 정리한 객체입니다.
export const SVG_ICONS = {
   // 핀 모양 아이콘
   marker: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
   // 다각형(면적) 아이콘
   polygon: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M12 2L2 9L6 21H18L22 9L12 2Z" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
   // 자(거리) 아이콘
   ruler: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M23 8c0 1.1-.9 2-2 2-.18 0-.35-.02-.51-.07l-3.56 3.55c.05.16.07.34.07.52 0 1.1-.9 2-2 2s-2-.9-2-2c0-.18.02-.36.07-.52l-2.55-2.55c-.16.05-.34.07-.52.07s-.36-.02-.52-.07l-4.55 4.56c.05.16.07.33.07.51 0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2c.18 0 .35.02.51.07l4.56-4.55C8.02 9.36 8 9.18 8 9c0-1.1.9-2 2-2s2 .9 2 2c0 .18-.02.36-.07.52l2.55 2.55c.16-.05.34-.07.52-.07s.36.02.52.07l3.55-3.56C19.02 8.35 19 8.18 19 8c0-1.1.9-2 2-2s2 .9 2 2z"/></svg>`,
   // 수정(연필) 아이콘
   edit: `<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
   // 삭제(휴지통) 아이콘
   trash: `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
   // 저장(플로피디스크) 아이콘
   save: `<svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>`,
   // 메모(노트) 아이콘
   memo: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
   // 닫기(X) 아이콘
   close: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
   // 자동차 아이콘
   car: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`,
   // 잠금 아이콘
   lock: `<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`,
   // 잠금 해제 아이콘
   unlock: `<svg viewBox="0 0 24 24"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c.55 0 1 .45 1 1s-.45 1-1 1H7c-1.66 0-3 1.34-3 3v2H3c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"/></svg>`,
   // 더보기(점 3개) 아이콘
   more: `<svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`,
   // 트랙(달리기) 아이콘
   track: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/></svg>`,
   // 폴더 이동 아이콘 (커스텀: 큰 화살표)
   folder_move: `<svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h11v-2H4V8h16v4h2V8c0-1.1-.9-2-2-2z"/><path d="M14 13v-3l7 4.5-7 4.5v-3H9v-3h5z"/></svg>`,
   // 카메라 아이콘
   camera: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M4 4h3l2-2h6l2 2h3c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm8 3c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"/></svg>`,
   // 검색 돋보기 아이콘
   search: `<svg class="svg-inline" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="currentColor"/></svg>`
};
