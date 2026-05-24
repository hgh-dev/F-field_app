/* ==========================================================================
   [모듈] 사이드바 레이아웃 (ui-sidebar.js)
   [역할]
   - 앱 좌측/하단 사이드바 열기, 닫기, 탭 전환, 지도 크기 갱신을 관리합니다.
   - 지도 레이어 탭과 프로젝트/기록 탭이 들어가는 기본 패널 구조를 제어합니다.
   [참고]
   - 사이드바 위치, 탭 전환, 지도 리사이즈 문제가 생기면 확인합니다.
   ========================================================================== */
import { AppState } from './state.js';
import { currentEditLayerId } from './draw.js';
import { map, vworldBase, vworldSatellite, vworldHybrid, esriSatelliteLayer, vworldLxLayer, vworldContinuousLayer, toggleOverlay } from './map.js';
import { renderProjectList, renderSurveyList } from './ui-project.js';

export function isDockedSidebarViewport() {
    return window.matchMedia('(min-width: 1024px) and (orientation: landscape)').matches;
}

export function refreshMapAfterSidebarLayout() {
    setTimeout(() => map.invalidateSize({ animate: false }), 310);
}

/* --------------------------------------------------------------------------
   1. 사이드바 제어 (Sidebar)
   -------------------------------------------------------------------------- */
/* 1-1. 열기 및 닫기 */

/**
 * [함수] openSidebar
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openSidebar() {
    if (AppState.currentDrawer || currentEditLayerId !== null) return;
    syncSidebarUI();
    renderSurveyList();
    const overlay = document.getElementById('sidebar-overlay');
    document.body.classList.toggle('sidebar-docked-open', isDockedSidebarViewport());
    overlay.style.display = 'block';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
    refreshMapAfterSidebarLayout();
}

/**
 * [함수] closeSidebar
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 대상 UI에서 visible 클래스를 먼저 제거해 닫힘 전환을 시작하고,
 *        지연 후 display를 none으로 바꿔 클릭 영역과 임시 상태를 정리한다.
 */
export function closeSidebar() {
    const overlay = document.getElementById('sidebar-overlay');
    overlay.classList.remove('visible');
    document.body.classList.remove('sidebar-docked-open');
    refreshMapAfterSidebarLayout();
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/* 1-2. 탭 전환 및 UI 동기화 */
/**
 * [함수] syncSidebarUI
 * [역할] 해당 기능의 UI 상태와 데이터 흐름을 제어한다.
 * [원리] 입력 인자와 현재 상태를 먼저 검증한 뒤 안전한 분기 경로를 고르고,
 *        필요한 UI 갱신·저장·후속 호출을 순차 실행해 상태 일관성을 유지한다.
 */
export function syncSidebarUI() {
    const hasBase = map.hasLayer(vworldBase);
    const hasSat = map.hasLayer(vworldSatellite);
    const hasEsri = map.hasLayer(esriSatelliteLayer);

    const chkBase = document.getElementById('chk-base-layer');
    if (chkBase) chkBase.checked = (hasBase || hasSat || hasEsri);

    const baseSat = document.querySelector('input[name="baseMap"][value="satellite"]');
    const baseEsri = document.querySelector('input[name="baseMap"][value="esri"]');
    const baseBase = document.querySelector('input[name="baseMap"][value="base"]');

    if (hasSat && baseSat) baseSat.checked = true;
    else if (hasEsri && baseEsri) baseEsri.checked = true;
    else if (hasBase && baseBase) baseBase.checked = true;

    const chkHybrid = document.getElementById('chk-hybrid');
    if (chkHybrid) chkHybrid.checked = map.hasLayer(vworldHybrid);

    const hasContinuous = map.hasLayer(vworldContinuousLayer);
    const hasLx = map.hasLayer(vworldLxLayer);
    const chkCadastral = document.getElementById('chk-cadastral');
    if (chkCadastral) chkCadastral.checked = (hasContinuous || hasLx);

    const cadLx = document.querySelector('input[name="cadastralMap"][value="lx"]');
    const cadCont = document.querySelector('input[name="cadastralMap"][value="continuous"]');

    if (hasLx && cadLx) cadLx.checked = true;
    else if (cadCont) cadCont.checked = true;

    toggleOverlay('cadastral', (hasContinuous || hasLx));

    enhanceMapLayerRows();
    enhanceMapSectionHeaders();
}

function getMapLayerToggleIconHtml() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l10-7z"/></svg>';
}

function getSectionToggleIconHtml() {
    return '<span class="section-toggle-triangle" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l10-7z"/></svg></span>';
}

function getMapLayerStylePlaceholderHtml() {
    return '<svg viewBox="3 3 18 18" aria-hidden="true"><path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/></svg>';
}

