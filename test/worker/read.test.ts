import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../../src/worker/index';
import type { Env } from '../../src/worker/env';
import { OTHER_ID, OWNER_ID, api, getJson, seedCup, seedRecord, seedSession, seedShop, resetDb } from './helpers';

type Rec = Record<string, unknown>;

beforeEach(resetDb);

describe('GET /api/records', () => {
    it('合併三種類型、標上 _type、依 created_at 降冪', async () => {
        await seedShop('s1');
        await seedRecord('cupping_records', { id: 'c1', shopId: 's1', createdAt: '2026-03-01T00:00:00.000Z' });
        await seedRecord('tasting_records', { id: 't1', shopId: 's1', createdAt: '2026-03-03T00:00:00.000Z' });
        await seedSession('g1', OWNER_ID, '2026-03-02T00:00:00.000Z');
        await seedCup('cup1', 'g1', 'A', 0);

        const rows = await getJson<Rec[]>('/api/records');
        expect(rows.map((r) => [r.id, r._type])).toEqual([
            ['t1', 'tasting'],
            ['g1', 'session'],
            ['c1', 'cupping'],
        ]);
    });

    it('type 篩選只查該張表', async () => {
        await seedShop('s1');
        await seedRecord('cupping_records', { id: 'c1', shopId: 's1' });
        await seedRecord('tasting_records', { id: 't1', shopId: 's1' });

        const rows = await getJson<Rec[]>('/api/records?type=cupping');
        expect(rows.map((r) => r.id)).toEqual(['c1']);
    });

    it('預設不帶 evaluations / observation，withEvaluations=1 才帶', async () => {
        await seedRecord('cupping_records', { id: 'c1', extra: { evaluations: '{"flavor":{"score":7}}' } });

        const lean = (await getJson<Rec[]>('/api/records?type=cupping'))[0];
        expect(lean).not.toHaveProperty('evaluations');
        expect(lean).not.toHaveProperty('observation');

        const full = (await getJson<Rec[]>('/api/records?type=cupping&withEvaluations=1'))[0];
        expect(full.evaluations).toEqual({ flavor: { score: 7 } });
        expect(full.observation).toEqual({});
    });

    it('場次內嵌的杯依 position 排序，旗標也跟著走', async () => {
        await seedSession('g1');
        await seedCup('cup2', 'g1', 'B', 1, OWNER_ID, { evaluations: '{"body":{"score":6}}' });
        await seedCup('cup1', 'g1', 'A', 0);

        const lean = (await getJson<Rec[]>('/api/records?type=session'))[0];
        const leanCups = lean.cups as Rec[];
        expect(leanCups.map((c) => c.code)).toEqual(['A', 'B']);
        expect(leanCups[1]).not.toHaveProperty('evaluations');
        // session_id 不外洩到杯上：舊的 PostgREST 內嵌投影也沒有這一欄。
        expect(leanCups[0]).not.toHaveProperty('session_id');

        const full = (await getJson<Rec[]>('/api/records?type=session&withEvaluations=1'))[0];
        expect((full.cups as Rec[])[1].evaluations).toEqual({ body: { score: 6 } });
    });

    it('列表帶 bean_type（記錄與杯），供依單品 / 配方分組', async () => {
        await seedRecord('cupping_records', { id: 'c1', extra: { bean_type: 'blend' } });
        await seedSession('g1');
        await seedCup('cup1', 'g1', 'A', 0, OWNER_ID, { bean_type: 'single' });

        const rows = await getJson<Rec[]>('/api/records');
        const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
        expect(byId.c1.bean_type).toBe('blend');
        expect((byId.g1.cups as Rec[])[0].bean_type).toBe('single');
    });

    it('沒有杯的場次仍然回一個空陣列', async () => {
        await seedSession('g1');
        const rows = await getJson<Rec[]>('/api/records?type=session');
        expect(rows[0].cups).toEqual([]);
    });

    it('看不到別人的記錄、場次與杯', async () => {
        await seedRecord('cupping_records', { id: 'mine' });
        await seedRecord('cupping_records', { id: 'theirs', userId: OTHER_ID });
        await seedSession('their-session', OTHER_ID);
        await seedCup('their-cup', 'their-session', 'A', 0, OTHER_ID);

        const rows = await getJson<Rec[]>('/api/records');
        expect(rows.map((r) => r.id)).toEqual(['mine']);
    });

    it('未知的 type 是 400', async () => {
        expect((await api('/api/records?type=bogus')).status).toBe(400);
    });
});

