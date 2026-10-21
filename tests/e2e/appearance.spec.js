import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

async function openSettings(page) {
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
    await page.locator('#btn-settings').click();
    await expect(page.locator('#settings-appearance-row')).toBeVisible();
}
async function choose(page, label) {
    await page.locator('#settings-appearance-row').click();
    const modal = page.locator('#settings-choice-modal-overlay');
    await modal.getByLabel(label, { exact: true }).check();
    await expect(modal).toBeHidden();
}

test('화면 모드는 저장되고 기기 설정 모드에서만 시스템 변경을 즉시 따른다', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await openSettings(page);
    await expect(page.locator('#settings-appearance-value')).toHaveText('기기 설정에 따름');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await choose(page, '다크 모드');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.settings-section').first()).toHaveCSS('background-color', 'rgb(23, 34, 53)');
    await page.locator('#settings-appearance-row').click();
    await expect(page.locator('#settings-choice-list input')).toHaveCount(3);
    await page.screenshot({ animations: 'disabled', path: 'test-results/appearance-settings-dark.png' });
    await page.evaluate(() => window.closeSettingsChoiceModal());
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await openSettings(page);
    await expect(page.locator('#settings-appearance-value')).toHaveText('다크 모드');
    await choose(page, '라이트 모드');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await openSettings(page);
    await expect(page.locator('#settings-appearance-value')).toHaveText('라이트 모드');
    await page.screenshot({ animations: 'disabled', path: 'test-results/appearance-settings-light.png' });
    await choose(page, '기기 설정에 따름');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('setting_appearance_mode'))).toBe('system');
});

test('다크 모드에서도 지도와 기록의 색상 및 스타일 적용은 유지된다', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    const mapFilter = await page.locator('#map').evaluate(el => getComputedStyle(el).filter);
    expect(mapFilter).toBe('none');
    await page.locator('#geoJsonInput').setInputFiles({
        name: 'theme.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify({type:'FeatureCollection', features:[{
            type:'Feature', geometry:{type:'LineString', coordinates:[[127,37],[127.01,37.01]]}, properties:{id:134050,name:'테마 검증',customColor:'#ff0000'}
        }]}))
    });
    await page.locator('#app-dialog-overlay .primary').click();
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-record').click();
    await expect(page.locator('#survey-list-area .survey-item')).toHaveCSS('background-color', 'rgb(23, 34, 53)');
    await expect(page.locator('#survey-list-area .survey-name')).toHaveCSS('color', 'rgb(228, 235, 245)');
    await page.locator('#survey-list-area .style-setting-btn').click();
    const modal = page.locator('#style-modal');
    await expect(modal).toHaveCSS('background-color', 'rgb(23, 34, 53)');
    await modal.getByRole('button', { name: '색상표 더보기', exact: true }).click();
    const red = modal.locator('.palette-basic-swatches .color-circle').first();
    await expect(red).toHaveCSS('background-color', 'rgb(255, 0, 0)');
    const green = modal.locator('.palette-basic-swatches .color-circle').nth(3);
    await expect(green).toHaveCSS('background-color', 'rgb(0, 255, 0)');
    await green.click();
    await page.locator('.style-modal-apply-btn').click();
    await expect(page.locator('#style-modal-overlay')).toBeHidden();
    await page.locator('#survey-list-area .style-setting-btn').click();
    await expect(modal.locator('#style-custom-color')).toHaveValue('#00ff00');
    await expect(modal).toBeInViewport();
    await page.screenshot({animations:'disabled',path:'test-results/appearance-style-dark.png'});
});

// Audit UI chrome rather than palette swatches or saved map/record colors.
async function expectDarkChrome(page, selector) {
    const problems = await page.locator(selector).evaluateAll(roots => {
        const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
        const luminance = values => values.slice(0, 3).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
        const issues = [];
        for (const root of roots) {
            const elements = [root, ...root.querySelectorAll('button, summary, label, .survey-name, .record-fab-label, .survey-group, .survey-group-items, .style-choice-options')];
            for (const el of elements) {
                if (!el.getBoundingClientRect().width || !el.getBoundingClientRect().height || el.closest('.color-circle') || el.matches(':disabled')) continue;
                const style = getComputedStyle(el), bg = rgb(style.backgroundColor);
                const name = `${el.tagName}.${el.className} ${el.textContent.trim().slice(0, 24)}`;
                if (bg.length >= 3 && (bg[3] ?? 1) > .8 && Math.min(...bg.slice(0, 3)) > 200) issues.push(`Light surface: ${name}`);
                if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || el.closest('.color-palette') && !el.matches('.palette-color-view-btn')) continue;
                let parent = el, backdrop;
                while (parent) {
                    const color = rgb(getComputedStyle(parent).backgroundColor);
                    if ((color[3] ?? 1) > .95) { backdrop = color; break; }
                    parent = parent.parentElement;
                }
                if (!backdrop) continue;
                const a = luminance(rgb(style.color)), b = luminance(backdrop);
                const contrast = (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
                if (contrast < 4.5) issues.push(`Text contrast ${contrast.toFixed(2)}: ${name}`);
            }
        }
        return [...new Set(issues)];
    });
    expect(problems).toEqual([]);
}

