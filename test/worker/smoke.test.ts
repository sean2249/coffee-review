import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../../src/worker/index';
import type { Env } from '../../src/worker/env';
import { OWNER_ID, resetDb } from './helpers';

beforeEach(resetDb);

describe('worker 骨架', () => {
    it('/api/me 在 open 模式回傳 DEV_USER_EMAIL 的身分', async () => {
        const res = await SELF.fetch('http://app.test/api/me');
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            auth: 'open',
            user_id: OWNER_ID,
            email: 'owner@example.com',
            placesEnabled: true,
            app: 'coffee-review',
        });
    });

    it('未知路徑回 404 JSON', async () => {
        const res = await SELF.fetch('http://app.test/api/nope');
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'not found' });
    });

    // 沒有身分來源時必須 fail closed：不能無聲地跑成「無主資料」。
    it('open 模式但沒有 DEV_USER_EMAIL 時回 503', async () => {
        const res = await worker.fetch(
            new Request('http://app.test/api/me'),
            { ...env, DEV_USER_EMAIL: '' } as Env,
            {} as ExecutionContext,
        );
        expect(res.status).toBe(503);
    });

    // 半套設定是部署疏失，同樣 fail closed（而不是變成全開）。
    it('只設了 ACCESS_AUD 沒設 team domain 時回 503', async () => {
        const res = await worker.fetch(
            new Request('http://app.test/api/me'),
            { ...env, ACCESS_AUD: 'aud-only' } as Env,
            {} as ExecutionContext,
        );
        expect(res.status).toBe(503);
    });

    it('設了 Access 但沒帶 token 時回 401，且不會退回 DEV_USER_EMAIL', async () => {
        const res = await worker.fetch(
            new Request('http://app.test/api/me'),
            { ...env, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com' } as Env,
            {} as ExecutionContext,
        );
        expect(res.status).toBe(401);
    });
});

describe('D1 schema', () => {
    it('建好了每一張表', async () => {
        const { results } = await env.DB.prepare(
            "select name from sqlite_master where type='table' order by name",
        ).all<{ name: string }>();
        const names = results.map((r) => r.name);
        for (const t of [
            'cupping_records',
            'cupping_session_cups',
            'cupping_sessions',
            'shop_notes',
            'shops',
            'tags',
            'tasting_records',
            'users',
        ]) {
            expect(names).toContain(t);
        }
    });

    it('seed 了四個內建標籤', async () => {
        const row = await env.DB.prepare('select count(*) as n from tags').first<{ n: number }>();
        expect(row?.n).toBe(4);
    });

    it('google_place_id 不可變（trigger）', async () => {
        await env.DB.prepare("insert into shops (id, name, google_place_id) values ('s1', '店', 'place-1')").run();
        await expect(
            env.DB.prepare("update shops set google_place_id = 'place-2' where id = 's1'").run(),
        ).rejects.toThrow(/immutable/);
    });

    it('JSON 欄位擋掉非 JSON 的值', async () => {
        await env.DB.prepare("insert into users (id, email) values ('u1', 'a@example.com')").run();
        await expect(
            env.DB.prepare(
                "insert into cupping_records (id, user_id, defects_tags) values ('c1', 'u1', 'not json')",
            ).run(),
        ).rejects.toThrow();
    });
});
