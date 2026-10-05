import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

test('선택 저장 위의 엑셀 메뉴는 선택한 점·선·면만 하나의 파일로 저장한다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    const geometries = [
        { type: 'Point', coordinates: [127, 37] },
        { type: 'LineString', coordinates: [[127, 37], [127.001, 37.001]] },
        { type: 'Polygon', coordinates: [[[127, 37], [127.001, 37], [127.001, 37.001], [127, 37]]] },
        { type: 'Point', coordinates: [128, 38] }
    ];
    await page.locator('#geoJsonInput').setInputFiles({
        name: 'excel.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify({
            type: 'FeatureCollection', features: geometries.map((geometry, i) => ({
                type: 'Feature', geometry, properties: { id: 2000 + i, name: `엑셀기록${i}`, address: '전체 주소', description: '=1+1', createdAt: '2026-10-05T07:00:00.000Z', updatedAt: '2026-10-05T08:00:00.000Z', isHidden: i === 1 }
            }))
        }))
    });
    await expect(page.locator('#app-dialog-overlay')).toContainText('현재 프로젝트에 추가되었습니다');
    await page.locator('#app-dialog-overlay .primary').click();
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-record').click();
    const exportMenu = page.locator('#more-menu').getByText('엑셀로 내보내기', { exact: true });
    await expect(exportMenu).toBeHidden();
    await page.locator('#record-selection-toggle').click();
    await page.locator('#record-more-button').click();
    await exportMenu.click();
    await expect(page.locator('#app-dialog-overlay')).toContainText('선택된 기록이 없습니다');
    await page.locator('#app-dialog-overlay .primary').click();
    for (let i = 0; i < 3; i++) {
        await page.locator('.survey-item').filter({ has: page.getByText(`엑셀기록${i}`, { exact: true }) }).getByRole('checkbox').check();
    }
    await page.locator('#record-more-button').click();
    await expect(exportMenu).toBeVisible();
    const next = await exportMenu.evaluate(el => el.nextElementSibling?.textContent.trim());
    expect(next).toBe('파일로 내보내기');
    const downloadPromise = page.waitForEvent('download');
    await exportMenu.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^기본 프로젝트_선택기록_\d{8}_\d{6}\.xlsx$/);
    const saved = test.info().outputPath(download.suggestedFilename());
    await download.saveAs(saved);
    const zip = await JSZip.loadAsync(await readFile(saved));
    const workbook = await zip.file('xl/workbook.xml').async('string');
    expect(workbook).toContain('name="점"');
    expect(workbook).toContain('name="선"');
    expect(workbook).toContain('name="면"');
    for (let i = 1; i <= 3; i++) {
        const sheet = await zip.file(`xl/worksheets/sheet${i}.xml`).async('string');
        expect(sheet).toContain(`엑셀기록${i - 1}`);
        expect(sheet).not.toContain('엑셀기록3');
        expect(sheet).toContain('전체 주소');
        expect(sheet).toContain('=1+1');
        expect(sheet).not.toContain('<f>');
    }
});
