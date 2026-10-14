import { test, expect } from '@playwright/test';

const feature = {
    type: 'Feature',
    properties: { id: 991001, name: '안쪽 윤곽선 시험', customColor: '#a12345', customWeight: 3, customFillOpacity: 0 },
    geometry: { type: 'Polygon', coordinates: [
        [[126.97, 37.56], [126.99, 37.56], [126.99, 37.58], [126.97, 37.58], [126.97, 37.56]],
        [[126.976, 37.566], [126.976, 37.574], [126.984, 37.574], [126.984, 37.566], [126.976, 37.566]]
    ] }
};

async function openLineSettings(page) {
    await page.evaluate(() => window.openStyleModal(991001));
    await page.locator('#style-line-tab-btn').click();
}

test('면 안쪽 윤곽선은 취소·적용·새로고침·두께 변경·해제를 지원한다', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#geoJsonInput').setInputFiles({
        name: 'inside.geojson', mimeType: 'application/geo+json',
        buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [feature] }))
    });
    await page.locator('#app-dialog-overlay .app-dialog-btn.primary').click();
    await page.evaluate(() => window.zoomToLayer(991001));
    await page.waitForTimeout(500);
    const path = page.locator('path.leaflet-interactive[stroke="#a12345"]').first();
    await expect(path).toHaveAttribute('stroke-width', '3');
    await openLineSettings(page);
    const checkbox = page.locator('#style-stroke-inside');
    const choose = async value => {
        await checkbox.click();
        await page.locator(`[data-stroke-position="${value}"]`).click();
    };
    await expect(checkbox).toContainText('중앙');
    await choose('inside');
    await page.locator('.style-modal-cancel-btn').click();
    await expect(path).not.toHaveAttribute('clip-path', /.+/);
    await openLineSettings(page);
    await expect(checkbox).toContainText('중앙');
    await choose('inside');
    await page.locator('.style-modal-apply-btn').click();
    await expect(path).toHaveAttribute('stroke-width', '3');
    await expect(path).not.toHaveAttribute('clip-path', /.+/);
    const insideStroke = page.locator('.record-positioned-stroke[data-stroke-position="inside"]').first();
    await expect(insideStroke).toHaveAttribute('stroke-width', '3');
    await expect(insideStroke).toHaveAttribute('fill', 'none');
    expect(await insideStroke.getAttribute('d')).not.toBe(await path.getAttribute('d'));
    expect((await path.getAttribute('d')).match(/z/gi).length).toBe(2);

    const insideBounds = await page.evaluate(() => {
        const boundary = document.querySelector('path.leaflet-interactive[stroke="#a12345"]');
        const stroke = document.querySelector('.record-positioned-stroke[data-stroke-position="inside"]');
        const boundaryBox = boundary.getBBox();
        const strokeBox = stroke.getBBox();
        return {
            boundary: { width: boundaryBox.width, height: boundaryBox.height },
            stroke: { width: strokeBox.width, height: strokeBox.height }
        };
    });
    expect(insideBounds.stroke.width).toBeLessThan(insideBounds.boundary.width);
    expect(insideBounds.stroke.height).toBeLessThan(insideBounds.boundary.height);

    // Wait for the existing asynchronous storage queue before navigating away.
    await page.waitForTimeout(500);
    await page.reload();
    await expect(path).toHaveAttribute('stroke-width', '3');
    await expect(insideStroke).toHaveAttribute('stroke-width', '3');
    await openLineSettings(page);
    await expect(checkbox).toContainText('안쪽');
    await page.locator('#style-line-weight').fill('5');
    await page.locator('#style-line-weight').dispatchEvent('change');
    await page.locator('.style-modal-apply-btn').click();
    await expect(path).toHaveAttribute('stroke-width', '5');
    await expect(insideStroke).toHaveAttribute('stroke-width', '5');
    const insideOpacity = await insideStroke.getAttribute('stroke-opacity');
    expect(Number(insideOpacity)).toBeGreaterThan(0);
    await page.evaluate(() => window.zoomToLayer(991001));
    await page.waitForTimeout(350);
    await page.locator('#map').hover();
    await page.mouse.wheel(0, -250);
    await page.waitForTimeout(350);
    expect(await insideStroke.getAttribute('d')).not.toBe(await path.getAttribute('d'));
    await expect(insideStroke).toHaveAttribute('stroke-opacity', insideOpacity);
    for (const delta of [250, -250]) {
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(400);
        await expect(insideStroke).toHaveAttribute('stroke-opacity', insideOpacity);
        await expect(insideStroke).not.toHaveCSS('display', 'none');
    }

    await openLineSettings(page);
    await page.evaluate(() => window.selectLineStyle('solid-dot'));
    await page.locator('.style-modal-apply-btn').click();
    const insideDotStroke = page.locator('.leaflet-solidDotOverlay-pane .record-positioned-stroke[data-stroke-position="inside"]');
    await expect(insideDotStroke).toHaveCount(1);
    await expect(insideDotStroke).toHaveAttribute('stroke-width', '15');
    await openLineSettings(page);
    await page.locator('#style-line-dropdown summary').click();
    await page.locator('#style-line-choices [data-style="dashed"]').click();
    await expect(page.locator('#style-line-dropdown')).not.toHaveAttribute('open', '');
    await expect(page.locator('#style-line-dropdown summary')).toContainText('파선');
    await page.locator('.style-modal-apply-btn').click();
    await expect(page.locator('.leaflet-solidDotOverlay-pane .record-positioned-stroke')).toHaveCount(0);
    await expect(path).toHaveAttribute('stroke-dasharray', /.+/);
    await expect(insideStroke).toHaveAttribute('stroke-dasharray', await path.getAttribute('stroke-dasharray'));
    await page.evaluate(() => window.zoomToLayer(991001));
    await page.waitForTimeout(350);
    await page.screenshot({ path: 'test-results/inside-stroke-map.png' });
    await openLineSettings(page);
    await page.screenshot({ path: 'test-results/inside-stroke-settings.png' });
    await choose('outside');
    await page.locator('.style-modal-apply-btn').click();
    const outside = page.locator('.record-positioned-stroke[data-stroke-position="outside"]').first();
    await expect(outside).toHaveAttribute('stroke-width', '5');
    await expect(outside).toHaveAttribute('fill', 'none');
    await expect(outside).toHaveAttribute('stroke-dasharray', await path.getAttribute('stroke-dasharray'));
    await expect(path).toHaveAttribute('stroke-opacity', '0');
    await expect(page.locator('clipPath[id^="record-inside-"]')).toHaveCount(0);
    await expect(page.locator('clipPath[id^="record-outside-"]')).toHaveCount(0);
    expect(await outside.getAttribute('d')).not.toBe(await path.getAttribute('d'));
    const outsideBounds = await page.evaluate(() => {
        const boundary = document.querySelector('path.leaflet-interactive[stroke="#a12345"]');
        const stroke = document.querySelector('.record-positioned-stroke[data-stroke-position="outside"]');
        const boundaryBox = boundary.getBBox();
        const strokeBox = stroke.getBBox();
        return {
            boundary: { width: boundaryBox.width, height: boundaryBox.height },
            stroke: { width: strokeBox.width, height: strokeBox.height }
        };
    });
    expect(outsideBounds.stroke.width).toBeGreaterThan(outsideBounds.boundary.width);
    expect(outsideBounds.stroke.height).toBeGreaterThan(outsideBounds.boundary.height);
    const outsideOpacity = await outside.getAttribute('stroke-opacity');
    expect(Number(outsideOpacity)).toBeGreaterThan(0);
    for (const delta of [-250, 250, -250]) {
        await page.locator('#map').hover();
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(400);
        await expect(outside).toHaveAttribute('stroke-opacity', outsideOpacity);
        await expect(outside).not.toHaveCSS('display', 'none');
    }
    await page.waitForTimeout(500);
    await page.reload();
    await expect(outside).toHaveAttribute('stroke-width', '5');
    await openLineSettings(page);
    await expect(checkbox).toContainText('바깥쪽');
    await page.evaluate(() => window.selectLineStyle('solid-dot'));
    await page.locator('.style-modal-apply-btn').click();
    await expect(page.locator('.leaflet-solidDotOverlay-pane .record-positioned-stroke[data-stroke-position="outside"]')).toHaveCount(1);
    await page.evaluate(() => window.zoomToLayer(991001));
    await page.waitForTimeout(350);
    await page.screenshot({ path: 'test-results/outside-stroke-map.png' });
    await openLineSettings(page);
    await page.evaluate(() => window.selectLineStyle('solid'));
    await choose('center');
    await page.locator('.style-modal-apply-btn').click();
    await expect(path).toHaveAttribute('stroke-width', '5');
    await expect(path).not.toHaveAttribute('clip-path', /.+/);
    await expect(page.locator('clipPath[id^="record-inside-"]')).toHaveCount(0);
    await expect(page.locator('clipPath[id^="record-outside-"]')).toHaveCount(0);
    await expect(page.locator('.record-positioned-stroke')).toHaveCount(0);
    await expect(path).not.toHaveAttribute('stroke-opacity', '0');
    expect(errors).toEqual([]);
});
