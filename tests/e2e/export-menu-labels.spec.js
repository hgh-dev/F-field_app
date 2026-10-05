import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

test('선택 작업과 프로젝트 내보내기 메뉴의 이름과 순서가 명확하다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-record').click();

    await page.locator('#record-selection-toggle').click();
    await page.locator('#record-more-button').click();
    const recordMenu = page.locator('#more-menu');
    await expect(recordMenu.locator('.dropdown-menu-title')).toHaveText('선택 작업');
    await expect.poll(async () => recordMenu.locator('[data-record-bulk-action]').allTextContents()
        .then(items => items.map(item => item.trim().replace(/\s+/g, ' ')))).toEqual([
        '선택 작업',
        '프로젝트 이동',
        '스타일 일괄 설정',
        'abc 라벨 표시',
        '그룹에 추가',
        '엑셀로 내보내기',
        '파일로 내보내기',
        '삭제'
    ]);

    await page.locator('#record-more-button').click();
    await page.locator('#tab-btn-project').click();
    const project = page.locator('#project-list-area').getByText('기본 프로젝트', { exact: true }).locator('..').locator('..');
    await project.locator('.btn-more').click();
    await expect(project.locator('.dropdown-menu .dropdown-item')).toHaveText([
        '엑셀로 내보내기',
        '파일로 내보내기'
    ]);
});

test('프로젝트 메뉴에서 해당 프로젝트 전체 기록을 엑셀로 내보낸다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#geoJsonInput').setInputFiles({
        name: 'project-excel.geojson',
        mimeType: 'application/geo+json',
        buffer: Buffer.from(JSON.stringify({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [127, 37] },
                properties: { id: 3101, name: '프로젝트 엑셀 기록', address: '전체 주소' }
            }]
        }))
    });
    await expect(page.locator('#app-dialog-overlay')).toContainText('현재 프로젝트에 추가되었습니다');
    await page.locator('#app-dialog-overlay .primary').click();
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-project').click();
    const project = page.locator('#project-list-area').getByText('기본 프로젝트', { exact: true }).locator('..').locator('..');
    await project.locator('.btn-more').click();
    const downloadPromise = page.waitForEvent('download');
    await project.locator('.dropdown-menu').getByText('엑셀로 내보내기', { exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^기본 프로젝트_선택기록_\d{8}_\d{6}\.xlsx$/);
    const saved = test.info().outputPath(download.suggestedFilename());
    await download.saveAs(saved);
    const zip = await JSZip.loadAsync(await readFile(saved));
    const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
    expect(sheet).toContain('프로젝트 엑셀 기록');
    expect(sheet).toContain('전체 주소');
});
