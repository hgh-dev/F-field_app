import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function prepare(page, type = '점', styles = false) {
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#geoJsonInput').setInputFiles({
        name: 'selection.geojson', mimeType: 'application/geo+json',
        buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [1, 2, 3].map(n => ({
            type: 'Feature', geometry: type === '면' ? { type: 'Polygon', coordinates: [[[127, 37], [127.01, 37], [127.01, 37.01], [127, 37]]] } : type === '선' || (type === '혼합' && n === 2) ? { type: 'LineString', coordinates: [[127, 37], [127.01, 37.01]] } : { type: 'Point', coordinates: [127 + n / 100, 37] },
            properties: { id: 1000 + n, name: `기록 ${n}`, memo: `기록 ${n}`, ...(styles ? {customColor: ["#ff0000", "#00ff00", "#0000ff"][n-1], customWeight:n, customFillOpacity:n/10, customFillPattern:"solid", customLineStyle:"dash"} : {}) }
        })) }))
    });
    await expect(page.locator('#app-dialog-overlay')).toContainText('현재 프로젝트에 추가되었습니다');
    await page.locator('#app-dialog-overlay .primary').click();
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-record').click();
    await expect(page.locator('#survey-list-area .survey-item')).toHaveCount(3);
}
const row = (page, n) => page.locator('#survey-list-area .survey-item').filter({ has: page.locator('.survey-name', { hasText: `기록 ${n}` }) });

test('표시 상태와 선택을 분리하고 기록명 너비와 숨김 상태를 유지한다', async ({ page }) => {
    await prepare(page);
    await expect(page.locator('#record-visibility-all svg')).toHaveCount(1);
    await expect(page.locator('#record-visibility-all')).toHaveText('');
    await expect(page.locator('#record-selection-toggle')).toHaveText('기록 선택');
    await row(page, 2).getByRole('button', { name: '지도에서 숨기기' }).click();
    await expect(row(page, 2).locator('.survey-name')).toHaveCSS('color', 'rgb(156, 163, 175)');
    await expect(row(page, 1).locator('.survey-name')).toHaveCSS('color', 'rgb(17, 24, 39)');
    const width = (await row(page, 2).locator('.survey-info').boundingBox()).width;
    await page.locator('#record-selection-toggle').click();
    await expect(page.locator('#record-list-controls label')).toHaveText('');
    await expect(page.locator('#survey-list-area input:checked')).toHaveCount(0);
    await row(page, 2).getByRole('checkbox').check();
    await expect(row(page, 2).locator('.survey-name')).toHaveCSS('color', 'rgb(156, 163, 175)');
    expect((await row(page, 2).locator('.survey-info').boundingBox()).width).toBe(width);
    await expect(page.locator('#record-list-controls')).toContainText('1개 선택');
    await page.locator('#chk-select-all').check();
    await expect(page.locator('#record-list-controls')).toContainText('3개 선택');
    await page.locator('#record-selection-toggle').click();
    await expect(row(page, 2).getByRole('button', { name: '지도에 표시', exact: true })).toBeVisible();
    await page.locator('#record-selection-toggle').click();
    await expect(page.locator('#survey-list-area input:checked')).toHaveCount(0);
    await row(page, 2).getByRole('checkbox').check();
    await page.locator('#record-selection-toggle').click();
    await page.evaluate(() => window.groupSelectedLayers());
    await expect(page.locator('#record-group-create-modal-overlay input[type=checkbox]')).toHaveCount(0);
    await page.locator('#record-group-create-submit').click();
    await expect(page.locator('#record-group-create-modal-overlay')).toBeHidden();
    await expect(page.locator('.survey-group-items .survey-item')).toHaveCount(0);
    await page.locator('#record-selection-toggle').click();
    await row(page, 2).getByRole('checkbox').check();
    await page.locator('#content-record .dropdown-container > .btn-more').click();
    await expect(page.locator('#more-menu').getByText('정렬 방식', { exact: true })).toBeHidden();
    await expect(page.locator('#more-menu').getByText('그룹 만들기', { exact: true })).toBeHidden();
    await page.locator('#add-selected-records-to-group').click();
    await page.locator('#record-group-select-list button').filter({ hasText: '그룹1' }).click();
    await expect(page.locator('.survey-group-items .survey-item')).toHaveCount(1);
    await expect(page.locator('#record-group-select-modal-overlay')).toBeHidden();
    await expect(row(page, 2).locator('.survey-name')).toHaveCSS('color', 'rgb(156, 163, 175)');
    await expect(page.locator('#record-group-create-modal-overlay')).toBeHidden();
    await page.screenshot({ path: 'test-results/record-selection-mobile.png' });
});

test('숨긴 기록만 선택해 이동해도 숨김 상태를 유지하고 선택을 초기화한다', async ({ page }) => {
    await prepare(page);
    await row(page, 2).getByRole('button', { name: '지도에서 숨기기' }).click();
    await page.locator('#record-selection-toggle').click();
    await row(page, 2).getByRole('checkbox').check();
    await page.evaluate(() => window.openMoveSelectionModal());
    await page.evaluate(() => { window.createNewProjectAndMove(); });
    await page.locator('#app-dialog-input').fill('이동 대상');
    await page.locator('#app-dialog-overlay .primary').click();
    await expect(page.locator('#app-dialog-overlay')).toContainText('1개의 기록');
    await page.locator('#app-dialog-overlay .primary').click();
    await expect(page.locator('#survey-list-area .survey-item')).toHaveCount(1);
    await expect(row(page, 2).locator('.survey-name')).toHaveCSS('color', 'rgb(156, 163, 175)');
    await expect(page.locator('#record-selection-toggle')).toHaveText('기록 선택');
});

