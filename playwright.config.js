import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: 'list',
    webServer: {
        command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: false,
        timeout: 30_000
    },
    use: {
        baseURL: 'http://127.0.0.1:4173',
        channel: 'chrome',
        headless: true,
        geolocation: { latitude: 37.5665, longitude: 126.978 },
        permissions: ['geolocation'],
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    }
});
