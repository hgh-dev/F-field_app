import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('얇은 선 옆을 눌러 선택하고 숨기면 터치 영역도 제거한다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#geoJsonInput').setInputFiles({ name: 'line.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify({
        type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: 987654, name: '터치 시험 선', customWeight: 1, customColor: '#a12345' },
            geometry: { type: 'LineString', coordinates: [[126.97, 37.56], [126.99, 37.56]] } }]
    })) });
    await page.locator('#app-dialog-overlay .primary').click();
    await page.evaluate(() => window.zoomToLayer(987654));
    await page.waitForTimeout(800);
    await page.evaluate(() => window.closeBottomSheet());
    const path = page.locator('path.leaflet-interactive[stroke="#a12345"]').first();
    await expect(path).toHaveAttribute('stroke-width', '1');
    const hit = page.locator('.record-line-hit-area');
    await expect(hit).toHaveCount(1);
    await expect(hit).toHaveAttribute('stroke-width', '30');
    const position = await path.evaluate(el => {
        const p = el.getPointAtLength(el.getTotalLength() / 2);
        const point = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM());
        return { x: point.x, y: point.y + 12 };
    });
    await page.touchscreen.tap(position.x, position.y);
    await expect(page.locator('#bottom-sheet')).toHaveClass(/open/);
    await expect(page.locator('#bottom-sheet')).toContainText('터치 시험 선');
    await page.evaluate(() => window.toggleLayerVisibility(987654));
    await expect(hit).toHaveCount(0);
    await page.evaluate(() => window.toggleLayerVisibility(987654));
    await expect(hit).toHaveCount(1);
});

test('Ctrl+F와 Command+F가 검색창을 열고 반복해도 닫지 않는다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    for (const shortcut of ['Control+f', 'Control+f', 'Meta+f']) {
        await page.keyboard.press(shortcut);
        await expect(page.locator('#search-container')).toBeVisible();
        await expect(page.locator('#search-input-address')).toBeFocused();
    }
});
