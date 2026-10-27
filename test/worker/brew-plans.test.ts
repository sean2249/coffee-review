import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { OTHER_ID, OWNER_ID, api, getJson, resetDb } from './helpers';

type Rec = Record<string, unknown>;

const send = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
});
const post = (body: unknown) => api('/api/brew-plans', send('POST', body));
const patch = (id: string, body: unknown) => api(`/api/brew-plans/${id}`, send('PATCH', body));

const pour = (at: number, to: number, extra: Rec = {}) => ({ type: 'pour', at_seconds: at, to_g: to, ...extra });
const wait = (until: number, extra: Rec = {}) => ({ type: 'wait', until_seconds: until, ...extra });

// 最小的合法計劃；各案例只覆寫要測的欄位。
const plan = (over: Rec = {}): Rec => ({
    name: '家裡的 4:6',
    dose_g: 20,
    water_temp: 92,
    steps: [pour(0, 60), pour(45, 120)],
    ...over,
});

// 直接寫進 D1：別人的計劃無法經由 API 建立（身分固定是 OWNER）。
async function seedPlan(id: string, userId = OWNER_ID, name = `計劃 ${id}`, updatedAt = '2026-01-01T00:00:00.000Z') {
    await env.DB.prepare(
        `insert into brew_plans (id, user_id, name, dose_g, water_temp, steps, updated_at)
         values (?1, ?2, ?3, 20, 92, ?4, ?5)`,
    )
        .bind(id, userId, name, JSON.stringify([pour(0, 60)]), updatedAt)
        .run();
}

beforeEach(resetDb);

describe('POST /api/brew-plans', () => {
    it('新增：Worker 蓋上 id 與 user_id，忽略前端送的擁有者與已取消的欄位', async () => {
        const res = await post(
            plan({
                id: 'client-chosen',
                user_id: OTHER_ID,
                created_at: '2000-01-01T00:00:00.000Z',
                tags: ['日常'],
                target_seconds: 210,
                description: '  淺焙用  ',
                steps: [pour(0, 50, { bloom: true }), wait(45, { note: ' 輕搖 ' }), pour(45, 100)],
            }),
        );
        expect(res.status).toBe(201);
        const row = (await res.json()) as Rec;
        expect(row.id).not.toBe('client-chosen');
        expect(row.user_id).toBe(OWNER_ID);
        expect(row.created_at).not.toBe('2000-01-01T00:00:00.000Z');
        expect(row).not.toHaveProperty('tags');
        expect(row).not.toHaveProperty('target_seconds');
        expect(row.description).toBe('淺焙用');
        expect(row.steps).toEqual([
            { type: 'pour', at_seconds: 0, to_g: 50, bloom: true },
            { type: 'wait', until_seconds: 45, note: '輕搖' },
            { type: 'pour', at_seconds: 45, to_g: 100 },
        ]);
    });
});

describe('GET /api/brew-plans', () => {
    it('只回自己的計劃，最近改過的在前', async () => {
        await seedPlan('old', OWNER_ID, '舊的', '2026-01-01T00:00:00.000Z');
        await seedPlan('new', OWNER_ID, '新的', '2026-03-01T00:00:00.000Z');
        await seedPlan('theirs', OTHER_ID, '別人的', '2026-05-01T00:00:00.000Z');
        const rows = await getJson<Rec[]>('/api/brew-plans');
        expect(rows.map((r) => r.id)).toEqual(['new', 'old']);
        expect(rows[0].steps).toEqual([{ type: 'pour', at_seconds: 0, to_g: 60 }]);
    });

    it('別人的與不存在的 id 都回 200 null', async () => {
        await seedPlan('mine');
        await seedPlan('theirs', OTHER_ID);
        expect((await getJson<Rec>('/api/brew-plans/mine')).id).toBe('mine');
        expect(await getJson('/api/brew-plans/theirs')).toBeNull();
        expect(await getJson('/api/brew-plans/nope')).toBeNull();
    });
});

describe('PATCH / DELETE /api/brew-plans/:id', () => {
    it('PATCH 自己的只改有送的欄位，updated_at 變新', async () => {
        await seedPlan('mine', OWNER_ID, '原本', '2026-01-01T00:00:00.000Z');
        const res = await patch('mine', { description: '新說明' });
        expect(res.status).toBe(200);
        const row = (await res.json()) as Rec;
        expect(row.description).toBe('新說明');
        expect(row.name).toBe('原本');
        expect(row.dose_g).toBe(20);
        expect(String(row.updated_at) > '2026-01-01T00:00:00.000Z').toBe(true);
    });

    it('PATCH 別人的回 404，而且它沒變', async () => {
        await seedPlan('theirs', OTHER_ID, '別人的');
        expect((await patch('theirs', { name: '被改了' })).status).toBe(404);
        const stored = await env.DB.prepare("select name from brew_plans where id = 'theirs'").first<Rec>();
        expect(stored?.name).toBe('別人的');
    });

    it('PATCH 白名單內什麼都沒送回 400', async () => {
        await seedPlan('mine');
        expect((await patch('mine', { tags: ['日常'] })).status).toBe(400);
    });

    it('DELETE 自己的回 204、之後讀回 null；刪別人的回 404，它還在', async () => {
        await seedPlan('mine');
        await seedPlan('theirs', OTHER_ID);
        expect((await api('/api/brew-plans/mine', { method: 'DELETE' })).status).toBe(204);
        expect(await getJson('/api/brew-plans/mine')).toBeNull();
        expect((await api('/api/brew-plans/theirs', { method: 'DELETE' })).status).toBe(404);
        const stored = await env.DB.prepare("select id from brew_plans where id = 'theirs'").first<Rec>();
        expect(stored?.id).toBe('theirs');
    });
});