test('선택한 숨김 기록만 삭제하고 표시 중인 다른 기록은 남긴다', async ({ page }) => {
    await prepare(page);
    await row(page, 2).getByRole('button', { name: '지도에서 숨기기' }).click();
    await page.locator('#record-selection-toggle').click();
    await row(page, 2).getByRole('checkbox').check();
    await page.evaluate(() => { window.deleteSelectedLayers(); });
    await expect(page.locator('#app-dialog-overlay')).toContainText('1개의 기록');
    await page.locator('#app-dialog-overlay .primary').click();
    await expect(page.locator('#survey-list-area .survey-item')).toHaveCount(2);
    await expect(row(page, 2)).toHaveCount(0);
    await expect(row(page, 1).locator('.survey-name')).toHaveCSS('color', 'rgb(17, 24, 39)');
    await expect(page.locator('#record-list-controls')).toContainText('0개 선택');
});

for (const type of ['점', '선', '면']) {
    test(`${type} 스타일을 선택한 기록에만 적용하고 숨김을 유지한다`, async ({ page }) => {
        await prepare(page, type);
        await row(page, 2).getByRole('button', { name: '지도에서 숨기기' }).click();
        await page.locator('#record-selection-toggle').click();
        await row(page, 1).getByRole('checkbox').check();
        await row(page, 2).getByRole('checkbox').check();
        await page.locator('#content-record .dropdown-container > .btn-more').click();
        await page.locator('#more-menu').getByText('스타일 일괄 설정', { exact: true }).click();
        await expect(page.locator('#app-dialog-overlay')).toContainText(`2개 ${type} 기록의 스타일을 일괄 설정합니다.`);
        await page.locator('#app-dialog-overlay .primary').click();
        await expect(page.locator('#style-modal-overlay')).toBeVisible();
        if (type === '면') {
            await page.locator('#style-fill-dropdown summary').click();
            await page.locator('#style-fill-pattern-choices [data-pattern="grid"]').click();
            await expect(page.locator('#style-fill-dropdown summary')).toContainText('격자');
            await expect(page.locator('#style-fill-dropdown')).not.toHaveAttribute('open', '');
        }
        await page.evaluate(() => window.selectStyleColor('#123456'));
        await page.locator('.style-modal-apply-btn').click();
        for (const n of [1, 2]) await expect.poll(() => row(page, n).locator('.style-setting-btn').innerHTML()).toContain('#123456');
        expect(await row(page, 3).locator('.style-setting-btn').innerHTML()).not.toContain('#123456');
        await expect(row(page, 2)).toHaveClass(/record-hidden/);
    });
}

test('서로 다른 형태의 스타일 일괄 설정은 안내만 표시한다', async ({ page }) => {
    await prepare(page, '혼합');
    await page.locator('#record-selection-toggle').click();
    await page.locator('#chk-select-all').check();
    await page.evaluate(() => { window.openBulkStyleModal(); });
    await expect(page.locator('#app-dialog-overlay')).toContainText('같은 형식의 기록을 선택해야 합니다.');
    await page.locator('#app-dialog-overlay .primary').click();
    await expect(page.locator('#style-modal-overlay')).toBeHidden();
});

async function savedProperties(page) {
    return page.evaluate(() => new Promise(resolve => {
        const request = indexedDB.open('localforage');
        request.onsuccess = () => {
            const db = request.result;
            const read = db.transaction('keyvaluepairs').objectStore('keyvaluepairs').get('my_survey_data_v4');
            read.onsuccess = () => {
                const data = read.result;
                resolve(data.projects.find(p => p.id === data.currentProjectId).features.features.map(f => f.properties));
                db.close();
            };
        };
    }));
}

test('윤곽 위치만 일괄 변경하면 개별 색상 두께 채움과 투명도를 유지한다', async ({page}) => {
    await prepare(page, '면', true);
    const before = await savedProperties(page);
    await page.locator('#record-selection-toggle').click();
    await page.locator('#chk-select-all').check();
    await page.evaluate(() => { window.openBulkStyleModal(); });
    await page.locator('#app-dialog-overlay .primary').click();
    await page.locator('#style-line-tab-btn').click();
    await page.locator('#style-stroke-position-dropdown summary').click();
    await page.locator('[data-stroke-position="inside"]').click();
    await page.locator('.style-modal-apply-btn').click();
    await expect.poll(async () => (await savedProperties(page)).every(p => p.customStrokePosition === 'inside')).toBe(true);
    const after = await savedProperties(page);
    for (let i=0; i<before.length; i++) {
        for (const key of ['customColor','customWeight','customFillOpacity','customFillPattern','customLineStyle','customStrokeColor','customFillColor']) {
            expect(after[i][key], key).toEqual(before[i][key]);
        }
    }
    await page.evaluate(() => { window.openBulkStyleModal(); });
    await page.locator('#app-dialog-overlay .primary').click();
    await page.locator('.style-modal-apply-btn').click();
    expect(await savedProperties(page)).toEqual(after);
});
