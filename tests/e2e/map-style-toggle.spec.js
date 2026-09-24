import { test, expect } from '@playwright/test';

for (const id of ['baseSatellite', 'cadastralContinuous', 'forest']) {
    test(`${id}: 지도 재표시와 꺼진 상태의 스타일 변경에 최신 효과를 적용한다`, async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
        const toggle = async enabled => page.evaluate(({ id, enabled }) => {
            if (id === 'baseSatellite') window.toggleBaseLayer(enabled);
            else window.toggleOverlay(id === 'cadastralContinuous' ? 'cadastral' : id, enabled);
        }, { id, enabled });
        const apply = async (invert, red) => {
            await page.evaluate(id => window.openMapTileOpacitySettings(id), id);
            await page.locator('#style-tile-invert').setChecked(invert);
            await page.locator('#style-tile-red').fill(String(red));
            await page.locator('#style-tile-red').dispatchEvent('input');
            await page.locator('#style-tile-opacity').fill('0.45');
            await page.locator('#style-tile-opacity').dispatchEvent('change');
            await page.locator('.style-modal-apply-btn').click();
        };
        const styledLayer = page.locator(`.leaflet-layer[style*="ffield-map-color-filter-${id}"]`);
        await toggle(true);
        await apply(true, 35);
        await expect(styledLayer).toHaveCount(1);
        await expect(styledLayer).toHaveCSS('opacity', '0.45');
        for (let cycle = 0; cycle < 2; cycle++) {
            await toggle(false);
            await expect(styledLayer).toHaveCount(0);
            await toggle(true);
            await expect(styledLayer).toHaveCount(1);
            await expect(styledLayer).toHaveCSS('filter', /invert\(1\)/);
            await expect(styledLayer).toHaveCSS('opacity', '0.45');
        }
        await toggle(false);
        await apply(true, 60);
        await apply(false, -20);
        await toggle(true);
        await expect(styledLayer).toHaveCount(1);
        await expect(styledLayer).not.toHaveCSS('filter', /invert/);
        await expect(page.locator(`#ffield-map-color-filter-${id} feColorMatrix`))
            .toHaveAttribute('values', /^1 0 0 0 -0\.0700 /);
        await page.evaluate(id => window.openMapTileOpacitySettings(id), id);
        await expect(page.locator('#style-tile-invert')).not.toBeChecked();
        await expect(page.locator('#style-tile-red')).toHaveValue('-20');
        await page.locator('.style-tile-reset-btn').click();
        await page.locator('.style-modal-apply-btn').click();
        await toggle(false);
        await toggle(true);
        await expect(styledLayer).toHaveCount(0);
    });
}