function getMapLayerGroupPlaceholderHtml() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h13v10H7V4zm-3 3h2v8h11v2H4V7zm-3 3h2v8h11v2H1V10z"/></svg>';
}

function getMapLayerAccordionTarget(row, accordionHeader) {
    const onclick = accordionHeader?.getAttribute('onclick') || '';
    const match = onclick.match(/toggleAccordion\('([^']+)'/);
    if (match) return document.getElementById(match[1]);
    return null;
}

function isLegendOnlySubmenu(submenu) {
    return !!submenu?.classList?.contains('vworld-legend');
}

function getStaticMapLayerMetaText(control, hasGroupSubmenu) {
    if (!control || hasGroupSubmenu) return '';

    if (control.name === 'baseMap') {
        return control.value === 'esri' ? 'XYZ / Esri' : 'WM(T)S / V-World';
    }

    if (control.name === 'cadastralMap') {
        return 'WM(T)S / V-World';
    }

    if (control.id?.startsWith('chk-')) {
        return 'WM(T)S / V-World';
    }

    return '';
}

function toggleMapLayerSubmenu(content, toggleButton) {
    if (!content || toggleButton?.classList.contains('disabled')) return;
    const isVisible = window.getComputedStyle(content).display === 'block';
    content.style.display = isVisible ? 'none' : 'block';
    toggleButton.classList.toggle('expanded', !isVisible);
}

function getStaticMapLayerOpacityId(control) {
    if (!control) return null;
    if (control.name === 'baseMap') {
        if (control.value === 'satellite') return 'baseSatellite';
        if (control.value === 'esri') return 'baseEsri';
        if (control.value === 'base') return 'baseBase';
    }
    if (control.name === 'cadastralMap') {
        if (control.value === 'continuous') return 'cadastralContinuous';
        if (control.value === 'lx') return 'cadastralLx';
    }

    const idMap = {
        'chk-hybrid': 'hybrid',
        'chk-admin': 'admin',
        'chk-cityzone': 'cityzone',
        'chk-managezone': 'managezone',
        'chk-farmzone': 'farmzone',
        'chk-envpreserve': 'envpreserve',
        'chk-restriction': 'restriction',
        'chk-forest': 'forest',
        'chk-heritage': 'heritage',
        'chk-citypark': 'citypark',
        'chk-forestry': 'forestry',
        'chk-baekdu': 'baekdu',
        'chk-wetland': 'wetland',
        'chk-wildlife': 'wildlife',
        'chk-watersource': 'watersource',
        'chk-naturepark': 'naturepark',
        'chk-steep-slope': 'steepSlope',
        'chk-cityroad': 'cityroad',
        'chk-city-transport': 'cityTransport',
        'chk-city-space': 'citySpace',
        'chk-city-public-culture': 'cityPublicCulture',
        'chk-city-disaster': 'cityDisaster',
        'chk-city-environment': 'cityEnvironment',
        'chk-bizzone': 'bizzone',
        'chk-landuse': 'landuse',
        'chk-industrial-boundary': 'industrialBoundary',
        'chk-industrial-facility': 'industrialFacility',
        'chk-industrial-usezone': 'industrialUsezone',
        'chk-industrial-business': 'industrialBusiness',
        'chk-road-class': 'roadClass',
        'chk-flight-prohibit': 'flightProhibit',
        'chk-flight-restrict': 'flightRestrict',
        'chk-forest-soil': 'forestSoil',
        'chk-hiking-trail': 'hikingTrail'
    };
    return idMap[control.id] || null;
}

