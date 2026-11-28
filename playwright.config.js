import { defineConfig, devices } from '@playwright/test';

// End-to-end：真的 Chromium 對本機 wrangler dev（scripts/e2e-server.mjs，空的 D1 + 假資料）。
// 單元與 Worker 測試在 vitest（npm test）；這裡只放要真瀏覽器才看得到的行為，例如算出來的顏色。
const PORT = process.env.E2E_PORT || '8790';

export default defineConfig({
    testDir: 'e2e',
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 320, height: 740 } } },
        { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    ],
    webServer: {
        command: 'node scripts/e2e-server.mjs',
        url: `http://localhost:${PORT}/`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
    },
});