describe('GET /api/records/:type/:id', () => {
    it('回整列，JSON 欄位已解碼', async () => {
        await seedRecord('cupping_records', {
            id: 'c1',
            extra: { defects_tags: '["苦","澀"]', evaluations: '{"flavor":{"score":8}}' },
        });
        const row = await getJson<Rec>('/api/records/cupping/c1');
        expect(row.defects_tags).toEqual(['苦', '澀']);
        expect(row.evaluations).toEqual({ flavor: { score: 8 } });
        expect(row.tag_ids).toEqual([]);
    });

    it('別人的記錄與不存在的記錄一樣回 null', async () => {
        await seedRecord('cupping_records', { id: 'theirs', userId: OTHER_ID });
        expect(await getJson('/api/records/cupping/theirs')).toBeNull();
        expect(await getJson('/api/records/cupping/missing')).toBeNull();
    });
});

describe('GET /api/sessions/:id', () => {
    it('回場次 + 依 position 排好的杯', async () => {
        await seedSession('g1');
        await seedCup('cup2', 'g1', 'B', 1);
        await seedCup('cup1', 'g1', 'A', 0, OWNER_ID, { defects_tags: '["澀"]' });

        const s = await getJson<Rec>('/api/sessions/g1');
        const cups = s.cups as Rec[];
        expect(cups.map((c) => c.id)).toEqual(['cup1', 'cup2']);
        expect(cups[0].defects_tags).toEqual(['澀']);
    });

    it('別人的場次回 null', async () => {
        await seedSession('g1', OTHER_ID);
        expect(await getJson('/api/sessions/g1')).toBeNull();
    });
});

describe('GET /api/shops', () => {
    it('店家是共享的：別人建的也看得到，依 name 排序', async () => {
        await seedShop('s2', 'B 店');
        await seedShop('s1', 'A 店');
        const rows = await getJson<Rec[]>('/api/shops');
        expect(rows.map((r) => r.name)).toEqual(['A 店', 'B 店']);
    });

    it('單一店家找不到時回 null', async () => {
        expect(await getJson('/api/shops/nope')).toBeNull();
    });
});

describe('GET /api/shops/:id/note', () => {
    it('只回自己的筆記，JSON 欄位已解碼', async () => {
        await seedShop('s1');
        await seedNote('n1', 's1', OWNER_ID);
        const note = await getJson<Rec>('/api/shops/s1/note');
        expect(note.facilities).toEqual(['wifi']);
        expect(note.ambience_axes).toEqual({ quiet_lively: 2 });
        expect(note.legacy_decor_tags).toEqual([]);
    });

    it('別人的筆記不會外洩', async () => {
        await seedShop('s1');
        await seedNote('n1', 's1', OTHER_ID);
        expect(await getJson('/api/shops/s1/note')).toBeNull();
    });
});

describe('GET /api/shops/:id/beans', () => {
    it('只回自己的、這家店的沖煮記錄', async () => {
        await seedShop('s1');
        await seedRecord('cupping_records', {
            id: 'c1',
            shopId: 's1',
            createdAt: '2026-01-01T00:00:00.000Z',
            extra: { bean_name: '舊' },
        });
        await seedRecord('cupping_records', {
            id: 'c2',
            shopId: 's1',
            createdAt: '2026-02-01T00:00:00.000Z',
            extra: { bean_name: '新' },
        });
        await seedRecord('cupping_records', { id: 'c3', shopId: 's1', userId: OTHER_ID });

        const rows = await getJson<Rec[]>('/api/shops/s1/beans');
        expect(rows.map((r) => r.bean_name)).toEqual(['新', '舊']);
    });
});

