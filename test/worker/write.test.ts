import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { OTHER_ID, OWNER_ID, api, getJson, resetDb, seedCup, seedRecord, seedSession, seedShop } from './helpers';

type Rec = Record<string, unknown>;

const json = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
});
const send = (method: string, body: unknown): RequestInit => ({ ...json(body), method });

beforeEach(resetDb);

describe('店家寫入', () => {
    it('新增：Worker 蓋上 id 與 created_by，忽略前端送的值', async () => {
        const res = await api(
            '/api/shops',
            json({
                id: 'client-chosen',
                created_by: OTHER_ID,
                user_id: OTHER_ID,
                name: '測試店',
                google_place_id: 'place-x',
                lat: 25.03,
            }),
        );
        expect(res.status).toBe(201);
        const shop = (await res.json()) as Rec;
        expect(shop.id).not.toBe('client-chosen');
        expect(shop.created_by).toBe(OWNER_ID);
        expect(shop.name).toBe('測試店');
        expect(shop.lat).toBe(25.03);
    });

    it('撞到同一個 google_place_id 回 23505', async () => {
        await seedShop('s1', '已存在', 'place-dup');
        const res = await api('/api/shops', json({ name: '又一次', google_place_id: 'place-dup' }));
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ code: '23505' });
    });

    it('更新只吃白名單，google_place_id 改不動', async () => {
        await seedShop('s1', '舊名', 'place-1');
        const res = await api('/api/shops/s1', send('PATCH', { name: '新名', google_place_id: 'place-2' }));
        expect(res.status).toBe(200);
        const shop = (await res.json()) as Rec;
        expect(shop.name).toBe('新名');
        expect(shop.google_place_id).toBe('place-1');
        expect(shop.updated_at).not.toBe(shop.created_at);
    });

    it('刪除：只有建立者刪得掉', async () => {
        await seedShop('mine');
        await env.DB.prepare("update shops set created_by = ?1 where id = 'mine'").bind(OTHER_ID).run();
        expect((await api('/api/shops/mine', { method: 'DELETE' })).status).toBe(404);
    });

    it('刪除：還有記錄掛著時回 23503', async () => {
        await seedShop('s1');
        await seedRecord('cupping_records', { id: 'c1', shopId: 's1' });
        const res = await api('/api/shops/s1', { method: 'DELETE' });
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ code: '23503' });
    });
});

describe('店家筆記', () => {
    it('第一次是新增，第二次是覆寫同一列', async () => {
        await seedShop('s1');
        const first = (await (
            await api('/api/shops/s1/note', send('PUT', { intro: '第一版', facilities: ['wifi'] }))
        ).json()) as Rec;
        expect(first.facilities).toEqual(['wifi']);

        const second = (await (
            await api('/api/shops/s1/note', send('PUT', { intro: '第二版', facilities: [] }))
        ).json()) as Rec;
        expect(second.id).toBe(first.id);
        expect(second.intro).toBe('第二版');
        expect(second.facilities).toEqual([]);
    });

    it('覆寫不到別人的筆記', async () => {
        await seedShop('s1');
        await env.DB.prepare(
            "insert into shop_notes (id, shop_id, user_id, intro) values ('theirs', 's1', ?1, '別人的')",
        )
            .bind(OTHER_ID)
            .run();
        await api('/api/shops/s1/note', send('PUT', { intro: '我的' }));
        const theirs = await env.DB.prepare("select intro from shop_notes where id = 'theirs'").first<Rec>();
        expect(theirs?.intro).toBe('別人的');
    });

    it('陣列欄位給了物件是 400', async () => {
        await seedShop('s1');
        expect((await api('/api/shops/s1/note', send('PUT', { facilities: { a: 1 } }))).status).toBe(400);
    });
});

describe('記錄寫入', () => {
    it('新增：user_id 由 Worker 決定，前端送的被忽略', async () => {
        const res = await api(
            '/api/records/cupping',
            json({ user_id: OTHER_ID, bean_name: '耶加', defects_tags: ['澀'] }),
        );
        expect(res.status).toBe(201);
        const row = (await res.json()) as Rec;
        expect(row.defects_tags).toEqual(['澀']);
        const stored = await env.DB.prepare('select user_id from cupping_records where id = ?1')
            .bind(row.id)
            .first<Rec>();
        expect(stored?.user_id).toBe(OWNER_ID);
    });

    it('更新別人的記錄是 404，而且不會改到它', async () => {
        await seedRecord('cupping_records', { id: 'theirs', userId: OTHER_ID, extra: { bean_name: '原本' } });
        expect((await api('/api/records/cupping/theirs', send('PATCH', { bean_name: '被改了' }))).status).toBe(404);
        const stored = await env.DB.prepare("select bean_name from cupping_records where id = 'theirs'").first<Rec>();
        expect(stored?.bean_name).toBe('原本');
    });

    it('刪除自己的記錄回 204，刪別人的回 404', async () => {
        await seedRecord('cupping_records', { id: 'mine' });
        await seedRecord('cupping_records', { id: 'theirs', userId: OTHER_ID });
        expect((await api('/api/records/cupping/mine', { method: 'DELETE' })).status).toBe(204);
        expect((await api('/api/records/cupping/theirs', { method: 'DELETE' })).status).toBe(404);
    });
});

