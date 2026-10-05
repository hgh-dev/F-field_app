import { test, expect } from '@playwright/test';

test('위치 점 기록의 간단 지번과 전체 주소가 새로고침 후에도 표시된다', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.evaluate(() => window.saveCurrentPoint(37.113533, 126.879954, '경기도 예시시 예시면 매곡리 산 35-2'));
    const dialog = page.locator('#app-dialog-overlay');
    await expect(dialog).toBeVisible();
    await dialog.locator('.app-dialog-btn.primary').click();
    await expect(page.locator('.survey-name', { hasText: '매곡리 산35-2' })).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-record').click();
    await page.locator('.survey-name', { hasText: '매곡리 산35-2' }).locator('..').click();
    const sheet = page.locator('#bottom-sheet');
    await expect(sheet.locator('.badge-parcel')).toHaveText('지번');
    await expect(sheet).toContainText('경기도 예시시 예시면 매곡리 산 35-2');
    await expect(sheet).toContainText('좌표');
    const text = await sheet.innerText();
    expect(text.indexOf('지번')).toBeLessThan(text.indexOf('좌표'));
    await page.evaluate(() => {
        window.__copiedAddress = '';
        window.copyText = text => { window.__copiedAddress = text; };
    });
    await sheet.locator('.badge-parcel').locator('..').click();
    await expect.poll(() => page.evaluate(() => window.__copiedAddress)).toBe('경기도 예시시 예시면 매곡리 산 35-2');
});

test('선과 면 기록의 길이·면적을 배지 라벨로 표시한다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#geoJsonInput').setInputFiles({
        name: 'measure-labels.geojson', mimeType: 'application/geo+json',
        buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [
            { type: 'Feature', geometry: { type: 'LineString', coordinates: [[127, 37], [127.001, 37.001]] }, properties: { id: 4101, name: '길이 라벨 기록', address: '선 주소' } },
            { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[127, 37], [127.001, 37], [127.001, 37.001], [127, 37]]] }, properties: { id: 4102, name: '면적 라벨 기록', address: '면 주소' } }
        ] }))
    });
    await expect(page.locator('#app-dialog-overlay')).toContainText('현재 프로젝트에 추가되었습니다');
    await page.locator('#app-dialog-overlay .primary').click();
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-record').click();
    await page.locator('#survey-list-area').getByText('길이 라벨 기록', { exact: true }).click();
    await expect(page.locator('#bottom-sheet .badge-length')).toHaveText('길이');
    await page.locator('#bottom-sheet-close').click();
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-record').click();
    await page.locator('#survey-list-area').getByText('면적 라벨 기록', { exact: true }).click();
    await expect(page.locator('#bottom-sheet .badge-area')).toHaveText('면적');
});
