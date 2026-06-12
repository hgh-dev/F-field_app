/* ==========================================================================
   [모듈] 사용자지도 스타일 상태 (user-maps/style-state.js)
   [역할]
   - 사용자지도 전체 스타일과 속성값 카테고리별 스타일/표시 상태를 정규화합니다.
   - 스타일 모달에서 선택한 색상, 선 모양, 채우기 설정을 레이어 표시용 값으로 바꿉니다.
   [참고]
   - 사용자지도 스타일이나 카테고리별 표시 상태가 이상할 때 확인합니다.
   ========================================================================== */
import { DEFAULT_VECTOR_STYLE } from './constants.js';
import { escapeHtml, getUserMapLabel } from './utils.js';
import { getLineStyleDashArray } from '../utils.js';

export function getUserMapStyle(item) {
    return normalizeUserMapStyle(item?.style || {});
}

export function normalizeUserMapStyle(source = {}) {
    const customDashArray = source.customLineStyle
        ? getLineStyleDashArray(source.customLineStyle, source.customWeight || source.weight || DEFAULT_VECTOR_STYLE.weight)
        : (source.customDashArray ?? source.dashArray ?? null);
    const isNoStroke = customDashArray === 'none' || source.stroke === false;

    return {
        ...DEFAULT_VECTOR_STYLE,
        ...source,
        color: source.customStrokeColor || source.color || source.customColor || DEFAULT_VECTOR_STYLE.color,
        fillColor: source.customFillColor || source.fillColor || source.customColor || source.color || DEFAULT_VECTOR_STYLE.fillColor,
        weight: Math.min(5, Math.max(1, parseInt(source.customWeight || source.weight || DEFAULT_VECTOR_STYLE.weight, 10))),
        fillOpacity: Math.min(1, Math.max(0, Number(source.customFillOpacity ?? source.fillOpacity ?? DEFAULT_VECTOR_STYLE.fillOpacity))),
        dashArray: isNoStroke ? null : (customDashArray || null),
        lineCap: 'round',
        lineJoin: 'round',
        stroke: !isNoStroke
    };
}

export function getCategoryValueKey(value) {
    if (value === null || value === undefined || value === '') return '__EMPTY__';
    return String(value);
}

export function getCategoryValueLabel(key) {
    return key === '__EMPTY__' ? '(값 없음)' : key;
}

export function getFeatureCategoryKey(feature, fieldName) {
    return getCategoryValueKey(feature?.properties?.[fieldName]);
}

export function getFeatureUserMapStyle(item, feature) {
    if (item?.styleMode === 'categorized' && item.categoryField) {
        const key = getFeatureCategoryKey(feature, item.categoryField);
        return normalizeUserMapStyle(item.categoryStyles?.[key] || item.defaultCategoryStyle || item.style || {});
    }
    return getUserMapStyle(item);
}

export function getVisibleCategoryValues(item) {
    const values = Array.isArray(item?.categoryValues) ? item.categoryValues : [];
    if (!values.length) return [];
    if (!Array.isArray(item.categoryVisibleValues)) {
        item.categoryVisibleValues = [...values];
    } else {
        item.categoryVisibleValues = item.categoryVisibleValues.filter(value => values.includes(value));
    }
    return item.categoryVisibleValues;
}

export function isFeatureCategoryVisible(item, feature) {
    if (item?.styleMode !== 'categorized' || !item.categoryField) return true;
    const visibleValues = getVisibleCategoryValues(item);
    return visibleValues.includes(getFeatureCategoryKey(feature, item.categoryField));
}

export function getCategorySelectionState(item, activeUserLayers) {
    const isLayerSelected = activeUserLayers.has(item?.id) || item?.enabled;
    if (item?.styleMode !== 'categorized' || !item.categoryField) {
        return { checked: isLayerSelected, indeterminate: false, total: 0, selected: isLayerSelected ? 1 : 0 };
    }

    const values = Array.isArray(item.categoryValues) ? item.categoryValues : [];
    if (!isLayerSelected) {
        return { checked: false, indeterminate: false, total: values.length, selected: 0 };
    }

    const visibleValues = getVisibleCategoryValues(item);
    const selected = visibleValues.length;
    return {
        checked: values.length > 0 && selected === values.length,
        indeterminate: selected > 0 && selected < values.length,
        total: values.length,
        selected
    };
}

export function setAllCategoryValuesVisible(item, isVisible) {
    if (item?.styleMode !== 'categorized' || !item.categoryField) return;
    item.categoryVisibleValues = isVisible ? [...(item.categoryValues || [])] : [];
}

export function getUserMapGeometryType(item) {
    return item?.geometryType === 'marker' || item?.geometryType === 'line' || item?.geometryType === 'polygon'
        ? item.geometryType
        : 'polygon';
}

export function getUserMapFeatureUnitLabel(item) {
    const geometryType = getUserMapGeometryType(item);
    if (geometryType === 'marker') return '점';
    if (geometryType === 'line') return '선';
    return '면';
}

export function getUserMapListMetaText(item) {
    const parts = [getUserMapLabel(item)];
    if (item.type !== 'shp' && item.url) parts.push(escapeHtml(item.url));
    if (item.featureCount) parts.push(`${item.featureCount}개의 ${getUserMapFeatureUnitLabel(item)}`);
    if (item.styleMode === 'categorized' && item.categoryField) parts.push(`${escapeHtml(item.categoryField)} 분류`);
    return parts.join(' / ');
}

export function getDefaultCategoryStyle(item, index = 0) {
    const palette = ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#0891b2', '#ca8a04', '#4b5563'];
    const color = palette[index % palette.length];
    const base = getUserMapStyle(item);
    return {
        ...base,
        color,
        fillColor: color,
        customColor: color,
        customFillColor: color,
        customStrokeColor: null
    };
}
