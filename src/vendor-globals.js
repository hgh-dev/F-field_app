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
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import area from '@turf/area';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import booleanWithin from '@turf/boolean-within';
import distance from '@turf/distance';
import flatten from '@turf/flatten';
import { point } from '@turf/helpers';
import length from '@turf/length';
import proj4 from 'proj4';

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

export { L, turf, proj4 };
