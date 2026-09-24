import { test, expect } from '@playwright/test';
import { zip as writeShapefileZip } from '@crmackey/shp-write';
import JSZip from 'jszip';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const photoProjectFixture = path.resolve(testDirectory, '../fixtures/photo-project.geojson');

async function createPointShapefileBuffer() {
    const shapefile = await writeShapefileZip({
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: { name: '현장 기준점' },
            geometry: { type: 'Point', coordinates: [126.978, 37.5665] }
        }]
    });

    return Buffer.from(await shapefile.arrayBuffer());
}

async function createEpsg5174PointShapefileBuffer() {
    const shapefile = await writeShapefileZip({
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: { name: 'EPSG5174 기준점' },
            geometry: { type: 'Point', coordinates: [161821.568, 414274.3440000004] }
        }]
    });
    const archive = await JSZip.loadAsync(await shapefile.arrayBuffer());
    archive.file('Shapefile.prj', 'PROJCS["Korean_1985_Modified_Korea_Central_Belt",GEOGCS["GCS_Korean_Datum_1985",DATUM["D_Korean_Datum_1985",SPHEROID["Bessel_1841",6377397.155,299.1528128]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",200000],PARAMETER["False_Northing",500000],PARAMETER["Central_Meridian",127.0028902777778],PARAMETER["Scale_Factor",1],PARAMETER["Latitude_Of_Origin",38],UNIT["Meter",1]]');
    return archive.generateAsync({ type: 'nodebuffer' });
}

async function openApp(page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
}

async function acceptAppDialog(page, value, expectedText) {
    const dialog = page.locator('#app-dialog-overlay');
    await expect(dialog).toBeVisible();
    if (expectedText) await expect(dialog).toContainText(expectedText);
    if (value !== undefined) await dialog.locator('#app-dialog-input').fill(value);
    await dialog.locator('.app-dialog-btn.primary').click({ force: true });
    await expect(dialog).toBeHidden();
}

async function openSidebarTab(page, tabName) {
    const sidebar = page.locator('#sidebar-overlay');
    const isOpen = await sidebar.evaluate(element => element.classList.contains('visible'));
    if (!isOpen) await page.locator('#map-active-project-badge').click();
    await expect(sidebar).toHaveClass(/\bvisible\b/);
    const tab = page.locator(`#tab-btn-${tabName}`);
    await expect(tab).toBeInViewport();
    await tab.click();
}

test('앱과 지연 로딩된 로그인 화면이 오류 없이 열린다', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await openApp(page);
    await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource')
        .some(entry => /(?:\/src\/features\/|\/assets\/)auth-admin-ui[^/]*\.js$/.test(new URL(entry.name).pathname)))).toBe(true);
    await expect.poll(() => page.locator('.leaflet-tile').evaluateAll(tiles =>
        tiles.some(tile => tile.complete && tile.naturalWidth > 0))).toBe(true);
    await page.locator('#map-active-project-badge').click();
    await page.locator('#btn-settings').click();
    await expect(page.locator('#settings-modal-overlay')).toBeVisible();

    expect(pageErrors).toEqual([]);
});

test('트랙 도구에는 절전 버튼과 검은 절전 화면이 없다', async ({ page }) => {
    await openApp(page);
    const toolbar = page.locator('#track-action-toolbar');
    await expect(toolbar.locator('button', { hasText: '기록 완료' })).toHaveCount(1);
    await expect(toolbar.locator('button', { hasText: '사진 추가' })).toHaveCount(1);
    await expect(toolbar.locator('button', { hasText: '취소' })).toHaveCount(1);
    await expect(toolbar.locator('button', { hasText: '절전' })).toHaveCount(0);
    await expect(page.locator('#sleep-mode-overlay')).toHaveCount(0);
});

