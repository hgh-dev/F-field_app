import { test, expect } from '@playwright/test';

const records = {
    type: 'FeatureCollection',
    features: [
        { type: 'Feature', properties: { id: 991101, name: '소나무 조사' }, geometry: { type: 'Point', coordinates: [126.978, 37.5665] } },
        { type: 'Feature', properties: { id: 991102, name: '참나무 조사' }, geometry: { type: 'Point', coordinates: [126.979, 37.5665] } },
        { type: 'Feature', properties: { id: 991103, name: '소나무 사진' }, geometry: { type: 'Point', coordinates: [126.98, 37.5665] } }
    ]
};

test('기록명 검색 결과만 표시하고 X 버튼으로 전체 목록을 복원한다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#geoJsonInput').setInputFiles({
        name: 'record-search.geojson',
        mimeType: 'application/geo+json',
        buffer: Buffer.from(JSON.stringify(records))
    });
    await page.locator('#app-dialog-overlay .app-dialog-btn.primary').click();
    await page.locator('#map-active-project-badge').click();
    await page.locator('#tab-btn-record').click();

    const list = page.locator('#survey-list-area');
    const input = page.locator('#record-search-input');
    const button = page.locator('#record-search-button');
    await expect(list.locator('.survey-item')).toHaveCount(3);
    await expect(button).toHaveAttribute('aria-label', '기록 검색');

    await input.fill('소나무');
    await expect(list.locator('.survey-item')).toHaveCount(2);
    await expect(list).toContainText('소나무 조사');
    await expect(list).toContainText('소나무 사진');
    await expect(list).not.toContainText('참나무 조사');
    await expect(input).toBeEditable();
    await expect(button).toHaveAttribute('aria-label', '기록 검색 해제');

    await input.fill('참');
    await expect(list.locator('.survey-item')).toHaveCount(1);
    await expect(list).toContainText('참나무 조사');
    await input.fill('');
    await expect(list.locator('.survey-item')).toHaveCount(3);
    await input.pressSequentially('소나무');
    await expect(list.locator('.survey-item')).toHaveCount(2);

    await button.click();
    await expect(list.locator('.survey-item')).toHaveCount(3);
    await expect(input).toHaveValue('');
    await expect(input).not.toHaveAttribute('readonly', '');
    await expect(button).toHaveAttribute('aria-label', '기록 검색');

    await input.fill('없는 기록');
    await expect(list.locator('.survey-item')).toHaveCount(0);
    await expect(list).toContainText('검색 결과 없음');
    await button.click();
    await expect(list.locator('.survey-item')).toHaveCount(3);
});