test('다크 모드의 사용자 지도명·기록 도구·스케일 선택 메뉴가 읽히고 흰 배경이 남지 않는다', async ({ page }) => {
    const { zip } = await import('@crmackey/shp-write');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
    await page.locator('#section-user-map > button').click();
    await page.locator('#user-map-name-input').fill('다크 지도명');
    const file = await zip({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'test_value'},geometry:{type:'Point',coordinates:[127,37]}}]});
    await page.locator('#user-map-file-input').setInputFiles({ name:'dark-map.zip', mimeType:'application/zip', buffer:Buffer.from(await file.arrayBuffer()) });
    await page.locator('#user-map-save-btn').click();
    await expect(page.locator('#user-map-modal-overlay')).toBeHidden();
    await expect(page.locator('#user-map-list .survey-name')).toHaveText('다크 지도명');
    await expectDarkChrome(page, '#user-map-list');
    await page.locator('#user-map-list .btn-more').click();
    const menu = page.locator('#user-map-action-panel');
    for (const item of await menu.locator('.more-menu-item').all()) {
        expect((await item.boundingBox()).height).toBe(44);
    }
    expect((await menu.boundingBox()).height).toBeLessThan(520);
    await expectDarkChrome(page, '#user-map-action-panel');
    await page.screenshot({animations:'disabled', path:'test-results/appearance-user-map-menu-dark.png'});
    await page.locator('#user-map-action-edit').click();
    await expect(page.locator('#user-map-name-input')).toHaveValue('다크 지도명');
    await page.locator('#user-map-cancel-btn').click();
    await expect(page.locator('#user-map-modal-overlay')).toBeHidden();
    await page.locator('#user-map-list .btn-more').click();
    await page.locator('#user-map-action-category').click();
    const category = page.locator('#user-map-category-modal-overlay');
    await expect(category).toBeVisible();
    await expectDarkChrome(page, '#user-map-category-modal-overlay > div');
    await expect(category.locator('.user-map-category-field-btn[data-field="name"]')).toBeVisible();
    await page.screenshot({animations:'disabled', path:'test-results/appearance-category-dark.png'});
    await category.locator('.user-map-category-field-btn[data-field="name"]').click();
    await page.locator('#app-dialog-overlay .primary').click();
    await expect(category).toBeHidden();
    await expect(page.locator('#user-map-list .user-map-category-rows .survey-name')).toHaveText('test_value');
    await page.screenshot({animations:'disabled', path:'test-results/appearance-user-map-dark.png'});
    await page.getByRole('button', {name:'메뉴 닫기',exact:true}).click();
    await page.locator('#record-fab-main').click();
    await expectDarkChrome(page, '.record-fab-group');
    await page.getByRole('button', {name:'지도 스케일 선택',exact:true}).click();
    await expectDarkChrome(page, '.scale-zoom-menu');
    await page.screenshot({animations:'disabled', path:'test-results/appearance-tools-dark.png'});
    await page.locator('.scale-zoom-menu-item[data-zoom="16"]').click();
    await page.getByRole('button', {name:'지도 스케일 선택',exact:true}).click();
    await expect(page.locator('.scale-zoom-menu-item.active')).toHaveAttribute('data-zoom','16');
});

