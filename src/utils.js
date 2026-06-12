/* ==========================================================================
   [모듈] 앱 공통 유틸리티 (utils.js)
   [역할]
   - 날짜/문자열 포맷, 좌표 변환, 거리/면적 계산, 아이콘 생성, 이미지 압축을 제공합니다.
   - 여러 기능에서 반복해서 쓰는 순수 계산과 브라우저 보조 함수를 모아둡니다.
   [참고]
   - 특정 기능 전용 로직보다는 앱 전체에서 재사용되는 보조 기능만 둡니다.
   ========================================================================== */
import { SVG_ICONS } from './config.js';
import { showAppPrompt } from './app-dialog.js';

/* ==========================================================================
   1) 포맷/생성 유틸
   ========================================================================== */

/**
 * 기록/측량 모드의 공통 시각 상태를 전환합니다.
 */
export function setRecordingModeActive(isActive) {
    document.body.classList.toggle('recording-mode', isActive);
}

/**
 * 현재 시각을 파일명에 쓰기 쉬운 문자열(YYMMDD_HHMMSS)로 반환합니다.
 */
export function getTimestampString() {
    const now = new Date();
    return now.toISOString().slice(2, 10).replace(/-/g, "") + "_" + now.toTimeString().slice(0, 8).replace(/:/g, "");
}

/**
 * 기록명 속성을 읽습니다.
 * 현재 표준은 name이고, 기존 저장 데이터 호환을 위해 memo를 fallback으로 사용합니다.
 */
export function getRecordName(props = {}, fallback = "") {
    const value = props.name ?? props.memo;
    if (value === undefined || value === null || value === "") return fallback;
    return String(value);
}

/**
 * 기록명을 현재 표준(name)과 구버전 호환(memo)에 동시에 저장합니다.
 */
export function setRecordName(props, name) {
    if (!props) return props;
    const value = name ?? "";
    props.name = value;
    props.memo = value;
    return props;
}

/**
 * 기존 데이터처럼 name 또는 memo 중 하나만 있는 경우 두 속성을 맞춥니다.
 */
export function ensureRecordNameAlias(props, fallback = "") {
    if (!props) return props;
    const name = getRecordName(props, fallback);
    if (name !== "") setRecordName(props, name);
    return props;
}

/**
 * 랜덤 HEX 색상 문자열(#RRGGBB)을 생성합니다.
 * 동작 원리: 16진수 문자 6자리를 무작위로 뽑아 결합합니다.
 */
export function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) color += letters[Math.floor(Math.random() * 16)];
    return color;
}

export const LINE_STYLE_OPTIONS = [
    { id: 'none', label: '선 없음', dashArray: 'none' },
    { id: 'solid', label: '실선', dashArray: null },
    { id: 'solid-dot', label: '실선+점', dashArray: null },
    { id: 'dashed', label: '파선', dashArray: '8, 5' },
    { id: 'long-dashed', label: '긴 파선', dashArray: '14, 7' },
    { id: 'dotted', label: '점선', dashArray: '1, 6' },
    { id: 'dash-dot', label: '일점쇄선', dashArray: '10, 5, 2, 5' },
    { id: 'dash-dot-dot', label: '이점쇄선', dashArray: '10, 5, 2, 5, 2, 5' }
];

export const FILL_PATTERN_OPTIONS = [
    { id: 'none', label: '면 없음' },
    { id: 'solid', label: '단색' },
    { id: 'horizontal', label: '가로선' },
    { id: 'vertical', label: '세로선' },
    { id: 'diagonal-right', label: '우상향 사선' },
    { id: 'diagonal-left', label: '우하향 사선' },
    { id: 'grid', label: '격자' },
    { id: 'crosshatch', label: '교차 사선' }
];

export const MARKER_STYLE_OPTIONS = [
    { id: '', label: '기본마커' },
    { id: 'circle', label: '원' },
    { id: 'triangle', label: '삼각형' },
    { id: 'square', label: '사각형' },
    { id: 'pentagon', label: '오각형' },
    { id: 'diamond', label: '다이아몬드' },
    { id: 'star', label: '별' }
];