test('웹의 미완료 트랙은 새로고침 후 찾아서 현재 기록으로 완료할 수 있다', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
        const session = {
            id: 'e2e-web-track',
            startedAt: Date.now() - 10_000,
            updatedAt: Date.now(),
            state: 'stopped',
            points: [
                { latitude: 37.5665, longitude: 126.978, accuracy: 5, timestamp: 1 },
                { latitude: 37.5667, longitude: 126.9783, accuracy: 5, timestamp: 2 }
            ],
            gaps: [{ hiddenAt: 10, resumedAt: 20 }]
        };

        await new Promise((resolve, reject) => {
            const request = indexedDB.open('FField');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const database = request.result;
                const transaction = database.transaction('web_track_session', 'readwrite');
                transaction.objectStore('web_track_session').put(session, 'active-track');
                transaction.oncomplete = () => {
                    database.close();
                    resolve();
                };
                transaction.onerror = () => reject(transaction.error);
            };
        });
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    const recoveryDialog = page.locator('#app-dialog-overlay');
    await expect(recoveryDialog).toContainText('완료하지 못한 트랙 좌표 2개');
    await recoveryDialog.getByRole('button', { name: '지금 완료' }).click();

    await expect(recoveryDialog).toContainText('기록명 입력');
    await recoveryDialog.locator('#app-dialog-input').fill('복구한 웹 트랙');
    await recoveryDialog.getByRole('button', { name: '저장' }).click();

    await openSidebarTab(page, 'record');
    await expect(page.locator('.survey-name', { hasText: '복구한 웹 트랙' })).toBeVisible();
});

test('트랙 기록명 입력을 취소하면 기록 모드와 임시 좌표가 유지된다', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
        const session = {
            id: 'e2e-cancel-track-name',
            startedAt: Date.now() - 10_000,
            updatedAt: Date.now(),
            state: 'stopped',
            points: [
                { latitude: 37.5665, longitude: 126.978, accuracy: 5, timestamp: 1 },
                { latitude: 37.5667, longitude: 126.9783, accuracy: 5, timestamp: 2 }
            ],
            gaps: []
        };

        await new Promise((resolve, reject) => {
            const request = indexedDB.open('FField');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const database = request.result;
                const transaction = database.transaction('web_track_session', 'readwrite');
                transaction.objectStore('web_track_session').put(session, 'active-track');
                transaction.oncomplete = () => {
                    database.close();
                    resolve();
                };
                transaction.onerror = () => reject(transaction.error);
            };
        });
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    const dialog = page.locator('#app-dialog-overlay');
    await expect(dialog).toContainText('완료하지 못한 트랙 좌표 2개');
    await dialog.getByRole('button', { name: '지금 완료' }).click();
    await expect(dialog).toContainText('기록명 입력');
    await dialog.getByRole('button', { name: '취소' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.locator('#track-action-toolbar')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/recording-mode/);
    await expect.poll(() => page.evaluate(async () => {
        return await new Promise((resolve, reject) => {
            const request = indexedDB.open('FField');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const database = request.result;
                const transaction = database.transaction('web_track_session', 'readonly');
                const getRequest = transaction.objectStore('web_track_session').get('active-track');
                getRequest.onsuccess = () => {
                    const session = getRequest.result;
                    database.close();
                    resolve(session?.state);
                };
                getRequest.onerror = () => reject(getRequest.error);
            };
        });
    })).toBe('recording');

    const pointCount = await page.evaluate(async () => {
        return await new Promise((resolve, reject) => {
            const request = indexedDB.open('FField');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const database = request.result;
                const transaction = database.transaction('web_track_session', 'readonly');
                const getRequest = transaction.objectStore('web_track_session').get('active-track');
                getRequest.onsuccess = () => {
                    const count = getRequest.result?.points?.length || 0;
                    database.close();
                    resolve(count);
                };
                getRequest.onerror = () => reject(getRequest.error);
            };
        });
    });
    expect(pointCount).toBeGreaterThanOrEqual(2);
});

test('모바일 키보드가 올라와도 이름 입력창이 보이는 영역 안에 유지된다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await page.locator('#map-active-project-badge').click();
    await page.getByRole('button', { name: '새 프로젝트' }).click();

    const overlay = page.locator('#app-dialog-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('#app-dialog-input')).toBeFocused();
    await page.waitForTimeout(320);
    await overlay.evaluate(element => {
        element.style.setProperty('--app-dialog-viewport-top', '280px');
        element.style.setProperty('--app-dialog-viewport-height', '360px');
    });

    const dialogBox = await overlay.locator('.app-dialog').boundingBox();
    const inputBox = await overlay.locator('#app-dialog-input').boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    expect(dialogBox.y).toBeGreaterThanOrEqual(280);
    expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(640);
    expect(inputBox.y).toBeGreaterThanOrEqual(280);
    expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(640);

    await overlay.locator('.app-dialog-btn.secondary').click();
});