describe('同名', () => {
    it('同一人名稱只差大小寫或頭尾空白：第二個回 409 + 23505', async () => {
        expect((await post(plan({ name: 'V60 日常' }))).status).toBe(201);
        const res = await post(plan({ name: ' v60 日常 ' }));
        expect(res.status).toBe(409);
        expect(((await res.json()) as Rec).code).toBe('23505');
    });

    it('PATCH 改名撞名也是 409', async () => {
        await seedPlan('a', OWNER_ID, 'V60 日常');
        await seedPlan('b', OWNER_ID, '其他');
        const res = await patch('b', { name: 'v60 日常' });
        expect(res.status).toBe(409);
        expect(((await res.json()) as Rec).code).toBe('23505');
    });

    it('另一個使用者可以用同一個名稱', async () => {
        await seedPlan('theirs', OTHER_ID, 'V60 日常');
        expect((await post(plan({ name: 'V60 日常' }))).status).toBe(201);
    });

    it('名稱存的是去掉頭尾空白後的值', async () => {
        const row = (await (await post(plan({ name: '  家裡的 Hoffmann  ' }))).json()) as Rec;
        expect(row.name).toBe('家裡的 Hoffmann');
    });
});

const planCount = async () =>
    (await env.DB.prepare('select count(*) as n from brew_plans').first<{ n: number }>())?.n;

describe('計劃欄位驗證', () => {
    const omit = (key: string) => {
        const p = plan();
        delete p[key];
        return p;
    };

    it.each([
        ['名稱空白', plan({ name: '   ' })],
        ['缺名稱', omit('name')],
        ['名稱 41 字', plan({ name: '名'.repeat(41) })],
        ['缺 dose_g', omit('dose_g')],
        ['dose_g 為 0', plan({ dose_g: 0 })],
        ['dose_g 為 100.1', plan({ dose_g: 100.1 })],
        ['dose_g 是字串', plan({ dose_g: '20' })],
        ['缺 water_temp', omit('water_temp')],
        ['water_temp 為 null', plan({ water_temp: null })],
        ['water_temp 為 120', plan({ water_temp: 120 })],
        ['description 501 字', plan({ description: '字'.repeat(501) })],
        ['dripper 不是字串', plan({ dripper: 60 })],
    ])('POST %s → 400，DB 沒有新增', async (_label, body) => {
        expect((await post(body)).status).toBe(400);
        expect(await planCount()).toBe(0);
    });

    it('PATCH 送 water_temp: null → 400，內容沒變', async () => {
        await seedPlan('mine');
        expect((await patch('mine', { water_temp: null })).status).toBe(400);
        const stored = await env.DB.prepare("select water_temp from brew_plans where id = 'mine'").first<Rec>();
        expect(stored?.water_temp).toBe(92);
    });

    it('邊界值都可以存：dose_g 100、water_temp 100、名稱 40 字、description 500 個 emoji', async () => {
        const res = await post(
            plan({ name: '名'.repeat(40), dose_g: 100, water_temp: 100, description: '😀'.repeat(500) }),
        );
        expect(res.status).toBe(201);
        const row = (await res.json()) as Rec;
        expect(row.dose_g).toBe(100);
        expect(row.water_temp).toBe(100);
        expect(row.description).toBe('😀'.repeat(500));
    });

    it('選填文字：空字串存成 null', async () => {
        const row = (await (await post(plan({ description: '', dripper: '  ', grind: ' 中細 ' }))).json()) as Rec;
        expect(row.description).toBeNull();
        expect(row.dripper).toBeNull();
        expect(row.grind).toBe('中細');
    });
});