const MARKER_STYLE_IDS = new Set(MARKER_STYLE_OPTIONS.map(option => option.id));

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function isPresetMarkerStyle(style) {
    return MARKER_STYLE_IDS.has(style);
}

export function normalizeMarkerStyle(style) {
    if (style === 'dot') return 'circle';
    const normalized = String(style || '').trim();
    if (!normalized) return '';
    if (MARKER_STYLE_IDS.has(normalized)) return normalized;
    return Array.from(normalized).slice(0, 8).join('');
}

export function normalizeFillPattern(pattern) {
    return FILL_PATTERN_OPTIONS.some(option => option.id === pattern) ? pattern : 'solid';
}

/**
 * Leaflet 파선 패턴을 선 굵기에 맞춰 반환합니다.
 * 굵은 선일수록 간격을 넓혀 점선끼리 붙어 보이지 않게 합니다.
 */
export function getDashArrayForWeight(weight) {
    const parsedWeight = parseFloat(weight);
    const normalizedWeight = Number.isNaN(parsedWeight) ? 3 : Math.min(5, Math.max(1, parsedWeight));
    const dash = Math.max(5, normalizedWeight * 2);
    const gap = normalizedWeight === 1 ? 5 : Math.max(6, normalizedWeight * 2);
    return `${dash}, ${gap}`;
}

export function getLineStyleDashArray(styleId, weight = 3) {
    const normalizedStyleId = styleId === 'dashed' ? 'dashed' : styleId;
    if (normalizedStyleId === 'none') return 'none';
    if (normalizedStyleId === 'solid-dot') return null;
    if (!normalizedStyleId || normalizedStyleId === 'solid') return null;

    const parsedWeight = parseFloat(weight);
    const normalizedWeight = Number.isNaN(parsedWeight) ? 3 : Math.min(5, Math.max(1, parsedWeight));
    const dot = 0.01;
    const dotGap = Math.max(4, Math.round(normalizedWeight * 2));
    const dottedGap = Math.max(3, Math.round(normalizedWeight * 1.45));

    if (normalizedStyleId === 'dotted') return `${dot}, ${dottedGap}`;
    if (normalizedStyleId === 'dash-dot') return `${Math.round(normalizedWeight * 4)}, ${dotGap}, ${dot}, ${dotGap}`;
    if (normalizedStyleId === 'dash-dot-dot') return `${Math.round(normalizedWeight * 4)}, ${dotGap}, ${dot}, ${dotGap}, ${dot}, ${dotGap}`;

    const option = LINE_STYLE_OPTIONS.find(item => item.id === normalizedStyleId);
    if (!option || !option.dashArray || option.dashArray === 'none') return null;

    const scale = normalizedWeight / 3;
    return option.dashArray
        .split(',')
        .map(value => Math.max(1, Math.round(Number(value.trim()) * scale)))
        .join(', ');
}

export function parseDashArray(dashArray) {
    if (!dashArray || dashArray === 'none') return [];
    return String(dashArray)
        .trim()
        .split(/[\s,]+/)
        .map(value => Number(value))
        .filter(value => Number.isFinite(value) && value > 0);
}

export function getLineStyleFromDashArray(dashArray, fallback = 'solid') {
    if (dashArray === 'none') return 'none';
    if (!dashArray) return fallback;

    const normalizedParts = parseDashArray(dashArray);

    if (normalizedParts.length === 4 && normalizedParts[0] >= 12 && normalizedParts[1] <= 2 && normalizedParts[3] <= 2) {
        return 'solid-dot';
    }
    if (normalizedParts.length >= 6) return 'dash-dot-dot';
    if (normalizedParts.length >= 4) return 'dash-dot';
    if (normalizedParts.length === 2) {
        if (normalizedParts[0] <= normalizedParts[1]) return 'dotted';
        if (normalizedParts[0] >= normalizedParts[1] * 2) return 'long-dashed';
        return 'dashed';
    }

    return fallback;
}