function enhanceMapLayerRows() {
    const rows = document.querySelectorAll('#content-map .option-row');
    rows.forEach(row => {
        if (row.dataset.mapUiEnhanced === 'true') return;
        if (row.closest('#user-map-list')) return;

        const control = Array.from(row.children).find(child => child.matches?.('input[type="checkbox"], input[type="radio"]'));
        if (!control) return;

        const accordionHeader = Array.from(row.children).find(child => child.classList?.contains('accordion-header'));
        const staticIcon = Array.from(row.children).find(child => child.classList?.contains('static-icon'));
        const labelSpan = accordionHeader
            ? Array.from(accordionHeader.children).find(child => child.tagName === 'SPAN' && !child.classList.contains('toggle-icon'))
            : Array.from(row.children).find(child => child.tagName === 'SPAN' && !child.classList.contains('static-icon'));

        if (!labelSpan) return;

        const submenu = control.type === 'checkbox' ? getMapLayerAccordionTarget(row, accordionHeader) : null;
        const toggleButton = document.createElement('button');
        toggleButton.type = 'button';
        toggleButton.className = `map-layer-toggle${submenu ? '' : ' disabled'}`;
        toggleButton.innerHTML = getMapLayerToggleIconHtml();
        toggleButton.setAttribute('aria-label', submenu ? '하위 메뉴 펼치기' : '');
        if (submenu && window.getComputedStyle(submenu).display === 'block') {
            toggleButton.classList.add('expanded');
        }
        if (submenu) {
            const syncToggleState = () => {
                const isExpanded = window.getComputedStyle(submenu).display === 'block';
                toggleButton.classList.toggle('expanded', isExpanded);
                toggleButton.setAttribute('aria-label', isExpanded ? '하위 메뉴 접기' : '하위 메뉴 펼치기');
            };
            new MutationObserver(syncToggleState).observe(submenu, { attributes: true, attributeFilter: ['style', 'class'] });
        }
        toggleButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            toggleMapLayerSubmenu(submenu, toggleButton);
        });

        const opacityId = getStaticMapLayerOpacityId(control);
        const stylePlaceholder = document.createElement(opacityId ? 'button' : 'span');
        stylePlaceholder.className = opacityId ? 'map-layer-style-placeholder style-setting-btn' : 'map-layer-style-placeholder';
        const isGroupLayer = !!submenu && !isLegendOnlySubmenu(submenu);
        if (isGroupLayer) stylePlaceholder.classList.add('group-icon');
        stylePlaceholder.innerHTML = isGroupLayer ? getMapLayerGroupPlaceholderHtml() : getMapLayerStylePlaceholderHtml();
        if (opacityId) {
            stylePlaceholder.type = 'button';
            stylePlaceholder.title = '스타일 설정';
            stylePlaceholder.setAttribute('aria-label', '스타일 설정');
            stylePlaceholder.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                window.openMapTileOpacitySettings?.(opacityId, event);
            });
        }

        accordionHeader?.remove();
        staticIcon?.remove();
        const textWrap = document.createElement('span');
        textWrap.className = 'map-layer-text';
        labelSpan.classList.add('map-layer-name');
        labelSpan.removeAttribute('style');
        textWrap.appendChild(labelSpan);
        const metaText = getStaticMapLayerMetaText(control, isGroupLayer);
        if (metaText) {
            const metaEl = document.createElement('span');
            metaEl.className = 'map-layer-meta';
            metaEl.textContent = metaText;
            textWrap.appendChild(metaEl);
        }
        if (submenu) {
            labelSpan.style.cursor = 'pointer';
            labelSpan.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                toggleMapLayerSubmenu(submenu, toggleButton);
            });
        }

        row.classList.add('map-layer-row');
        if (control.type === 'radio') row.classList.add('map-layer-row-depth-3');
        if (row.parentElement?.closest('.topic-map-groups') && !row.parentElement.classList.contains('topic-map-groups')) {
            row.classList.add('map-layer-row-depth-3');
        }
        row.prepend(toggleButton);
        toggleButton.after(control);
        control.after(stylePlaceholder);
        stylePlaceholder.after(textWrap);
        row.dataset.mapUiEnhanced = 'true';
    });
}

function enhanceMapSectionHeaders() {
    document.querySelectorAll('#content-map .menu-title.accordion-header').forEach(header => {
        if (header.dataset.sectionUiEnhanced === 'true') return;
        header.querySelector('.toggle-icon')?.remove();
        header.insertAdjacentHTML('afterbegin', getSectionToggleIconHtml());
        header.dataset.sectionUiEnhanced = 'true';
    });
}

/**
 * [함수] switchSidebarTab
 * [역할] 활성 대상(탭/모드)을 바꾸고 연관 UI를 동기화한다.
 * [원리] 선택된 탭/모드 값을 기준으로 active 클래스와 표시 대상을 재설정하고,
 *        필요한 후속 렌더링 함수를 호출해 화면과 상태가 같은 기준을 보게 만든다.
 */
export function switchSidebarTab(tabName) {
    // 모든 탭 버튼과 콘텐츠 비활성화
    ['map', 'project', 'record'].forEach(t => {
        const btn = document.getElementById('tab-btn-' + t);
        const content = document.getElementById('content-' + t);
        if (btn) btn.classList.remove('active');
        if (content) content.classList.remove('active');
    });

    const activeBtn = document.getElementById('tab-btn-' + tabName);
    const activeContent = document.getElementById('content-' + tabName);
    if (activeBtn) activeBtn.classList.add('active');
    if (activeContent) activeContent.classList.add('active');

    // 프로젝트 탭 열 때 목록 렌더링
    if (tabName === 'project') {
        renderProjectList();
    }
}

