import { applyD1Migrations, env } from 'cloudflare:test';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';

// 每個測試檔跑一次，在 isolated storage 快照之前，所以每個測試都從一個空的、
// 已套用 migration 的 D1 開始。TEST_MIGRATIONS 由 vitest.config.ts 注入，
// 不是正式 Env 的一部分。
const migrations = (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS;
await applyD1Migrations(env.DB, migrations);

// schema/triggers.sql 是「一個檔案一條語句」，所以這裡不做任何語句切割 ——
// D1 的 /query 端點解析不了 create trigger，prepare().run() 送單一語句則沒問題。
const triggers = (env as unknown as { TEST_TRIGGERS: string }).TEST_TRIGGERS;
await env.DB.prepare(triggers).run();
