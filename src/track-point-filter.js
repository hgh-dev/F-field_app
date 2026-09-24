/* ==========================================================================
   [모듈] 트랙 좌표 필터 (track-point-filter.js)
   [역할]
   - GPS 응답 검증과 최소 이동거리 판정을 지도/Leaflet 코드와 분리합니다.
   ========================================================================== */

export function readTrackPoint(position) {
    const coords = position?.coords || position;
    const latitude = Number(coords?.latitude);
    const longitude = Number(coords?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

    return {
        latitude,
        longitude,
        accuracy: Number.isFinite(Number(coords?.accuracy))
            ? Number(coords.accuracy)
            : null,
        timestamp: Number.isFinite(Number(position?.timestamp))
            ? Number(position.timestamp)
            : Date.now()
    };
}

export function shouldAppendTrackPoint({ point, previousPoint, minimumDistanceMeters, distanceBetween }) {
    if (!point) return false;
    if (!previousPoint) return true;

    const distance = distanceBetween(
        previousPoint.latitude,
        previousPoint.longitude,
        point.latitude,
        point.longitude
    );

    return Number.isFinite(distance) && distance >= minimumDistanceMeters;
}