test('그룹 들여쓰기와 면·선 설정의 펼친 옵션까지 다크 모드 대비를 유지한다', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#geoJsonInput').setInputFiles({name:'dark-group.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify({type:'FeatureCollection',features:[{
        type:'Feature',geometry:{type:'Polygon',coordinates:[[[127,37],[127.01,37],[127.01,37.01],[127,37]]]},properties:{id:134051,name:'그룹 안의 면',customColor:'#ff0000'}
    }]}))});
    await page.locator('#app-dialog-overlay .primary').click();
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-record').click();
    await page.locator('#record-selection-toggle').click();
    await page.locator('#survey-list-area input[type=checkbox]').check();
    await page.locator('#record-more-button').click();
    await page.locator('#add-selected-records-to-group').click();
    await page.locator('#record-group-select-list').getByRole('button',{name:'새 그룹 만들기',exact:true}).click();
    await page.locator('#app-dialog-overlay .primary').click();
    await expect(page.locator('#record-group-select-modal-overlay')).toBeHidden();
    await expectDarkChrome(page, '#survey-list-area');
    await page.screenshot({animations:'disabled', path:'test-results/appearance-group-dark.png'});
    await page.locator('#record-selection-toggle').click();
    await page.locator('#survey-list-area .style-setting-btn').click();
    const modal = page.locator('#style-modal');
    await modal.getByRole('button',{name:'색상표 더보기',exact:true}).click();
    await modal.getByRole('button',{name:'면 설정',exact:true}).click();
    await modal.getByLabel('면 채우기',{exact:true}).click();
    await expectDarkChrome(page, '#style-modal');
    await modal.getByRole('button',{name:'단색',exact:true}).click();
    await modal.getByRole('button',{name:'선 설정',exact:true}).click();
    await expectDarkChrome(page, '#style-modal');
    await modal.getByRole('button',{name:'다른 색상 선택',exact:true}).click();
    await modal.getByRole('button',{name:'색상표 더보기',exact:true}).click();
    await modal.getByLabel('선 모양',{exact:true}).click();
    await expectDarkChrome(page, '#style-modal');
    await modal.getByRole('button',{name:'색상표 더보기',exact:true}).click();
    await page.screenshot({animations:'disabled', path:'test-results/appearance-options-dark.png'});
    await modal.getByRole('button',{name:'파선',exact:true}).click();
    await page.locator('.style-modal-apply-btn').click();
    await expect(page.locator('#style-modal-overlay')).toBeHidden();
    await page.locator('#survey-list-area .style-setting-btn').click();
    await modal.getByRole('button',{name:'선 설정',exact:true}).click();
    await expect(modal.locator('#style-line-dropdown summary')).toContainText('파선');
});

test('검색 결과·라벨 설정·상세 메모도 다크 모드로 표시된다', async ({ page }) => {
    await page.emulateMedia({colorScheme:'dark'});
    await page.route('**/req/search?**', async route => {
        const callback = new URL(route.request().url()).searchParams.get('callback');
        await route.fulfill({contentType:'application/javascript',body:`${callback}(${JSON.stringify({response:{status:'OK',result:{items:[{title:'검색 결과 확인',address:{road:'테스트로 12',parcel:'테스트동 12'},point:{x:'127',y:'37'}},{title:'두 번째 결과',address:{road:'테스트로 13'},point:{x:'127.01',y:'37.01'}}]}}})})`});
    });
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#btn-search-toggle').click();
    await page.locator('#search-input-address').fill('테스트');
    await page.locator('#search-go-btn').click();
    await expect(page.locator('.search-result-title').first()).toContainText('검색 결과 확인');
    await expectDarkChrome(page, '.search-result-panel');
    await expect(page.locator('.search-result-title').first()).toHaveCSS('color','rgb(228, 235, 245)');
    await page.locator('#btn-search-toggle').click();
    await page.locator('#geoJsonInput').setInputFiles('tests/fixtures/photo-project.geojson');
    await page.locator('#app-dialog-overlay .primary').click();
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-record').click();
    await page.locator('.survey-item .btn-more').first().click();
    await page.locator('#record-menu-label').click();
    await expect(page.locator('#record-label-modal')).toBeVisible();
    await expectDarkChrome(page, '#record-label-modal > [role=dialog]');
    await page.screenshot({animations:'disabled', path:'test-results/appearance-label-dark.png'});
    await page.locator('#record-label-modal .label-cancel').click();
    await page.evaluate(() => window.editLayerDescription(1001));
    await expect(page.locator('#memo-modal-container')).toBeVisible();
    await expectDarkChrome(page, '#memo-modal-container');
    await expect(page.locator('#memo-input-textarea')).toHaveCSS('background-color','rgb(16, 26, 41)');
});


test('프로젝트와 기록 정렬 옵션은 다크 모드를 유지하고 선택한 방식을 저장한다', async ({ page }) => {
    await page.emulateMedia({colorScheme:'dark'});
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    for (const [open, overlayId, name, key] of [
        ['openProjectSortModal', 'project-sort-modal-overlay', 'project-sort-by', 'setting_project_sort_by'],
        ['openSortModal', 'sort-modal-overlay', 'sort-by', 'setting_sort_by']
    ]) {
        await page.evaluate(fn => window[fn](), open);
        const overlay = page.locator(`#${overlayId}`);
        await expect(overlay).toBeVisible();
        await expectDarkChrome(page, `#${overlayId} .sort-modal-options`);
        await overlay.locator(`input[name="${name}"][value="name"]`).check();
        await page.screenshot({animations:'disabled', path:`test-results/appearance-${name}-dark.png`});
        await overlay.getByRole('button',{name:'적용',exact:true}).click();
        await expect(overlay).toBeHidden();
        await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key)).toBe('name');
        await page.evaluate(fn => window[fn](), open);
        await expect(overlay.locator(`input[name="${name}"][value="name"]`)).toBeChecked();
        await overlay.getByRole('button',{name:'적용',exact:true}).click();
        await expect(overlay).toBeHidden();
    }
});
