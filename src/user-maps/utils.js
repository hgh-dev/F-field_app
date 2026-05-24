/* ==========================================================================
   [모듈] 사용자지도 공통 유틸 (user-maps/utils.js)
   [역할]
   - 사용자지도 유형 판별, 라벨 생성, HTML 이스케이프, URL 정규화, WMS URL 파싱을 제공합니다.
   - user-maps 하위 파일들이 반복해서 쓰는 작은 보조 함수를 모아둡니다.
   [참고]
   - 사용자지도 입력값 처리나 표시 문자열이 이상할 때 확인합니다.
   ========================================================================== */
export function isTileUserMapType(type) {
    return ['xyz', 'wms', 'pmtiles', 'mbtiles'].includes(type);
}

export function getUserMapLabel(item) {
    const typeLabels = {
        xyz: 'XYZ',
        wms: 'WM(T)S',
        pmtiles: 'PMTiles',
        mbtiles: 'MBTiles',
        shp: 'SHP'
    };
    return typeLabels[item.type] || item.type;
}

export function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

export function escapeJsString(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

export function normalizeUrl(value) {
    return String(value || '').trim();
}

export function inferUserMapType(url) {
    const lower = url.toLowerCase().split('?')[0];
    if (lower.endsWith('.pmtiles')) return 'pmtiles';
    if (lower.endsWith('.mbtiles')) return 'mbtiles';
    if (url.toLowerCase().includes('service=wms') || url.toLowerCase().includes('/wms')) return 'wms';
    return 'xyz';
}

export function parseWmsUrl(inputUrl) {
    const parsed = new URL(inputUrl, window.location.href);
    const params = parsed.searchParams;
    const layers = params.get('layers') || params.get('LAYERS') || '';
    const styles = params.get('styles') || params.get('STYLES') || '';
    const format = params.get('format') || params.get('FORMAT') || 'image/png';
    const version = params.get('version') || params.get('VERSION') || '1.3.0';
    const transparent = (params.get('transparent') || params.get('TRANSPARENT') || 'true').toLowerCase() !== 'false';
    ['service', 'SERVICE', 'request', 'REQUEST', 'layers', 'LAYERS', 'styles', 'STYLES', 'format', 'FORMAT', 'transparent', 'TRANSPARENT', 'version', 'VERSION', 'width', 'WIDTH', 'height', 'HEIGHT', 'bbox', 'BBOX', 'crs', 'CRS', 'srs', 'SRS'].forEach(key => params.delete(key));
    return {
        baseUrl: parsed.origin + parsed.pathname + (params.toString() ? `?${params.toString()}` : ''),
        layers,
        styles,
        format,
        version,
        transparent
    };
}