export function createMarkerShapeSvg(color, markerStyle = '', iconSize = 36) {
    const style = normalizeMarkerStyle(markerStyle);
    const stroke = 'white';
    const strokeWidth = 0.8;

    if (style === 'circle') {
        return `<svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
            <circle cx="12" cy="12" r="3.6" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        </svg>`;
    }
    if (style === 'triangle') {
        return `<svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
            <path d="M12 7.7 L16.3 16.3 H7.7 Z" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>
        </svg>`;
    }
    if (style === 'square') {
        return `<svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
            <rect x="7.8" y="7.8" width="8.4" height="8.4" rx="0.9" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        </svg>`;
    }
    if (style === 'pentagon') {
        return `<svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
            <path d="M12 7.1 L16.6 10.55 L14.85 16.1 H9.15 L7.4 10.55 Z" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>
        </svg>`;
    }
    if (style === 'diamond') {
        return `<svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
            <path d="M12 7.2 L16.8 12 L12 16.8 L7.2 12 Z" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>
        </svg>`;
    }
    if (style === 'star') {
        return `<svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));">
            <path d="M12 6.9 L13.45 10.05 L17 10.5 L14.35 12.9 L15.05 16.45 L12 14.6 L8.95 16.45 L9.65 12.9 L7 10.5 L10.55 10.05 Z" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>
        </svg>`;
    }
    if (style) {
        const emojiSize = Math.round(iconSize * 0.7);
        return `<span style="width:${iconSize}px;height:${iconSize}px;display:flex;align-items:center;justify-content:center;font-size:${emojiSize}px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.3));">${escapeHtml(style)}</span>`;
    }

    return `<svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
            fill="${color}" stroke="${stroke}" stroke-width="0.8"/>
    </svg>`;
}

/**
 * 색상/모양/크기 옵션으로 Leaflet divIcon을 생성합니다.
 */
export function createColoredMarkerIcon(color, markerStyle = '', size = 3) {
    const sizeMap = {
        1: { iconSize: 26, anchor: 13 },
        2: { iconSize: 31, anchor: 15.5 },
        3: { iconSize: 36, anchor: 18 },
        4: { iconSize: 42, anchor: 21 },
        5: { iconSize: 48, anchor: 24 }
    };
    const s = sizeMap[size] || sizeMap[3];
    const style = normalizeMarkerStyle(markerStyle);

    if (style) {
        return L.divIcon({
            className: 'custom-shape-marker',
            html: createMarkerShapeSvg(color, style, s.iconSize),
            iconSize: [s.iconSize, s.iconSize],
            iconAnchor: [s.anchor, s.anchor],
            popupAnchor: [0, -s.anchor]
        });
    }

    return L.divIcon({
        className: '',
        html: createMarkerShapeSvg(color, '', s.iconSize),
        iconSize: [s.iconSize, s.iconSize],
        iconAnchor: [s.anchor, s.iconSize],
        popupAnchor: [0, -s.iconSize]
    });
}

/**
 * 텍스트를 클립보드에 복사합니다.
 * 동작 원리: 우선 navigator.clipboard를 사용하고, 실패 시 textarea+execCommand로 fallback 합니다.
 */
export function copyText(text, silent = false, itemLabel = "주소") {
    const msg = `${itemLabel}가 복사되었습니다.`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            if (!silent) alert(msg);
        }).catch(err => {
            console.error(err);
            showAppPrompt("복사하세요:", text, { okText: '닫기' });
        });
    } else {
        const tempInput = document.createElement("textarea");
        document.body.appendChild(tempInput);
        tempInput.value = text;
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        if (!silent) alert(msg);
    }
}

/**
 * 주소 문자열에서 뒤쪽 핵심 구간(동/리/가)을 우선 추출해 짧은 주소를 만듭니다.
 */
export function getShortAddress(addressName) {
    if (!addressName) return "";
    const parts = addressName.split(' ');
    for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].match(/(동|리|가)$/)) return parts.slice(i).join(' ');
    }
    return parts.length >= 2 ? parts.slice(parts.length - 2).join(' ') : addressName;
}

/* ==========================================================================
   2) 좌표/변환 유틸
   ========================================================================== */
