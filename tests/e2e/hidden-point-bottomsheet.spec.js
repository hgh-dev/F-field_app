import { test, expect } from '@playwright/test';

test('숨김 점 최적화가 다른 기록 및 위치 조회 바텀시트를 닫지 않는다', async ({ page }) => {
    await page.route('**/req/address?**', async route => {
        const callback = new URL(route.request().url()).searchParams.get('callback');
        await route.fulfill({
            contentType: 'application/javascript',
            body: `${callback}(${JSON.stringify({ response: { status: 'OK', result: [{ type: 'parcel', text: '위치 조회 시험 주소' }] } })})`
        });
    });
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#geoJsonInput').setInputFiles({
        name: 'hidden-point.geojson', mimeType: 'application/geo+json',
        buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [
            { type: 'Feature', properties: { id: 992001, name: '표시 점', address: '시험 주소' }, geometry: { type: 'Point', coordinates: [126.978, 37.5665] } },
            { type: 'Feature', properties: { id: 992002, name: '숨김 점', isHidden: true }, geometry: { type: 'Point', coordinates: [126.979, 37.5665] } }
        ] }))
    });
    await page.locator('#app-dialog-overlay .primary').click();
    const sheet = page.locator('#bottom-sheet');
    await page.evaluate(() => window.zoomToLayer(992001));
    // Include flyTo, delayed viewport optimization (500 ms), and animation frames.
    await page.waitForTimeout(1400);
    await expect(sheet).toHaveClass(/open/);
    await expect(sheet).toContainText('표시 점');

    // Re-applying another point's hidden state must not close the active sheet either.
    await page.evaluate(() => {
        window.toggleLayerVisibility(992002);
        window.toggleLayerVisibility(992002);
    });
    await expect(sheet).toHaveClass(/open/);

    await page.evaluate(() => window.showInfoPopup(37.567, 126.978));
    await expect(sheet).toContainText('위치 조회 시험 주소');
    await page.waitForTimeout(1400);
    await expect(sheet).toHaveClass(/open/);
    // The previous record is no longer the owner of the location lookup sheet.
    await page.evaluate(() => window.toggleLayerVisibility(992001));
    await expect(sheet).toHaveClass(/open/);

    await page.evaluate(() => {
        window.toggleLayerVisibility(992001);
        window.zoomToLayer(992001);
    });
    await page.waitForTimeout(1400);
    await expect(sheet).toHaveClass(/open/);
    await page.evaluate(() => window.toggleLayerVisibility(992001));
    await expect(sheet).not.toHaveClass(/open/);
});
