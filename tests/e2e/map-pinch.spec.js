import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 412, height: 820 }, hasTouch: true, isMobile: true, permissions: [] });

test('핀치 중 기존 타일을 유지하고 손을 뗀 뒤 최종 배율의 타일을 불러온다', async ({ page, context }) => {
    await page.addInitScript(() => {
        let leaflet;
        Object.defineProperty(window, 'L', {
            configurable: true,
            get: () => leaflet,
            set(value) {
                leaflet = value;
                value.Map.addInitHook(function () { window.pinchTestMap = this; });
            }
        });
    });
    const requestedZooms = [];
    let releaseTiles;
    const tilesReleased = new Promise(resolve => { releaseTiles = resolve; });
    let holdTiles = false;
    await page.route('https://**.supabase.co/**', route => route.abort());
    await page.route('https://api.vworld.kr/**', async route => {
        const match = route.request().url().match(/\/Satellite\/(\d+)\//);
        if (match) requestedZooms.push(Number(match[1]));
        if (holdTiles) await tilesReleased;
        await route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#467c53"/></svg>'
        });
    });
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    await page.evaluate(() => window.pinchTestMap.setView([36.5, 127.8], 10, { animate: false }));
    const satellite = page.locator('img.leaflet-tile[src*="/Satellite/"]');
    await expect.poll(() => satellite.evaluateAll(tiles =>
        tiles.length > 0 && tiles.every(tile => tile.complete && tile.naturalWidth > 0 && tile.classList.contains('leaflet-tile-loaded')))).toBe(true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const initialZoom = requestedZooms.at(-1);
    await satellite.evaluateAll(tiles => { window.pinchOriginalTiles = tiles; });
    requestedZooms.length = 0;
    holdTiles = true;
    const session = await context.newCDPSession(page);
    const touch = async (type, radius) => {
        await session.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: type === 'touchEnd' ? [] : [
                { x: 206 - radius, y: 410, id: 1 },
                { x: 206 + radius, y: 410, id: 2 }
            ]
        });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    try {
        await touch('touchStart', 40);
        // 여러 정수 배율을 지나갔다 돌아와도 중간 타일을 요청하지 않아야 합니다.
        for (const radius of [60, 90, 130, 100, 80]) await touch('touchMove', radius);
        expect(requestedZooms).toEqual([]);
        expect(await page.evaluate(() => ({
            zoom: window.pinchTestMap.getZoom(),
            tiles: window.pinchOriginalTiles.map(tile => ({ connected: tile.isConnected, visibility: getComputedStyle(tile).visibility }))
        }))).toEqual({ zoom: initialZoom + 1, tiles: expect.arrayContaining([{ connected: true, visibility: 'visible' }]) });
        await touch('touchEnd');
        await expect.poll(() => requestedZooms.length).toBeGreaterThan(0);
        expect([...new Set(requestedZooms)]).toEqual([initialZoom + 1]);
        // 새 타일 응답을 기다리는 동안에도 기존 지도가 남아 있어야 합니다.
        expect(await page.evaluate(() => window.pinchOriginalTiles.some(tile => tile.isConnected))).toBe(true);
    } finally {
        releaseTiles();
    }
    await expect.poll(() => satellite.evaluateAll(tiles => tiles.every(tile =>
        tile.complete && tile.naturalWidth > 0))).toBe(true);
    await expect(page.locator('#map')).not.toHaveClass(/leaflet-fade-anim/);
});
