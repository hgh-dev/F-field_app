import { test, expect } from '@playwright/test';

// Check actual layout and existing entry points across responsive transitions.
test('사이드바는 모바일 전체 화면과 PC 도킹에서 같은 세로 탐색을 유지한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
    const sidebar = page.locator('.sidebar-content');
    await expect(page.locator('#sidebar-overlay')).toHaveClass(/visible/);
    await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(390);
    const rail = page.locator('.sidebar-rail');
    for (const id of ['tab-btn-map', 'tab-btn-project', 'tab-btn-record', 'btn-notice', 'btn-settings']) {
        await expect(rail.locator(`#${id}`)).toBeVisible();
        await expect(rail.locator(`#${id}`)).toBeInViewport();
    }
    await page.locator('#tab-btn-record').click();
    await expect(page.locator('#sidebar-panel-title')).toHaveText('기록 관리');
    await expect(page.locator('#content-record')).toBeVisible();
    await expect(page.locator('#tab-btn-record')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#tab-btn-project').click();
    await expect(page.locator('#content-project')).toBeVisible();
    await page.locator('#btn-settings').click();
    await expect(page.locator('#settings-modal-overlay')).toBeVisible();
    await page.evaluate(() => window.closeSettingsModal());
    await expect(page.locator('#settings-modal-overlay')).toBeHidden();
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
    await expect(page.locator('#sidebar-overlay')).toHaveClass(/visible/);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('body')).toHaveClass(/sidebar-docked-open/);
    await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(424);
    await expect.poll(async () => Math.round((await page.locator('#map').boundingBox()).x)).toBe(424);
    await page.setViewportSize({ width: 320, height: 740 });
    await expect(page.locator('body')).not.toHaveClass(/sidebar-docked-open/);
    await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(320);
    await expect(page.locator('#btn-settings')).toBeInViewport();
    await page.getByRole('button', { name: '메뉴 닫기', exact: true }).click();
    await expect(page.locator('#sidebar-overlay')).toBeHidden();
});

test('기록 상세의 이름·주소·측정값·메모와 기존 편집 메뉴가 유지된다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#geoJsonInput').setInputFiles({
        name: 'detail-refresh.geojson', mimeType: 'application/geo+json',
        buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [{
            type: 'Feature', geometry: { type: 'LineString', coordinates: [[127, 37], [127.001, 37.001]] },
            properties: { id: 134001, name: '<기록명>', address: '시험리 123-4', description: '<메모> & 현장 확인' }
        }] }))
    });
    await page.locator('#app-dialog-overlay .primary').click();
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-record').click();
    await page.locator('.survey-info').filter({ hasText: '<기록명>' }).click();
    const sheet = page.locator('#bottom-sheet');
    await expect(sheet).toHaveClass(/full-open/);
    await expect(sheet.locator('.sheet-record-title')).toHaveText('<기록명>');
    await expect(sheet.locator('.badge-length')).toHaveText('길이');
    await expect(sheet.locator('.sheet-metric-value')).toContainText('m');
    await expect(sheet.locator('.sheet-memo')).toHaveText('<메모> & 현장 확인');
    await expect(sheet).toContainText('시험리 123-4');
    await sheet.locator('#bottom-sheet-handle').click();
    await expect(sheet).not.toHaveClass(/full-open/);
    await expect(sheet.locator('.sheet-memo')).not.toBeInViewport();
    await sheet.locator('#bottom-sheet-handle').click();
    await expect(sheet).toHaveClass(/full-open/);
    await expect(sheet.getByRole('button', { name: '기록명 수정', exact: true })).toBeVisible();
    await page.locator('#bottom-sheet-more-btn').click();
    await expect(page.locator('#bottom-sheet-more-menu').getByText('스타일 설정', { exact: true })).toBeVisible();
    await expect(page.locator('#bottom-sheet-label-item')).toBeVisible();
    await page.locator('#bottom-sheet-close').click();
    await expect(sheet).not.toHaveClass(/\bopen\b/);
});

