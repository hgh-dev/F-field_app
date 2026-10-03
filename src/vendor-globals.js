/* ==========================================================================
   [모듈] 외부 라이브러리 전역 연결 (vendor-globals.js)
   [역할]
   - Leaflet, Leaflet.Draw, Turf, proj4 같은 외부 라이브러리를 import하고 기존 전역 사용 방식에 맞춥니다.
   - 오래된 코드가 L, turf, proj4 전역 객체를 계속 사용할 수 있도록 연결합니다.
   [참고]
   - 외부 라이브러리 import나 전역 객체 관련 오류가 생기면 확인합니다.
   ========================================================================== */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import area from '@turf/area';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import booleanWithin from '@turf/boolean-within';
import distance from '@turf/distance';
import flatten from '@turf/flatten';
import { point } from '@turf/helpers';
import length from '@turf/length';
import { proj4 } from './shp-crs.js';

// 핀치 중에는 기존 타일을 확대하고, 제스처가 끝난 배율에서 타일을 요청합니다.
// 중간 줌 레벨마다 요청/취소/교체가 반복되는 것을 막습니다. 사용자지도에도 적용합니다.
L.GridLayer.mergeOptions({ updateWhenZooming: false });
const gridLayerGetEvents = L.GridLayer.prototype.getEvents;
L.GridLayer.include({
    getEvents() {
        const events = gridLayerGetEvents.call(this);
        // Leaflet 1.9는 핀치가 정확히 정수 배율에서 끝나면 마지막 zoom을 생략합니다.
        // zoomend에서도 갱신해야 이전 배율의 타일에 머무르지 않습니다.
        if (!this.options.updateWhenZooming) events.zoomend = this._resetView;
        return events;
    }
});

const turf = {
    area,
    booleanPointInPolygon,
    booleanWithin,
    distance,
    flatten,
    length,
    point
};

window.L = L;
window.turf = turf;
window.proj4 = proj4;

// Leaflet.Draw의 UMD 번들은 실행 시점에 window.L을 바로 참조합니다.
// 정적 import로 두면 번들러가 이 대입보다 먼저 실행할 수 있으므로 순서를 명시합니다.
await import('leaflet-draw');

export { L, turf, proj4 };
