import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

const migrations = await readD1Migrations(fileURLToPath(new URL('./migrations', import.meta.url)));
// trigger 不能放在 migrations/（見 schema/triggers.sql 的註解），所以另外讀進來，
// 由 test/worker/setup.ts 在套完 migration 之後執行 —— 三處套用同一份檔案。
const triggers = readFileSync(fileURLToPath(new URL('./schema/triggers.sql', import.meta.url)), 'utf8');

// 兩個 test project：
//   app     既有的前端測試。environment 是 node 而非 jsdom——tests/load-app.js
//           自己開一個乾淨的 JSDOM window 跑 app.js（classic script）。
//   worker  Hono 路由跑在真的 workerd 裡，配 miniflare 的本地 D1。
export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'app',
                    include: ['tests/**/*.test.js'],
                    environment: 'node',
                },
            },
            {
                test: {
                    name: 'worker',
                    include: ['test/worker/**/*.test.ts'],
                    setupFiles: ['test/worker/setup.ts'],
                },
                plugins: [
                    cloudflareTest({
                        wrangler: { configPath: './wrangler.jsonc' },
                        // binding 來自 wrangler.jsonc；secret 與測試專用值在這裡注入。
                        // ACCESS_* 兩個都留空 = requireAccess 的 open 分支，
                        // 身分由 DEV_USER_EMAIL 決定（見 test/worker/helpers.ts）。
                        miniflare: {
                            bindings: {
                                DEV_USER_EMAIL: 'owner@example.com',
                                GOOGLE_MAPS_API_KEY: 'test-places-key',
                                TEST_MIGRATIONS: migrations,
                                TEST_TRIGGERS: triggers,
                            },
                        },
                    }),
                ],
            },
        ],
    },
});
