/* ==========================================================================
   [모듈] 사용자지도 목록 렌더링 (user-maps/render-list.js)
   [역할]
   - 사이드바의 사용자지도 목록 HTML을 생성합니다.
   - 표시 체크박스, 유형 라벨, 스타일 버튼, 카테고리 선택 상태를 화면에 반영합니다.
   [참고]
   - 사용자지도 목록 표시나 항목 UI가 이상할 때 확인합니다.
   ========================================================================== */
import { SVG_ICONS } from '../config.js';
import { escapeHtml, escapeJsString } from './utils.js';

export function renderUserMapListView(userMaps, helpers = {}) {
    const list = document.getElementById('user-map-list');
    if (!list) return;

    if (userMaps.length === 0) {
        list.innerHTML = '<div style="font-size:11px; color:#888; padding:2px 0 0 0;">추가된 사용자 지도가 없습니다.</div>';
        return;
    }

    list.innerHTML = [...userMaps].slice().reverse().map(item => {
        const selectionState = helpers.getCategorySelectionState(item);
        const checked = selectionState.checked ? 'checked' : '';
        const indeterminate = selectionState.indeterminate ? 'true' : 'false';
        const escapedIdArg = escapeHtml(escapeJsString(item.id));
        const styleBtnHTML = helpers.createUserMapStyleButton(item);
        const categoryRowsHTML = item.styleMode === 'categorized'
            ? createUserMapCategoryRows(item, helpers)
            : '';
        const hasSubmenu = !!categoryRowsHTML;
        const toggleClass = `map-layer-toggle${hasSubmenu ? ' expanded' : ' disabled'}`;
        const toggleAttrs = hasSubmenu
            ? `aria-label="하위 메뉴 접기" onclick="toggleUserMapCategoryRows('${escapedIdArg}', event)"`
            : 'aria-hidden="true" tabindex="-1"';
        const infoClick = hasSubmenu
            ? `toggleUserMapCategoryRows('${escapedIdArg}', event)`
            : `fitUserMapToBounds('${escapedIdArg}', event)`;
        const infoCursor = hasSubmenu ? 'cursor:pointer;' : '';
        return `
            <div class="user-map-item" data-user-map-id="${escapeHtml(item.id)}" style="border-bottom:1px solid #f0f0f0;">
                <div class="survey-item" style="border-bottom:none;">
                    <button type="button" class="${toggleClass}" ${toggleAttrs}>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l10-7z"/></svg>
                    </button>
                    <input type="checkbox" class="survey-checkbox user-map-parent-checkbox" data-indeterminate="${indeterminate}" ${checked} onclick="event.stopPropagation()" onchange="toggleUserMapLayer('${escapedIdArg}', this.checked)">
                    ${styleBtnHTML}
                    <div class="survey-info" style="${infoCursor}" onclick="${infoClick}">
                        <div class="survey-name">${escapeHtml(item.name)}</div>
                        <div style="font-size:11px; color:#888; margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${helpers.getUserMapListMetaText(item)}</div>
                    </div>
                    <div class="survey-actions">
                        <button type="button" class="btn-more" title="더보기" onclick="selectUserMap('${item.id}', event)">${SVG_ICONS.more}</button>
                    </div>
                </div>
                ${categoryRowsHTML}
            </div>
        `;
    }).join('');
    list.querySelectorAll('.user-map-parent-checkbox').forEach(checkbox => {
        checkbox.indeterminate = checkbox.dataset.indeterminate === 'true';
    });
}


function createUserMapCategoryRows(item, helpers) {
    const values = Array.isArray(item.categoryValues) ? item.categoryValues : [];
    if (!values.length) return '';
    const visibleValues = helpers.getVisibleCategoryValues(item);

    return `
        <div class="user-map-category-rows" style="display:block;">
            ${values.map(value => {
        const style = item.categoryStyles?.[value] || helpers.getDefaultCategoryStyle(item, 0);
        const checked = visibleValues.includes(value) ? 'checked' : '';
        const escapedIdArg = escapeHtml(escapeJsString(item.id));
        const escapedValueArg = escapeHtml(escapeJsString(value));
        const styleBtn = helpers.createShpStyleButton(
            item,
            style,
            `openUserMapCategoryStyleSettings('${escapeJsString(item.id)}', '${escapeJsString(value)}', event)`
        );
        return `
                    <div class="survey-item map-layer-row-depth-3" style="border-bottom:none;">
                        <button type="button" class="map-layer-toggle disabled" aria-hidden="true" tabindex="-1">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l10-7z"/></svg>
                        </button>
                        <input type="checkbox" class="survey-checkbox" ${checked} onclick="event.stopPropagation()" onchange="toggleUserMapCategoryValue('${escapedIdArg}', '${escapedValueArg}', this.checked, event)">
                        ${styleBtn}
                        <div class="survey-info">
                            <div class="survey-name">${escapeHtml(helpers.getCategoryValueLabel(value))}</div>
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `;
}