/**
 * WGS84(lat,lng)를 TM(EPSG:5186) 좌표로 변환합니다.
 * 동작 원리: proj4 변환 결과를 반올림해 정수 미터 좌표로 반환합니다.
 */
export function getTmCoords(lat, lng) {
    // proj4는 index.html에서 전역으로 로드되어 있다고 가정합니다.
    const xy = proj4("EPSG:4326", "EPSG:5186", [lng, lat]);
    return { x: Math.round(xy[0]), y: Math.round(xy[1]) };
}

/**
 * TM(EPSG:5186) 좌표를 WGS84(lat,lng)로 변환합니다.
 */
export function getWgs84FromTm(x, y) {
    const coords = proj4("EPSG:5186", "EPSG:4326", [x, y]);
    return { lat: coords[1], lng: coords[0] };
}

function ensureCalculationCrs() {
    if (typeof proj4 === 'undefined' || !proj4.defs) return;
    if (!proj4.defs("EPSG:5179")) {
        proj4.defs("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");
    }
}

function projectWgs84ToCalculationPoint(lng, lat) {
    ensureCalculationCrs();
    if (typeof proj4 === 'undefined') return null;
    const x = Number(lng);
    const y = Number(lat);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const projected = proj4("EPSG:4326", "EPSG:5179", [x, y]);
    return { x: projected[0], y: projected[1] };
}

function getGeometryFromGeoJson(geojson) {
    if (!geojson) return null;
    if (geojson.type === 'Feature') return geojson.geometry;
    if (geojson.type === 'FeatureCollection') return geojson;
    return geojson;
}

