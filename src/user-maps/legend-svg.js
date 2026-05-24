/* ==========================================================================
   [모듈] 사용자지도 범례 SVG 생성 (user-maps/legend-svg.js)
   [역할]
   - 사용자지도 목록에 보이는 선/면 스타일 미리보기 SVG를 생성합니다.
   - 색상, 투명도, 선 모양, 채우기 패턴을 작은 범례 그림으로 변환합니다.
   [참고]
   - 사용자지도 목록의 스타일 미리보기가 이상할 때 확인합니다.
   ========================================================================== */
import { DEFAULT_VECTOR_STYLE } from './constants.js';
import { getLineStyleDashArray, getLineStyleFromDashArray, normalizeFillPattern } from '../utils.js';

function normalizePreviewColor(color, fallback = '#2563eb') {
    const value = String(color || '').trim();
    if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)) return value;
    if (/^[a-zA-Z]+$/.test(value)) return value;
    return fallback;
}

function normalizePreviewOpacity(value, fallback = 0) {
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(1, Math.max(0, parsed));
}

function getPreviewStrokeWidth(weight) {
    const parsed = parseFloat(weight);
    const normalized = Number.isFinite(parsed) ? Math.min(5, Math.max(1, parsed)) : DEFAULT_VECTOR_STYLE.weight;
    return Math.max(1.2, Math.min(4.4, normalized * 0.82));
}

function getPreviewDashArray(styleId, dashArray, weight) {
    if (styleId === 'none' || dashArray === 'none') return null;
    if (styleId === 'solid-dot') return null;
    const dot = 0.01;
    const gap = Number(Math.max(4, getPreviewStrokeWidth(weight) * 2).toFixed(1));
    const dottedGap = Number(Math.max(3, getPreviewStrokeWidth(weight) * 1.45).toFixed(1));
    if (styleId === 'dotted') return `${dot} ${dottedGap}`;
    if (styleId === 'dash-dot') return `${Number((dot * 4).toFixed(1))} ${gap} ${dot} ${gap}`;
    if (styleId === 'dash-dot-dot') return `${Number((dot * 4).toFixed(1))} ${gap} ${dot} ${gap} ${dot} ${gap}`;
    const source = styleId ? getLineStyleDashArray(styleId, weight) : dashArray;
    if (!source || source === 'none') return null;
    return String(source)
        .split(',')
        .map(value => Math.max(1, Math.round(Number(value.trim()) * 0.72)))
        .filter(value => Number.isFinite(value))
        .join(' ');
}

function getPatternPreviewPath(pattern) {
    switch (pattern) {
        case 'horizontal':
            return 'M1 6 H27 M1 12 H27 M1 18 H27 M1 24 H27';
        case 'vertical':
            return 'M6 1 V27 M12 1 V27 M18 1 V27 M24 1 V27';
        case 'diagonal-right':
            return 'M-4 28 L28 -4 M4 32 L32 4 M-8 20 L20 -8';
        case 'diagonal-left':
            return 'M-4 0 L28 32 M4 -4 L32 24 M-8 8 L20 36';
        case 'grid':
            return 'M1 7 H27 M1 13 H27 M1 19 H27 M1 25 H27 M7 1 V27 M13 1 V27 M19 1 V27 M25 1 V27';
        case 'crosshatch':
            return 'M-4 28 L28 -4 M4 32 L32 4 M-8 20 L20 -8 M-4 0 L28 32 M4 -4 L32 24 M-8 8 L20 36';
        default:
            return '';
    }
}

function createSolidDotMarkers(points, color, radius = 2.1) {
    return points
        .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}" />`)
        .join('');
}

export function createLineLegendSvg(style) {
    const lineStyle = style.customLineStyle || getLineStyleFromDashArray(style.customDashArray || style.dashArray);
    const isNoStroke = lineStyle === 'none' || style.customDashArray === 'none' || style.stroke === false;
    const strokeColor = normalizePreviewColor(style.color || style.customColor || DEFAULT_VECTOR_STYLE.color);
    const strokeWidth = getPreviewStrokeWidth(style.weight || style.customWeight);
    const dash = getPreviewDashArray(lineStyle, style.customDashArray || style.dashArray, style.weight || style.customWeight);
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
    const line = isNoStroke
        ? ''
        : `<line x1="2" y1="25" x2="26" y2="3" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dashAttr} />`;
    const dots = !isNoStroke && lineStyle === 'solid-dot'
        ? createSolidDotMarkers([[8, 19.5], [14, 14], [20, 8.5]], strokeColor, Math.max(1.8, strokeWidth * 0.75))
        : '';

    return `<svg class="style-legend-svg" viewBox="0 0 28 28" aria-hidden="true">${line}${dots}</svg>`;
}

export function createPolygonLegendSvg(style) {
    const fillColor = normalizePreviewColor(style.fillColor || style.customFillColor || style.customColor || DEFAULT_VECTOR_STYLE.fillColor);
    const strokeColor = normalizePreviewColor(style.color || style.customStrokeColor || style.customColor || DEFAULT_VECTOR_STYLE.color);
    const fillPattern = normalizeFillPattern(style.customFillPattern);
    const fillOpacity = normalizePreviewOpacity(style.fillOpacity ?? style.customFillOpacity ?? DEFAULT_VECTOR_STYLE.fillOpacity, 0);
    const lineStyle = style.customLineStyle || getLineStyleFromDashArray(style.customDashArray || style.dashArray);
    const isNoStroke = lineStyle === 'none' || style.customDashArray === 'none' || style.stroke === false;
    const strokeWidth = getPreviewStrokeWidth(style.weight || style.customWeight);
    const dash = getPreviewDashArray(lineStyle, style.customDashArray || style.dashArray, style.weight || style.customWeight);
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';

    let fillMarkup = '';
    if (fillPattern === 'solid' && fillOpacity > 0) {
        fillMarkup = `<rect x="2" y="2" width="24" height="24" fill="${fillColor}" fill-opacity="${fillOpacity}" />`;
    } else if (fillPattern !== 'none' && fillOpacity > 0) {
        const clipId = `user-map-legend-fill-clip-${Math.random().toString(36).slice(2)}`;
        fillMarkup = `
            <clipPath id="${clipId}"><rect x="2" y="2" width="24" height="24" /></clipPath>
            <path d="${getPatternPreviewPath(fillPattern)}" clip-path="url(#${clipId})" stroke="${fillColor}" stroke-opacity="${fillOpacity}" stroke-width="1.2" fill="none" />`;
    }

    const strokeMarkup = isNoStroke
        ? ''
        : `<rect x="2" y="2" width="24" height="24" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"${dashAttr} />`;
    const solidDotMarkup = !isNoStroke && lineStyle === 'solid-dot'
        ? createSolidDotMarkers([[8, 2], [16, 2], [26, 8], [26, 17], [17, 26], [8, 26], [2, 17], [2, 8]], strokeColor, Math.max(1.6, strokeWidth * 0.62))
        : '';

    return `<svg class="style-legend-svg" viewBox="0 0 28 28" aria-hidden="true">${fillMarkup}${strokeMarkup}${solidDotMarkup}</svg>`;
}
