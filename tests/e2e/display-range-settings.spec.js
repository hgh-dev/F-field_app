import { test, expect } from '@playwright/test';

test('기록과 라벨 표시 범위는 화면 안의 스크롤 목록으로 표시된다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto('/');

    await page.evaluate(() => window.openSettingsChoiceModal('record-range'));
    const modal = page.locator('.settings-choice-modal-content');
    const list = page.locator('#settings-choice-list');
    await expect(modal).toBeVisible();
    await expect(list.getByText('10레벨 (기본값)', { exact: true })).toBeVisible();
    await expect(list.getByText(/이상/)).toHaveCount(0);
    const recordLayout = await page.evaluate(() => {
        const modalRect = document.querySelector('.settings-choice-modal-content').getBoundingClientRect();
        const listElement = document.querySelector('#settings-choice-list');
        return {
            modalTop: modalRect.top,
            modalBottom: modalRect.bottom,
            viewportHeight: innerHeight,
            listHeight: listElement.clientHeight,
            listScrollHeight: listElement.scrollHeight
        };
    });
    expect(recordLayout.modalTop).toBeGreaterThanOrEqual(0);
    expect(recordLayout.modalBottom).toBeLessThanOrEqual(recordLayout.viewportHeight);
    expect(recordLayout.listScrollHeight).toBeGreaterThan(recordLayout.listHeight);

    await page.evaluate(() => window.closeSettingsChoiceModal());
    await page.evaluate(() => window.openSettingsChoiceModal('label-range'));
    await expect(list.getByText('기록과 동일한 범위에서 표시 (기본값)', { exact: true })).toBeVisible();
    await expect(list.getByText(/이상/)).toHaveCount(0);
});