describe('steps 形狀', () => {
    it('缺 steps → 400，DB 沒有新增', async () => {
        const body = plan();
        delete body.steps;
        expect((await post(body)).status).toBe(400);
        expect(await planCount()).toBe(0);
    });

    it.each([
        ['steps 為空陣列', []],
        ['steps 不是陣列', { type: 'pour' }],
        ['steps 為 null', null],
        ['某一步不是物件', [pour(0, 60), 'pour']],
        ["type 是 'stir'", [pour(0, 60), { type: 'stir', until_seconds: 30 }]],
        ['缺 type', [pour(0, 60), { until_seconds: 30 }]],
        ['注水缺 to_g', [pour(0, 60), { type: 'pour', at_seconds: 45 }]],
        ['注水缺 at_seconds', [pour(0, 60), { type: 'pour', to_g: 120 }]],
        ['等待缺 until_seconds', [pour(0, 60), { type: 'wait' }]],
        ['at_seconds 為負數', [pour(0, 60), pour(-5, 120)]],
        ['at_seconds 為小數', [pour(0, 60), pour(45.5, 120)]],
        ['until_seconds 為小數', [pour(0, 60), wait(30.5)]],
        ['to_g 為 0', [pour(0, 0)]],
        ['to_g 超過 2000', [pour(0, 60), pour(45, 2000.5)]],
        ['某注 water_temp 為 150', [pour(0, 60), pour(45, 120, { water_temp: 150 })]],
        ['bloom 不是 boolean', [pour(0, 60, { bloom: 'yes' })]],
        ['某步 note 101 字', [pour(0, 60), wait(30, { note: '字'.repeat(101) })]],
        ['31 個步驟', [pour(0, 10), ...Array.from({ length: 30 }, (_, i) => pour(i + 1, 20 + i))]],
    ])('%s → 400，DB 沒有新增', async (_label, steps) => {
        expect((await post(plan({ steps }))).status).toBe(400);
        expect(await planCount()).toBe(0);
    });

    it('30 個步驟可以存', async () => {
        const steps = [pour(0, 10), ...Array.from({ length: 29 }, (_, i) => pour(i + 1, 20 + i))];
        expect((await post(plan({ steps }))).status).toBe(201);
    });
});

describe('steps 順序', () => {
    it.each([
        ['第一步是等待', [wait(0), pour(0, 60)]],
        ['只有等待沒有注水', [wait(30)]],
        ['第一注不是從 0 開始', [pour(5, 60), pour(45, 120)]],
        ['等待晚於下一注', [pour(0, 60), wait(50), pour(45, 120)]],
        ['某注時間比前一步早', [pour(0, 60), pour(45, 120), pour(30, 180)]],
        ['累計沒有大於前一注', [pour(0, 60), pour(45, 60)]],
        ['隔著等待累計也要遞增', [pour(0, 120), wait(60), pour(90, 100)]],
        ['第二注標悶蒸', [pour(0, 60), pour(45, 120, { bloom: true })]],
    ])('%s → 400，DB 沒有新增', async (_label, steps) => {
        expect((await post(plan({ steps }))).status).toBe(400);
        expect(await planCount()).toBe(0);
    });

    it.each([
        ['時間相同的步驟', [pour(0, 60), wait(0, { note: '攪拌' }), pour(45, 120)]],
        ['兩個等待連在一起', [pour(0, 60), pour(75, 500), wait(105), wait(210)]],
        ['悶蒸後面不接等待', [pour(0, 60, { bloom: true }), pour(40, 200)]],
    ])('%s → 201', async (_label, steps) => {
        expect((await post(plan({ steps }))).status).toBe(201);
    });
});

describe('正規化', () => {
    it('步驟只留該型別的鍵：多送的、另一型別的、舊鍵名 temp_c 都不見；空備註與 bloom: false 不寫', async () => {
        const res = await post(
            plan({
                steps: [
                    pour(0, 60, { bloom: false, note: '  ', extra: 1, until_seconds: 9, temp_c: 90 }),
                    wait(30, { to_g: 999, note: '輕搖' }),
                    pour(45, 120, { water_temp: 90, note: null }),
                ],
            }),
        );
        expect(res.status).toBe(201);
        const id = ((await res.json()) as Rec).id as string;
        // 從 GET 讀回，確認存進 D1 的就是正規化後的形狀，不只是回應。
        expect((await getJson<Rec>(`/api/brew-plans/${id}`)).steps).toEqual([
            { type: 'pour', at_seconds: 0, to_g: 60 },
            { type: 'wait', until_seconds: 30, note: '輕搖' },
            { type: 'pour', at_seconds: 45, to_g: 120, water_temp: 90 },
        ]);
    });

    it('PATCH 送 steps 也照同樣的規則驗，壞的回 400 且沒變', async () => {
        await seedPlan('mine');
        expect((await patch('mine', { steps: [pour(0, 60), pour(45, 50)] })).status).toBe(400);
        expect((await getJson<Rec>('/api/brew-plans/mine')).steps).toEqual([{ type: 'pour', at_seconds: 0, to_g: 60 }]);
        const ok = await patch('mine', { steps: [pour(0, 60), wait(40, { note: '攪拌' }), pour(45, 120)] });
        expect(ok.status).toBe(200);
        expect(((await ok.json()) as Rec).steps).toHaveLength(3);
    });
});
