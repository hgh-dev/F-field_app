// 레이어별 독립 스냅샷을 비교해 단순 저장으로 수정 시각이 바뀌는 것을 막습니다.
const snapshots = new WeakMap();
const ignoredProperties = new Set(['id', 'createdAt', 'updatedAt', 'displayOrder', 'memo', 'MEMO']);

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
    }
    return value;
}

function contentSignature(feature) {
    const properties = Object.fromEntries(Object.entries(feature.properties || {})
        .filter(([key]) => !ignoredProperties.has(key)));
    return JSON.stringify(canonicalize({ geometry: feature.geometry, properties }));
}

// 복원한 기록은 원래 시각을 보존합니다. 시각이 없는 파일의 생성일은 추측하지 않습니다.
export function rememberRecordTimestamps(layer) {
    const feature = layer.toGeoJSON();
    snapshots.set(layer, {
        signature: contentSignature(feature),
        createdAt: feature.properties?.createdAt,
        updatedAt: feature.properties?.updatedAt
    });
}

export function updateRecordTimestamps(layer, now = new Date().toISOString()) {
    const props = layer.feature.properties;
    const previous = snapshots.get(layer);
    const signature = contentSignature(layer.toGeoJSON());
    if (!previous) {
        props.createdAt = now;
        props.updatedAt = now;
    } else {
        if (previous.createdAt === undefined) delete props.createdAt;
        else props.createdAt = previous.createdAt;
        if (signature !== previous.signature) props.updatedAt = now;
        else if (previous.updatedAt === undefined) delete props.updatedAt;
        else props.updatedAt = previous.updatedAt;
    }
    snapshots.set(layer, { signature, createdAt: props.createdAt, updatedAt: props.updatedAt });
}