describe('GET /api/suggest', () => {
    type Suggest = Record<'origins' | 'processes' | 'methods' | 'beans' | 'items', string[]>;

    it('沒有資料時五個清單都是空陣列', async () => {
        expect(await getJson<Suggest>('/api/suggest')).toEqual({
            origins: [],
            processes: [],
            methods: [],
            beans: [],
            items: [],
        });
    });

    it('依次數排序、去空白、不分大小寫去重，且排除 null / 空白', async () => {
        await seedRecord('cupping_records', { id: 'c1', extra: { origin: '哥倫比亞' } });
        await seedRecord('cupping_records', { id: 'c2', extra: { origin: '衣索比亞' } });
        await seedRecord('cupping_records', { id: 'c3', extra: { origin: ' 衣索比亞 ' } });
        await seedRecord('cupping_records', { id: 'c4', extra: { origin: '  ' } });
        await seedRecord('cupping_records', { id: 'c5', extra: { origin: null } });
        await seedRecord('cupping_records', { id: 'c6', extra: { origin: 'Kenya' } });
        await seedRecord('cupping_records', { id: 'c7', extra: { origin: 'kenya' } });
        await seedRecord('cupping_records', { id: 'c8', extra: { origin: 'KENYA' } });

        const { origins } = await getJson<Suggest>('/api/suggest');
        expect(origins).toHaveLength(3);
        expect(origins[0].toLowerCase()).toBe('kenya');
        expect(origins.slice(1)).toEqual(['衣索比亞', '哥倫比亞']);
    });

    it('同次數依值排序', async () => {
        await seedRecord('cupping_records', { id: 'c1', extra: { method: 'V60' } });
        await seedRecord('cupping_records', { id: 'c2', extra: { method: 'Kalita' } });
        expect((await getJson<Suggest>('/api/suggest')).methods).toEqual(['Kalita', 'V60']);
    });

    it('跨表合併：沖煮 / 品鑑 / 杯測各杯', async () => {
        await seedShop('s1');
        await seedRecord('cupping_records', {
            id: 'c1',
            extra: { bean_name: '耶加雪菲 A', origin: '肯亞', process: '水洗', method: '手沖' },
        });
        await seedRecord('tasting_records', {
            id: 't1',
            shopId: 's1',
            extra: { bean_name: '耶加雪菲 B', item_ordered: '手沖' },
        });
        await seedSession('g1');
        await seedCup('cup1', 'g1', 'A', 0, OWNER_ID, { bean_name: '耶加雪菲 C', origin: '衣索比亞', process: '日曬' });
        await seedCup('cup2', 'g1', 'B', 1, OWNER_ID, { bean_name: '耶加雪菲 A', origin: '衣索比亞', process: '日曬' });

        expect(await getJson<Suggest>('/api/suggest')).toEqual({
            origins: ['衣索比亞', '肯亞'],
            processes: ['日曬', '水洗'],
            methods: ['手沖'],
            beans: ['耶加雪菲 A', '耶加雪菲 B', '耶加雪菲 C'],
            items: ['手沖'],
        });
    });

    it('別人的資料不會出現在任何清單', async () => {
        await seedShop('s1');
        await seedRecord('cupping_records', {
            id: 'c1',
            userId: OTHER_ID,
            extra: { bean_name: '別人的豆', origin: '別人的國', process: '別人的處理', method: '別人的方法' },
        });
        await seedRecord('tasting_records', {
            id: 't1',
            shopId: 's1',
            userId: OTHER_ID,
            extra: { bean_name: '別人的豆2', item_ordered: '別人的品項' },
        });
        await seedSession('g1', OTHER_ID);
        await seedCup('cup1', 'g1', 'A', 0, OTHER_ID, { bean_name: '別人的豆3', origin: '別人的國2', process: '別人的處理2' });

        expect(await getJson<Suggest>('/api/suggest')).toEqual({
            origins: [],
            processes: [],
            methods: [],
            beans: [],
            items: [],
        });
    });

    it('舊的 /api/suggest/origins、/items 已移除', async () => {
        expect((await api('/api/suggest/origins')).status).toBe(404);
        expect((await api('/api/suggest/items')).status).toBe(404);
    });

    it('設了 Access 但沒帶 token 時回 401', async () => {
        const res = await worker.fetch(
            new Request('http://app.test/api/suggest'),
            { ...env, ACCESS_AUD: 'aud', ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com' } as Env,
            {} as ExecutionContext,
        );
        expect(res.status).toBe(401);
    });
});

async function seedNote(id: string, shopId: string, userId: string): Promise<void> {
    await env.DB.prepare(
        `insert into shop_notes (id, shop_id, user_id, facilities, ambience_axes)
         values (?1, ?2, ?3, '["wifi"]', '{"quiet_lively":2}')`,
    )
        .bind(id, shopId, userId)
        .run();
}
