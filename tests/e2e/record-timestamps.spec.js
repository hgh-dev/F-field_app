import { test, expect } from '@playwright/test';

async function readRecord(page) {
    return page.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('localforage');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const read = db.transaction('keyvaluepairs').objectStore('keyvaluepairs').get('my_survey_data_v4');
            read.onsuccess = () => {
                const data = read.result;
                resolve(data?.projects.find(p => p.id === data.currentProjectId)?.features.features[0]?.properties);
                db.close();
            };
            read.onerror = () => { db.close(); reject(read.error); };
        };
    }));
}

test('기록 시각을 저장하고 새로고침에는 보존하며 메모 수정에만 갱신한다', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.evaluate(() => window.saveCurrentPoint(37.113533, 126.879954, '경기도 예시시 예시면 매곡리 산 35-2'));
    const dialog = page.locator('#app-dialog-overlay');
    await expect(dialog).toBeVisible();
    await dialog.locator('.app-dialog-btn.primary').click();
    await expect.poll(async () => (await readRecord(page))?.createdAt).toBeTruthy();
    const original = await readRecord(page);
    expect(original.updatedAt).toBe(original.createdAt);
    expect(Number.isFinite(Date.parse(original.createdAt))).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    expect((await readRecord(page)).updatedAt).toBe(original.updatedAt);
    await page.evaluate(id => window.editLayerDescription(id), original.id);
    await page.locator('#memo-input-textarea').fill('수정 시각 검증');
    await page.locator('#memo-modal-container button', { hasText: '저장' }).click();
    await expect.poll(async () => (await readRecord(page))?.description).toBe('수정 시각 검증');
    const changed = await readRecord(page);
    expect(changed.createdAt).toBe(original.createdAt);
    expect(Date.parse(changed.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt));
});
