/* ==========================================================================
   [모듈] 프로젝트 파일 데이터 규칙 (project-data-contract.js)
   [역할]
   - GeoJSON 프로젝트 파일에 기록 그룹과 내보내기 정보를 붙입니다.
   - 사진 Base64를 포함한 feature 속성은 변경하지 않고 그대로 보존합니다.
   ========================================================================== */

export function cloneRecordGroups(recordGroups) {
    if (!Array.isArray(recordGroups)) return [];
    return recordGroups
        .filter(group => group && typeof group === 'object' && group.id)
        .map(group => ({
            id: String(group.id),
            name: String(group.name || '그룹'),
            collapsed: Boolean(group.collapsed),
            createdAt: group.createdAt || new Date().toISOString()
        }));
}

// 기존 테스트와 외부 호출 이름을 유지합니다.
export const cloneRecordGroupsForExport = cloneRecordGroups;

function getRecordName(props, fallback = '') {
    const value = props?.name ?? props?.memo;
    if (value === undefined || value === null || value === '') return fallback;
    return String(value);
}

function ensureRecordNameAlias(props, fallback = '') {
    if (!props) return props;
    const name = getRecordName(props, fallback);
    if (name !== '') {
        props.name = name;
        props.memo = name;
    }
    return props;
}

/**
 * SHP/DBF에서 잘린 속성명과 문자열 타입을 앱의 표준 속성으로 정리합니다.
 * 내보내기에서는 기존 ID 보존을 위해 normalizeId: false를 사용할 수 있습니다.
 */
export function normalizeImportedFeatureProperties(feature, { normalizeId = true } = {}) {
    if (!feature || typeof feature !== 'object') return feature;
    const props = feature.properties || (feature.properties = {});

    const pickFirstDefined = (keys) => {
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(props, key)
                && props[key] !== undefined
                && props[key] !== null
                && props[key] !== '') {
                return props[key];
            }
        }
        return undefined;
    };

    const assignIfMissing = (targetKey, aliasKeys) => {
        if (props[targetKey] !== undefined && props[targetKey] !== null && props[targetKey] !== '') return;
        const value = pickFirstDefined(aliasKeys);
        if (value !== undefined) props[targetKey] = value;
    };

    assignIfMissing('customColor', ['customcolo', 'CUSTOMCOLO', 'customcolor', 'CUSTOMCOLOR', 'color', 'COLOR']);
    assignIfMissing('customEmoji', ['customemoj', 'CUSTOMEMOJ']);
    assignIfMissing('customMarkerSize', ['custommarke', 'CUSTOMMARKE']);
    assignIfMissing('customDashArray', ['customdash', 'CUSTOMDASH']);
    assignIfMissing('customWeight', ['customweig', 'CUSTOMWEIG', 'weight', 'WEIGHT']);
    assignIfMissing('customFillOpacity', ['customfill', 'CUSTOMFILL', 'fillopacit', 'FILLOPACIT']);
    assignIfMissing('description', ['descriptio', 'DESCRIPTIO']);
    assignIfMissing('name', ['name', 'NAME', 'memo', 'MEMO']);
    assignIfMissing('memo', ['memo', 'MEMO', 'name', 'NAME']);
    ensureRecordNameAlias(props);

    if (normalizeId) {
        const parsedId = Number(props.id);
        if (Number.isFinite(parsedId) && Number.isSafeInteger(parsedId) && parsedId > 0) {
            props.id = parsedId;
        } else {
            delete props.id;
        }
    }

    if (props.customMarkerSize !== undefined) {
        const parsed = parseInt(props.customMarkerSize, 10);
        if (!Number.isNaN(parsed)) props.customMarkerSize = Math.min(5, Math.max(1, parsed));
    }
    if (props.customWeight !== undefined) {
        const parsed = parseInt(props.customWeight, 10);
        if (!Number.isNaN(parsed)) props.customWeight = Math.min(5, Math.max(1, parsed));
    }
    if (props.customFillOpacity !== undefined) {
        const parsed = parseFloat(props.customFillOpacity);
        if (!Number.isNaN(parsed)) props.customFillOpacity = Math.min(1, Math.max(0, parsed));
    }

    if (typeof props.isHidden === 'string') {
        const value = props.isHidden.trim().toLowerCase();
        props.isHidden = value === 'true' || value === 't' || value === '1' || value === 'y';
    }
    if (typeof props.customFill === 'string') {
        const value = props.customFill.trim().toLowerCase();
        props.customFill = value === 'true' || value === 't' || value === '1' || value === 'y';
    }

    return feature;
}

export function ensureFeatureCollectionRecordNames(featureCollection, options = {}) {
    if (!featureCollection || !Array.isArray(featureCollection.features)) return featureCollection;
    featureCollection.features.forEach(feature => normalizeImportedFeatureProperties(feature, options));
    return featureCollection;
}

export function attachProjectExportMetadata(featureCollection, project, exportedAt = new Date().toISOString()) {
    if (!featureCollection || typeof featureCollection !== 'object') {
        throw new TypeError('유효한 GeoJSON FeatureCollection이 필요합니다.');
    }

    featureCollection.isProjectExport = true;
    featureCollection.projectName = String(project?.name || '');
    featureCollection.exportedAt = exportedAt;
    featureCollection.recordGroups = cloneRecordGroups(project?.recordGroups);
    return featureCollection;
}