function getProjectedDistanceBetweenCoords(coordA, coordB) {
    const a = projectWgs84ToCalculationPoint(coordA?.[0], coordA?.[1]);
    const b = projectWgs84ToCalculationPoint(coordB?.[0], coordB?.[1]);
    if (!a || !b) return 0;
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function calculateLineCoordsLengthMeters(coords = []) {
    let length = 0;
    for (let i = 1; i < coords.length; i++) {
        length += getProjectedDistanceBetweenCoords(coords[i - 1], coords[i]);
    }
    return length;
}

function calculateRingAreaM2(ring = []) {
    if (!Array.isArray(ring) || ring.length < 3) return 0;
    const projected = ring
        .map(coord => projectWgs84ToCalculationPoint(coord?.[0], coord?.[1]))
        .filter(Boolean);
    if (projected.length < 3) return 0;

    let sum = 0;
    for (let i = 0; i < projected.length; i++) {
        const current = projected[i];
        const next = projected[(i + 1) % projected.length];
        sum += (current.x * next.y) - (next.x * current.y);
    }
    return Math.abs(sum) / 2;
}

function calculatePolygonCoordsAreaM2(rings = []) {
    if (!Array.isArray(rings) || rings.length === 0) return 0;
    const outerArea = calculateRingAreaM2(rings[0]);
    const holeArea = rings.slice(1).reduce((total, ring) => total + calculateRingAreaM2(ring), 0);
    return Math.max(0, outerArea - holeArea);
}

/**
 * WGS84 GeoJSON 선 좌표를 EPSG:5179로 투영해 거리(m)를 계산합니다.
 */
export function calculateProjectedLengthMeters(geojson) {
    const geometry = getGeometryFromGeoJson(geojson);
    if (!geometry) return 0;
    if (geometry.type === 'FeatureCollection') {
        return (geometry.features || []).reduce((total, feature) => total + calculateProjectedLengthMeters(feature), 0);
    }
    if (geometry.type === 'LineString') return calculateLineCoordsLengthMeters(geometry.coordinates);
    if (geometry.type === 'MultiLineString') {
        return (geometry.coordinates || []).reduce((total, coords) => total + calculateLineCoordsLengthMeters(coords), 0);
    }
    if (geometry.type === 'Polygon') return calculateLineCoordsLengthMeters(geometry.coordinates?.[0] || []);
    if (geometry.type === 'MultiPolygon') {
        return (geometry.coordinates || []).reduce((total, polygon) => total + calculateLineCoordsLengthMeters(polygon?.[0] || []), 0);
    }
    if (geometry.type === 'GeometryCollection') {
        return (geometry.geometries || []).reduce((total, item) => total + calculateProjectedLengthMeters(item), 0);
    }
    return 0;
}

/**
 * WGS84 GeoJSON 면 좌표를 EPSG:5179로 투영해 면적(㎡)을 계산합니다.
 */
export function calculateProjectedAreaM2(geojson) {
    const geometry = getGeometryFromGeoJson(geojson);
    if (!geometry) return 0;
    if (geometry.type === 'FeatureCollection') {
        return (geometry.features || []).reduce((total, feature) => total + calculateProjectedAreaM2(feature), 0);
    }
    if (geometry.type === 'Polygon') return calculatePolygonCoordsAreaM2(geometry.coordinates);
    if (geometry.type === 'MultiPolygon') {
        return (geometry.coordinates || []).reduce((total, polygon) => total + calculatePolygonCoordsAreaM2(polygon), 0);
    }
    if (geometry.type === 'GeometryCollection') {
        return (geometry.geometries || []).reduce((total, item) => total + calculateProjectedAreaM2(item), 0);
    }
    return 0;
}

/**
 * WGS84 두 좌표를 EPSG:5179로 투영해 거리(m)를 계산합니다.
 */
export function calculateProjectedDistanceMeters(lat1, lng1, lat2, lng2) {
    return getProjectedDistanceBetweenCoords([lng1, lat1], [lng2, lat2]);
}

/**
 * Decimal 좌표를 도분초(DMS) 문자열로 변환합니다.
 * type은 'lat' 또는 'lng'를 받아 방향 문자(N/S/E/W)를 결정합니다.
 */
export function convertToDms(val, type) {
    const valAbs = Math.abs(val);
    const deg = Math.floor(valAbs);
    const minFloat = (valAbs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(2);
    return (val >= 0 ? (type === 'lat' ? "N" : "E") : (type === 'lat' ? "S" : "W")) + " " + deg + "° " + min + "' " + sec + "\"";
}

/**
 * 도/분/초 + 방향 문자를 Decimal 좌표로 변환합니다.
 */
export function dmsToDecimal(deg, min, sec, type) {
    let dec = parseFloat(deg) + parseFloat(min) / 60 + parseFloat(sec) / 3600;
    if (type === 'S' || type === 'W') {
        dec = dec * -1;
    }
    return dec;
}

/* ==========================================================================
   3) 미디어/입력 유틸
   ========================================================================== */
/**
 * base64 이미지를 최대 폭 기준으로 리사이즈하고 JPEG base64로 반환합니다.
 * 동작 원리: Image -> Canvas drawImage -> toDataURL 순서로 재인코딩합니다.
 */
export function resizeImage(base64Str, maxWidth = 1024, quality = 0.8) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = function () {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            resolve(canvas.toDataURL('image/jpeg', quality));
        };
    });
}

/**
 * 국가지점번호(예: 가나 1234 5678)를 WGS84 좌표로 변환합니다.
 * 동작 원리:
 * - 한글 격자 문자를 인덱스로 바꿔 TM 격자 좌표를 계산합니다.
 * - 계산한 좌표(EPSG:5179)를 proj4로 WGS84로 변환합니다.
 * @returns {[number, number] | null} [lng, lat] 또는 변환 실패 시 null
 */
export function parseNationalPointNumber(text) {
    const match = text.match(/^([가-하])([가-하])\s*(\d{4})\s*(\d{4})$/);
    if (!match) return null;

    const chars = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
    const char1 = match[1];
    const char2 = match[2];
    const num1 = parseInt(match[3], 10);
    const num2 = parseInt(match[4], 10);

    const index1 = chars.indexOf(char1);
    const index2 = chars.indexOf(char2);

    if (index1 === -1 || index2 === -1) return null;

    const x = (index1 + 7) * 100000 + num1 * 10;
    const y = (index2 + 13) * 100000 + num2 * 10;

    try {
        const coords = proj4("EPSG:5179", "EPSG:4326", [x, y]);
        return coords; // [lng, lat] 배열 반환
    } catch (e) {
        console.error("좌표 변환 실패", e);
        return null;
    }
}