test('위치 조회의 주소·좌표와 점 저장 동작을 유지한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/req/address?**', async route => {
        const callback = new URL(route.request().url()).searchParams.get('callback');
        await route.fulfill({ contentType: 'application/javascript', body: `${callback}(${JSON.stringify({ response: { status: 'OK', result: [
            { type: 'parcel', text: '경기도 예시시 시험리 123-4', zipcode: '12345' },
            { type: 'road', text: '경기도 예시시 시험로 12', zipcode: '12345' }
        ] } })})` });
    });
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.evaluate(() => window.showInfoPopup(37.5665, 126.978));
    const sheet = page.locator('#bottom-sheet');
    await expect(sheet).toContainText('경기도 예시시 시험리 123-4');
    await expect(sheet).toContainText('경기도 예시시 시험로 12');
    await expect(sheet).toContainText('12345');
    await expect(sheet.locator('.badge-coord')).toHaveText('좌표');
    await expect(page.locator('#bottom-sheet-more-btn')).toBeHidden();
    for (const name of ['점 기록', '면 기록', '공유', '검색', '길찾기']) {
        await expect(sheet.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await sheet.getByRole('button', { name: '점 기록', exact: true }).click();
    await expect(page.locator('#app-dialog-overlay')).toBeVisible();
    await page.locator('#app-dialog-overlay .primary').click();
    await expect(page.locator('#survey-list-area .survey-item')).toHaveCount(1);
});

test('지도 눈 아이콘은 레이어 표시와 배경지도 단일 선택을 유지한다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
    await expect(page.locator('.sidebar-rail-back').getByRole('button', { name: '메뉴 닫기' })).toBeVisible();
    const base = page.locator('#chk-base-layer');
    const eye = base.locator('..').locator('.eye-on');
    await expect(base).toBeChecked();
    await expect(eye).toBeVisible();
    await base.click();
    await expect(base).not.toBeChecked();
    await expect(base.locator('..').locator('.eye-off')).toBeVisible();
    await base.click();
    await expect(eye).toBeVisible();
    await page.locator('#section-base-map .map-layer-toggle').first().click();
    await page.locator('input[name="baseMap"][value="base"]').check();
    await expect(page.locator('input[name="baseMap"]:checked')).toHaveCount(1);
    await expect(page.locator('input[name="baseMap"][value="base"]')).toBeChecked();
    await page.locator('input[name="baseMap"][value="esri"]').check();
    await expect(page.locator('input[name="baseMap"][value="base"]')).not.toBeChecked();
    for (const selector of ['#section-base-map .map-layer-name', '.topic-map-groups .map-layer-name']) {
        for (const name of await page.locator(selector).all()) await expect(name).toHaveCSS('font-size', '14px');
    }
});

test('확대된 기록 버튼과 스케일 메뉴에서 기존 도구·확대 동작을 유지한다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    const fab = page.locator('#record-fab-main');
    expect((await fab.boundingBox()).width).toBeGreaterThan((await page.locator('#btn-search-toggle').boundingBox()).width);
    await fab.click();
    for (const id of ['btn-poly', 'btn-line', 'btn-point']) await expect(page.locator(`#${id}`)).toBeVisible();
    await page.locator('#btn-point').click();
    await expect(fab).toHaveClass(/is-recording/);
    await expect(page.locator('#record-fab')).not.toHaveClass(/expanded/);
    await page.locator('#action-toolbar button[onclick="cancelDrawing()"]').click();
    await page.locator('#app-dialog-overlay .primary').click();
    const scale = page.getByRole('button', { name: '지도 스케일 선택', exact: true });
    await scale.click();
    const level = page.locator('.scale-zoom-menu-item[data-zoom="17"]');
    await expect(level).toBeVisible();
    await level.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.scale-zoom-control')).not.toHaveClass(/menu-open/);
    await scale.click();
    await expect(page.locator('.scale-zoom-menu-item.active')).toHaveAttribute('data-zoom', '17');
});
