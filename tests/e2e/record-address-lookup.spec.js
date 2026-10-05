import { test, expect } from '@playwright/test';

async function readFirstRecord(page) {
    return page.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('localforage');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const read = db.transaction('keyvaluepairs').objectStore('keyvaluepairs').get('my_survey_data_v4');
            read.onsuccess = () => {
                const data = read.result;
                resolve(data?.projects.find(project => project.id === data.currentProjectId)?.features.features[0]?.properties);
                db.close();
            };
            read.onerror = () => reject(read.error);
        };
    }));
}

test('주소 없는 기록 바텀시트를 열면 전체 주소를 자동 조회해 저장한다', async ({ page }) => {
    let addressRequests = 0;
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/req/address?**', async route => {
        addressRequests++;
        const callback = new URL(route.request().url()).searchParams.get('callback');
        await route.fulfill({
            contentType: 'application/javascript',
            body: `${callback}(${JSON.stringify({ response: { status: 'OK', result: [{ type: 'parcel', text: '경기도 예시시 예시면 매곡리 산 35-2' }] } })})`
        });
    });
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#geoJsonInput').setInputFiles({
        name: 'without-address.geojson', mimeType: 'application/geo+json',
        buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [{
            type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[127, 37], [127.001, 37], [127.001, 37.001], [127, 37]]] },
            properties: { id: 1609459200000, name: '주소 없는 면' }
        }] }))
    });
    await expect(page.locator('#app-dialog-overlay')).toContainText('현재 프로젝트에 추가되었습니다');
    await page.locator('#app-dialog-overlay .primary').click();
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-record').click();
    await page.locator('#survey-list-area').getByText('주소 없는 면', { exact: true }).click();
    await expect.poll(() => addressRequests).toBe(1);
    expect(pageErrors).toEqual([]);
    await expect(page.locator('#bottom-sheet')).toContainText('경기도 예시시 예시면 매곡리 산 35-2');
    await expect.poll(async () => (await readFirstRecord(page))?.address).toBe('경기도 예시시 예시면 매곡리 산 35-2');
    expect(addressRequests).toBe(1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-record').click();
    await page.locator('#survey-list-area').getByText('주소 없는 면', { exact: true }).click();
    await expect(page.locator('#bottom-sheet')).toContainText('경기도 예시시 예시면 매곡리 산 35-2');
    expect(addressRequests).toBe(1);
});

test('점 기록 위치를 수정하면 변경된 위치의 주소를 다시 조회해 저장한다', async ({ page }) => {
    let addressRequests = 0;
    await page.route('**/req/address?**', async route => {
        addressRequests++;
        const callback = new URL(route.request().url()).searchParams.get('callback');
        await route.fulfill({
            contentType: 'application/javascript',
            body: `${callback}(${JSON.stringify({ response: { status: 'OK', result: [{ type: 'parcel', text: '경기도 변경시 새주소 20' }] } })})`
        });
    });
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.evaluate(() => window.saveCurrentPoint(37.245911, 126.960302, '경기도 이전시 옛주소 10'));
    await page.locator('#app-dialog-overlay .primary').click();
    await page.locator('.survey-item .survey-info').first().click();
    await page.locator('#bottom-sheet-more-btn').click();
    await page.getByText('수정', { exact: true }).last().click();
    await expect(page.locator('#app-dialog-overlay')).toBeVisible();
    await page.locator('#app-dialog-overlay .primary').click();
    await expect(page.locator('#edit-action-toolbar')).toBeVisible();
    await page.locator('#map').click({ position: { x: 90, y: 120 } });
    await page.locator('#edit-action-toolbar .btn-done').click();

    await expect.poll(() => addressRequests).toBe(1);
    await expect(page.locator('#bottom-sheet')).toContainText('경기도 변경시 새주소 20');
    await expect.poll(async () => (await readFirstRecord(page))?.address).toBe('경기도 변경시 새주소 20');
});