test('프로젝트와 점 기록을 만든 뒤 새로고침해도 복원된다', async ({ page }) => {
    const projectName = 'E2E 현장 프로젝트';
    const recordName = 'E2E 점 기록';

    await openApp(page);
    await page.locator('#map-active-project-badge').click();
    await page.getByRole('button', { name: '새 프로젝트' }).click();
    await acceptAppDialog(page, projectName);
    await expect(page.locator('#map-active-project-badge')).toContainText(projectName);

    await page.locator('.sidebar-header .btn-sidebar-action').first().click();
    await page.locator('#record-fab-main').click();
    await page.locator('#btn-point').click();
    const mapBox = await page.locator('#map').boundingBox();
    expect(mapBox).not.toBeNull();
    await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await acceptAppDialog(page, recordName);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.locator('#map-active-project-badge').click();
    await page.locator('#project-list-area').getByText(projectName, { exact: true }).click();
    await expect(page.locator('#map-active-project-badge')).toContainText(projectName);
    await page.locator('#tab-btn-record').click();
    await expect(page.locator('.survey-name', { hasText: recordName })).toBeVisible();
});

test('사진 포함 GeoJSON을 가져오면 기록과 Base64 사진이 유지된다', async ({ page }) => {
    await openApp(page);
    await page.locator('#geoJsonInput').setInputFiles(photoProjectFixture);
    await acceptAppDialog(page, undefined, '현재 프로젝트에 추가되었습니다');

    await openSidebarTab(page, 'record');
    await expect(page.locator('.survey-name')).toHaveCount(3);
    const photoRecord = page.locator('.survey-name', { hasText: '사진 기록' });
    await expect(photoRecord).toBeVisible();
    await photoRecord.locator('..').click();

    const photo = page.locator('#bottom-sheet .photo-thumbnail');
    await expect(photo).toHaveAttribute('src', /^data:image\/png;base64,/);
});

test('SHP ZIP을 가져오면 점 기록으로 변환된다', async ({ page }) => {
    await openApp(page);
    await page.locator('#geoJsonInput').setInputFiles({
        name: 'e2e-point.zip',
        mimeType: 'application/zip',
        buffer: await createPointShapefileBuffer()
    });

    await expect(page.getByText('SHP 좌표계 선택', { exact: true })).toBeVisible();
    await page.locator('#shp-import-crs-confirm-btn').click();
    await acceptAppDialog(page, undefined, '현재 프로젝트에 추가되었습니다');

    await openSidebarTab(page, 'record');
    await expect(page.locator('.survey-name', { hasText: 'e2e-point' })).toBeVisible();
});

test('EPSG:5174 SHP ZIP은 WGS84 실제 위치로 재투영된다', async ({ page }) => {
    const debugMessages = [];
    page.on('console', message => {
        if (message.type() === 'debug' && message.text().includes('[SHP CRS:')) debugMessages.push(message.text());
    });
    await openApp(page);
    await page.locator('#geoJsonInput').setInputFiles({
        name: 'epsg5174-point.zip',
        mimeType: 'application/zip',
        buffer: await createEpsg5174PointShapefileBuffer()
    });
    await page.locator('#shp-import-crs-confirm-btn').click();
    await acceptAppDialog(page, undefined, '현재 프로젝트에 추가되었습니다');

    await expect.poll(() => debugMessages.some(message => message.includes('source CRS: EPSG:5174'))).toBe(true);
    await expect.poll(() => debugMessages.some(message => /after:.*126\.57058.*37\.22959/.test(message))).toBe(true);
    await openSidebarTab(page, 'record');
    await expect(page.locator('.survey-name', { hasText: 'epsg5174-point' })).toBeVisible();
});
