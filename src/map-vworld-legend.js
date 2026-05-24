/* ==========================================================================
   [모듈] VWorld 주제도 범례 (map-vworld-legend.js)
   [역할]
   - VWorld WMS 주제도 레이어의 범례 이미지를 화면에 표시하거나 숨깁니다.
   - 현재 켜진 주제도에 맞는 GetLegendGraphic URL을 구성합니다.
   [참고]
   - 주제도 범례 표시가 안 되거나 잘못된 범례가 보일 때 확인합니다.
   ========================================================================== */
import { VWORLD_API_KEY } from './config.js';

// VWorld GetLegendGraphic 대상 레이어 매핑입니다.
// 동작 원리: 자연공원처럼 복수 레이어 타입은 배열로 묶어 순서대로 렌더링합니다.
const VWORLD_LEGEND_LAYERS = {
    restriction: ['lt_c_ud801'],
    steepSlope: ['lt_c_up401'],
    forest: ['lt_c_uf151'],
    heritage: ['lt_c_uo301'],
    citypark: ['lt_c_uq162'],
    forestry: ['lt_c_uf602'],
    envpreserve: ['lt_c_uq114'],
    cityzone: ['lt_c_uq111'],
    managezone: ['lt_c_uq112'],
    farmzone: ['lt_c_uq113'],
    baekdu: ['lt_c_uf901'],
    wetland: ['lt_c_wgisarwet'],
    wildlife: ['lt_c_um221'],
    watersource: ['lt_c_um710'],
    naturepark: ['lt_c_wgisnpgug', 'lt_c_wgisnpgun', 'lt_c_wgisnpdo'],
    cityroad: ['lt_c_upisuq151'],
    cityTransport: ['lt_c_upisuq152'],
    citySpace: ['lt_c_upisuq153'],
    cityPublicCulture: ['lt_c_upisuq155'],
    cityDisaster: ['lt_c_upisuq156'],
    cityEnvironment: ['lt_c_upisuq158'],
    landuse: ['lt_c_lhblpn'],
    bizzone: ['lt_c_lhzone'],
    industrialBoundary: ['lt_c_damdan'],
    industrialFacility: ['lt_c_damyoj'],
    industrialUsezone: ['lt_c_damyod'],
    industrialBusiness: ['lt_c_damyuch'],
    roadClass: ['lt_l_moctlink'],
    flightProhibit: ['lt_c_aisprhc'],
    flightRestrict: ['lt_c_aisresc'],
    forestSoil: ['lt_c_fsdifrsts'],
    hikingTrail: ['lt_l_frstclimb', 'lt_p_climball'],
};

/**
 * VWorld 레이어 범례 이미지를 표시/숨김 처리합니다.
 * 동작 원리: 첫 로드 때만 HTML을 생성하고, 이후에는 dataset.loaded 캐시를 재사용합니다.
 */
export function showVworldLegend(type, isChecked) {
    const legendEl = document.getElementById(`legend-${type}`);
    if (!legendEl) return;

    if (!isChecked) {
        legendEl.style.display = 'none';
        return;
    }

    const layers = VWORLD_LEGEND_LAYERS[type];
    if (!layers) return;

    // 이미 생성한 범례는 DOM 재생성 없이 display만 토글합니다.
    if (legendEl.dataset.loaded === '1') {
        legendEl.style.display = 'block';
        return;
    }

    legendEl.innerHTML = '';

    // iOS Safari/PWA에서 innerHTML + loading="lazy" 조합으로 범례 이미지가 누락되는 경우가 있어
    // DOM API로 직접 생성하고 eager 로딩으로 단순화합니다.
    layers.forEach(layerName => {
        const itemEl = document.createElement('div');
        itemEl.className = 'vworld-legend-item';

        const imgEl = document.createElement('img');
        imgEl.src = `https://api.vworld.kr/req/image?service=image&request=GetLegendGraphic&format=png&layer=${layerName}&style=${layerName}&type=ALL&key=${VWORLD_API_KEY}`;
        imgEl.alt = `${layerName} 범례`;
        imgEl.loading = 'eager';
        imgEl.decoding = 'async';
        imgEl.addEventListener('error', () => {
            itemEl.style.display = 'none';
        });

        itemEl.appendChild(imgEl);
        legendEl.appendChild(itemEl);
    });

    legendEl.dataset.loaded = '1';
    legendEl.style.display = 'block';
}