describe('PUT /api/sessions/:id', () => {
    const put = (id: string, session: Rec, cups: Rec[]) => api(`/api/sessions/${id}`, send('PUT', { session, cups }));

    it('新增場次與杯，position 依陣列順序', async () => {
        const res = await put('g1', { title: '週末杯測' }, [
            { id: 'cup-a', code: 'A', bean_name: '甲' },
            { id: 'cup-b', code: 'B', bean_name: '乙' },
        ]);
        expect(res.status).toBe(204);

        const s = await getJson<Rec>('/api/sessions/g1');
        expect(s.title).toBe('週末杯測');
        expect((s.cups as Rec[]).map((c) => [c.code, c.position])).toEqual([
            ['A', 0],
            ['B', 1],
        ]);
    });

    // 這是整個改寫的理由：SQLite 沒有 deferrable unique。
    it('A 與 B 互換編號不會撞到 unique', async () => {
        await put('g1', {}, [
            { id: 'cup-a', code: 'A' },
            { id: 'cup-b', code: 'B' },
        ]);
        const res = await put('g1', {}, [
            { id: 'cup-a', code: 'B' },
            { id: 'cup-b', code: 'A' },
        ]);
        expect(res.status).toBe(204);

        const s = await getJson<Rec>('/api/sessions/g1');
        expect((s.cups as Rec[]).map((c) => [c.id, c.code])).toEqual([
            ['cup-a', 'B'],
            ['cup-b', 'A'],
        ]);
    });

    it('表單裡消失的杯會被刪掉', async () => {
        await put('g1', {}, [
            { id: 'cup-a', code: 'A' },
            { id: 'cup-b', code: 'B' },
        ]);
        await put('g1', {}, [{ id: 'cup-b', code: 'B' }]);
        const s = await getJson<Rec>('/api/sessions/g1');
        expect((s.cups as Rec[]).map((c) => c.id)).toEqual(['cup-b']);
    });

    it('存活的杯保留原本的 created_at', async () => {
        await seedSession('g1');
        await seedCup('cup-a', 'g1', 'A', 0);
        await env.DB.prepare("update cupping_session_cups set created_at = '2020-01-01T00:00:00.000Z'").run();

        await put('g1', {}, [{ id: 'cup-a', code: 'A', bean_name: '改過' }]);
        const s = await getJson<Rec>('/api/sessions/g1');
        expect((s.cups as Rec[])[0].created_at).toBe('2020-01-01T00:00:00.000Z');
        expect((s.cups as Rec[])[0].bean_name).toBe('改過');
    });

    it('重複編號是 400 / 23505，而且什麼都沒寫進去', async () => {
        const res = await put('g1', {}, [
            { id: 'cup-a', code: 'A' },
            { id: 'cup-b', code: 'A' },
        ]);
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: '23505' });
        expect(await getJson('/api/sessions/g1')).toBeNull();
    });

    it('空的編號是 400', async () => {
        expect((await put('g1', {}, [{ id: 'cup-a', code: '  ' }])).status).toBe(400);
    });

    it('沒有杯是 400', async () => {
        expect((await put('g1', {}, [])).status).toBe(400);
    });

    it('拿別人的場次 id 來 PUT 是 404，且完全沒動到它', async () => {
        await seedSession('g1', OTHER_ID);
        await seedCup('their-cup', 'g1', 'A', 0, OTHER_ID);
        expect((await put('g1', { title: '竊取' }, [{ id: 'x', code: 'Z' }])).status).toBe(404);

        const cups = await env.DB.prepare("select id from cupping_session_cups where session_id = 'g1'").all<Rec>();
        expect(cups.results.map((r) => r.id)).toEqual(['their-cup']);
    });

    it('整個請求可以原封不動重送', async () => {
        const cups = [{ id: 'cup-a', code: 'A', bean_name: '甲' }];
        await put('g1', { title: '一' }, cups);
        expect((await put('g1', { title: '一' }, cups)).status).toBe(204);
        const s = await getJson<Rec>('/api/sessions/g1');
        expect((s.cups as Rec[]).length).toBe(1);
    });

    it('刪場次時杯一起 cascade 掉', async () => {
        await put('g1', {}, [{ id: 'cup-a', code: 'A' }]);
        expect((await api('/api/sessions/g1', { method: 'DELETE' })).status).toBe(204);
        const cups = await env.DB.prepare('select count(*) as n from cupping_session_cups').first<{ n: number }>();
        expect(cups?.n).toBe(0);
    });

    it('刪別人的場次是 404', async () => {
        await seedSession('g1', OTHER_ID);
        expect((await api('/api/sessions/g1', { method: 'DELETE' })).status).toBe(404);
    });
});
