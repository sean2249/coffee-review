import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import vm from 'node:vm';
import { loadApp } from './load-app.js';

let win, dom;
beforeAll(async () => { ({ window: win, dom } = await loadApp()); });
// 頂層 const 不是 window 的屬性，要在 app.js 的 context 裡讀。
const app = expr => vm.runInContext(expr, dom.getInternalVMContext());

// 每一步存自己的秒數，注水存本次水量（docs/adr/0003）。
const pour = (seconds, water, x = {}) => ({ type: 'pour', seconds, water_g: water, ...x });
const wait = (seconds, x = {}) => ({ type: 'wait', seconds, ...x });

// James Hoffmann Ultimate V60（2 杯）：悶蒸、兩注，最後一個等待收尾。
const HOFFMANN_STEPS = [
    pour(45, 60, { bloom: true, note: '輕搖' }), pour(30, 240), pour(30, 200), wait(105, { note: '輕攪，等待滴完' }),
];

describe('planSummary', () => {
    it('sums water and seconds, and rounds the ratio', () => {
        const s = win.planSummary({ dose_g: 30, steps: HOFFMANN_STEPS });
        expect(s).toEqual({ total: 500, ratio: '1:16.7', pourCount: 3, endSeconds: 210 });
    });

    it('drops the decimal when the ratio is whole', () => {
        const steps = [pour(45, 60), pour(45, 60), pour(45, 60), pour(45, 60), pour(30, 60)];
        expect(win.planSummary({ dose_g: 20, steps }).ratio).toBe('1:15');
    });

    it('rounds the water total to 0.1 g so floats do not drift', () => {
        expect(win.planSummary({ dose_g: 1, steps: [pour(10, 0.1), pour(10, 0.2)] }).total).toBe(0.3);
    });
});

// 一步一塊：開始時間是前面各步的加總，長度是自己的秒數；沒有合併格（#155）。
describe('planBlocks', () => {
    it('lays out Hoffmann one block per step', () => {
        expect(win.planBlocks(HOFFMANN_STEPS)).toEqual([
            { kind: 'pour', start: 0, end: 45, inc: 60, cum: 60, from: 0, bloom: true, temp: null, note: '輕搖' },
            { kind: 'pour', start: 45, end: 75, inc: 240, cum: 300, from: 60, bloom: false, temp: null, note: '' },
            { kind: 'pour', start: 75, end: 105, inc: 200, cum: 500, from: 300, bloom: false, temp: null, note: '' },
            { kind: 'wait', start: 105, end: 210, cum: 500, note: '輕攪，等待滴完' },
        ]);
    });

    it('keeps a wait between two pours as its own block', () => {
        const blocks = win.planBlocks([pour(30, 45, { note: '繞圈' }), wait(20, { note: '攪拌' }), pour(40, 100, { water_temp: 90 })]);
        expect(blocks.map(b => [b.kind, b.start, b.end])).toEqual([['pour', 0, 30], ['wait', 30, 50], ['pour', 50, 90]]);
        expect(blocks[0].note).toBe('繞圈');
        expect(blocks[1]).toMatchObject({ cum: 45, note: '攪拌' });
        expect(blocks[2]).toMatchObject({ from: 45, cum: 145, temp: 90 });
    });
});

// 時間條：一步一格、寬度依秒數；注水上方標 +N g，下方標每個時間點。
describe('planBar', () => {
    it('cuts Hoffmann into three pours and one wait', () => {
        const bar = win.planBar(HOFFMANN_STEPS);
        expect(bar.segments).toEqual([
            { kind: 'pour', start: 0, end: 45 },
            { kind: 'pour', start: 45, end: 75 },
            { kind: 'pour', start: 75, end: 105 },
            { kind: 'wait', start: 105, end: 210 },
        ]);
        expect(bar.amounts).toEqual([
            { at: 22.5, text: '+60 g' }, { at: 60, text: '+240 g' }, { at: 90, text: '+200 g' },
        ]);
        expect(bar.times).toEqual([0, 45, 75, 105, 210]);
        expect(bar.end).toBe(210);
    });

    it('gives every step a segment as long as its seconds', () => {
        const steps = [pour(40, 60), wait(5), wait(15), pour(50, 140)];
        expect(win.planBar(steps).segments.map(s => s.end - s.start)).toEqual([40, 5, 15, 50]);
    });
});

describe('brewPlanMeta', () => {
    it('reads {濾杯} {水溫} 粉 N g 水 N g', () => {
        expect(win.brewPlanMeta({ dripper: 'V60', water_temp: 93, dose_g: 15, steps: [pour(35, 45), pour(130, 205)] }))
            .toEqual({ dripper: 'V60', temp: '93°C', dose: '15', water: '250' });
    });

    it('writes 100°C as 沸騰 and leaves a missing dripper blank', () => {
        const meta = win.brewPlanMeta({ dripper: null, water_temp: 100, dose_g: 30, steps: HOFFMANN_STEPS });
        expect(meta).toMatchObject({ dripper: '', temp: '沸騰', dose: '30', water: '500' });
    });
});

// 內建手沖法要過 Worker 同一套規則（routes/brew-plans.ts normalizePlan），複製成我的才存得進去。
describe('BUILTIN_BREW_PLANS', () => {
    it('has the four V60 plans from #143', () => {
        expect(app('BUILTIN_BREW_PLANS').map(p => p.name)).toEqual([
            '粕谷哲 4:6', 'James Hoffmann Ultimate V60（2 杯）', 'James Hoffmann 1 杯 V60', 'Scott Rao V60',
        ]);
    });

    it('matches the totals in #155', () => {
        const totals = app('BUILTIN_BREW_PLANS').map(p => {
            const s = win.planSummary(p);
            return [win.fmtClock(s.endSeconds), s.total];
        });
        expect(totals).toEqual([['3:30', 300], ['3:30', 500], ['3:00', 250], ['4:15', 330]]);
    });

    it('gives the 4:6 last pour its own 30 seconds instead of a closing wait', () => {
        const k = app('BUILTIN_BREW_PLANS')[0];
        expect(k.steps.at(-1)).toEqual(pour(30, 60, { note: '移開濾杯' }));
        expect(k.steps.every(s => s.type === 'pour')).toBe(true);
    });

    it('obeys the API rules', () => {
        const KEYS = { pour: ['type', 'seconds', 'water_g', 'bloom', 'water_temp', 'note'], wait: ['type', 'seconds', 'note'] };
        for (const p of app('BUILTIN_BREW_PLANS')) {
            expect(p.builtin).toBe(true);
            expect(p.id).toMatch(/^builtin-/);
            expect(p.water_temp).toBeGreaterThanOrEqual(0);
            expect(p.water_temp).toBeLessThanOrEqual(100);
            expect(p.steps[0].type).toBe('pour');
            expect(win.validateBrewPlanDraft(win.brewPlanDraft(p))).toEqual([]);
            p.steps.forEach((s, i) => {
                for (const k of Object.keys(s)) expect(KEYS[s.type]).toContain(k);
                expect(Number.isInteger(s.seconds) && s.seconds >= 1 && s.seconds <= 600).toBe(true);
                if (s.type === 'pour') expect(s.water_g).toBeGreaterThan(0);
                if (s.bloom) expect(i).toBe(0);
            });
        }
    });
});

// 編輯頁的草稿就是存檔形狀：每一列是一步（docs/adr/0003）。
const draftOf = (rows, x = {}) => ({
    name: '日常 15 g', description: '', dripper: 'V60', grind: '中細', dose_g: 15, water_temp: 93, rows, ...x,
});

describe('brewPlanPayload', () => {
    it('sends the rows as steps with schema_version 2, and nothing about tags', () => {
        const body = win.brewPlanPayload(draftOf([pour(45, 60, { bloom: true }), pour(45, 60), wait(30)], { dose_g: 20 }));
        expect(body).toEqual({
            name: '日常 15 g', description: null, dripper: 'V60', grind: '中細', dose_g: 20, water_temp: 93,
            steps: [pour(45, 60, { bloom: true }), pour(45, 60), wait(30)],
            schema_version: 2,
        });
    });

    it('trims text, drops blank notes and per-pour temps, and only keeps a true bloom', () => {
        const body = win.brewPlanPayload(draftOf([
            pour(35, 45, { bloom: false, note: '  ', water_temp: null }), wait(20, { note: ' 輕搖 ' }), pour(40, 105, { water_temp: 90 }),
        ], { name: '  日常  ', description: ' 平日早上 ' }));
        expect(body.name).toBe('日常');
        expect(body.description).toBe('平日早上');
        expect(body.steps).toEqual([pour(35, 45), wait(20, { note: '輕搖' }), pour(40, 105, { water_temp: 90 })]);
    });
});

describe('validateBrewPlanDraft', () => {
    const fields = d => win.validateBrewPlanDraft(d).map(e => e.field);

    it('accepts a complete plan, including dose 100 and seconds 1 / 600', () => {
        expect(fields(draftOf([pour(1, 60), wait(600)], { dose_g: 100 }))).toEqual([]);
    });

    it('flags what the API would reject', () => {
        expect(fields(draftOf([pour(45, 60)], { name: ' ' }))).toEqual(['name']);
        expect(fields(draftOf([pour(45, 60)], { dose_g: 0 }))).toEqual(['dose_g']);
        expect(fields(draftOf([pour(45, 60)], { dose_g: 100.5 }))).toEqual(['dose_g']);
        expect(fields(draftOf([pour(45, 60)], { water_temp: null }))).toEqual(['water_temp']);
        expect(fields(draftOf([pour(45, 60)], { description: 'x'.repeat(501) }))).toEqual(['description']);
        expect(fields(draftOf([pour(45, 0)]))).toEqual(['rows.0']);
        expect(fields(draftOf([pour(45, 2001)]))).toEqual(['rows.0']);
        expect(fields(draftOf([pour(45, 60), pour(0, 60)]))).toEqual(['rows.1']);
        expect(fields(draftOf([pour(45, 60), wait(601)]))).toEqual(['rows.1']);
        expect(fields(draftOf([pour(45, 60), wait(1.5)]))).toEqual(['rows.1']);
        expect(fields(draftOf([pour(45, 60), wait(NaN)]))).toEqual(['rows.1']);
        expect(fields(draftOf([pour(45, 60, { note: 'x'.repeat(101) })]))).toEqual(['rows.0']);
        expect(fields(draftOf([pour(45, 1000), pour(45, 1000.5)]))).toEqual(['rows']);
        expect(fields(draftOf([wait(30)]))).toEqual(['rows']);
    });

    it('allows a wait right after another wait', () => {
        expect(fields(draftOf([pour(45, 60), wait(30), wait(90)]))).toEqual([]);
    });
});

describe('brewPlanDraft', () => {
    it('opens a plan as a copy of its steps', () => {
        const plan = app('BUILTIN_BREW_PLANS')[1];
        const d = win.brewPlanDraft(plan);
        expect(d.rows).toEqual(plan.steps);
        d.rows[0].seconds = 1;
        expect(plan.steps[0].seconds).toBe(45);
        expect(d.name).toBe('James Hoffmann Ultimate V60（2 杯）');
    });

    it('names a copy「<原名>（複製）」and round-trips the steps', () => {
        const plan = app('BUILTIN_BREW_PLANS')[1];
        const d = win.brewPlanDraft(plan, { copy: true });
        expect(d.name).toBe('James Hoffmann Ultimate V60（2 杯）（複製）');
        expect(win.brewPlanPayload(d).steps).toEqual(plan.steps);
    });

    it('starts a new plan with one 45-second pour and 93°C', () => {
        const d = win.brewPlanDraft(null);
        expect(d).toMatchObject({ name: '', water_temp: 93, rows: [pour(45, 45)] });
    });
});

// ─── 路由與畫面（stub apiFetch，不連網）──────────────────────────────────────
describe('brew plan routes', () => {
    const BODY = `<main id="app"></main><nav>
        <a class="tabbar-btn" data-route="/records" href="#/records"></a>
        <a class="tabbar-btn" data-route="/me" href="#/me"></a>
    </nav>`;
    const tick = () => new Promise(r => setTimeout(r, 0));
    const MINE = {
        id: 'p1', name: '日常 15 g', description: '平日早上', dripper: 'Kalita Wave 185', grind: '中細',
        dose_g: 15, water_temp: 93, updated_at: '2026-10-27T00:00:00Z',
        steps: [pour(35, 45, { bloom: true, note: '輕搖' }), pour(40, 105), pour(30, 100, { water_temp: 90 }), wait(60, { note: '等待滴完' })],
    };
    let w, d, calls;
    const go = async hash => { w.location.hash = hash; await tick(); await tick(); };
    const html = () => d.getElementById('app').innerHTML;

    beforeEach(async () => {
        ({ window: w, document: d } = await loadApp({ bodyHtml: BODY }));
        w.setSessionUser({ id: 'u1', email: 'a@example.com' });
        calls = [];
        w.apiFetch = (path, opts = {}) => {
            calls.push({ path, method: opts.method || 'GET', body: opts.body });
            if (path === '/api/brew-plans' && !opts.method) return Promise.resolve([MINE]);
            if (path === '/api/brew-plans/p1' && !opts.method) return Promise.resolve(MINE);
            if (opts.method === 'POST') return Promise.resolve({ ...opts.body, id: 'p2' });
            return Promise.resolve(null);
        };
    });

    it('links 沖煮計劃 from #/me under 我的數據', async () => {
        await go('#/me');
        const links = [...d.querySelectorAll('#app a')].map(a => a.getAttribute('href'));
        expect(links.indexOf('#/plans')).toBeGreaterThan(links.indexOf('#/stats'));
    });

    it('lists my plans and the four built-ins, lighting up 個人', async () => {
        await go('#/plans');
        expect(html()).toContain('我的計劃');
        expect(html()).toContain('內建手沖法');
        expect(html()).toContain('日常 15 g');
        expect(html()).toContain('粉 15 g');
        expect(html()).toContain('水 250 g');
        expect(html()).toContain('Scott Rao V60');
        expect(html()).not.toContain('#V60');
        expect(d.querySelector('.tabbar-btn[aria-current="page"]')?.dataset.route).toBe('/me');
    });

    it('shows a built-in read-only with 複製成我的 and the Hoffmann wait block', async () => {
        await go('#/plans/builtin-hoffmann-ultimate-v60');
        expect(html()).toContain('複製成我的');
        expect(d.querySelector('a[href="#/plans/new?from=builtin-hoffmann-ultimate-v60"]')).not.toBeNull();
        expect(html()).toContain('+200 g');
        expect(html()).toContain('30 秒');
        expect(html()).toContain('1 分 45 秒');
        expect(html()).toContain('完成');
        expect(html()).not.toContain('悶蒸</');
    });

    it('shows my plan with a single 編輯 link in the header', async () => {
        await go('#/plans/p1');
        expect([...d.querySelectorAll('a[href="#/plans/p1/edit"]')]).toHaveLength(1);
        expect(html()).not.toContain('複製成我的');
    });

    it('prefills a copy and saves its steps as v2 without tags', async () => {
        await go('#/plans/new?from=builtin-kasuya-4-6');
        expect(d.getElementById('bp-name').value).toBe('粕谷哲 4:6（複製）');
        d.getElementById('bp-form').requestSubmit();
        await tick(); await tick();
        const post = calls.find(c => c.method === 'POST');
        expect(post.path).toBe('/api/brew-plans');
        expect(post.body.steps).toEqual(app('BUILTIN_BREW_PLANS')[0].steps);
        expect(post.body).toMatchObject({ water_temp: 92, dose_g: 20, schema_version: 2 });
        expect(post.body).not.toHaveProperty('tags');
    });

    it('never saves from a non-submit button', async () => {
        await go('#/plans/p1/edit');
        const buttons = [...d.querySelectorAll('#bp-form button:not([type="submit"])')];
        expect(buttons.length).toBeGreaterThan(5);
        for (const b of buttons) expect(b.getAttribute('type')).toBe('button');
    });

    it('shows one row per step, the first pour with its own seconds', async () => {
        await go('#/plans/p1/edit');
        d.getElementById('bp-steps-toggle').click();
        const rows = d.querySelectorAll('.bp-step');
        expect(rows).toHaveLength(4);
        expect(rows[0].querySelector('input[data-field="seconds"]').value).toBe('35');
        expect(rows[3].querySelector('input[data-field="seconds"]').value).toBe('60');
        expect(rows[3].querySelector('input[data-field="water_g"]')).toBeNull();
    });

    it('shifts the later start times while typing a middle step\'s seconds', async () => {
        await go('#/plans/p1/edit');
        d.getElementById('bp-steps-toggle').click();
        const starts = () => [...d.querySelectorAll('[data-start-index]')].map(el => el.textContent);
        expect(starts()).toEqual(['0:00', '0:35', '1:15', '1:45']);
        const input = d.querySelector('input[data-field="seconds"][data-index="1"]');
        input.value = '50';
        input.dispatchEvent(new w.Event('input', { bubbles: true }));
        expect(starts()).toEqual(['0:00', '0:35', '1:25', '1:55']);
        // 打字時不重畫列，輸入框還是同一個（不會失焦）。
        expect(d.body.contains(input)).toBe(true);
    });

    it('steps a pour\'s seconds by 5 with the ＋ button', async () => {
        await go('#/plans/p1/edit');
        d.getElementById('bp-steps-toggle').click();
        d.querySelector('[data-act="inc"][data-field="seconds"][data-index="0"]').click();
        expect(d.querySelector('input[data-field="seconds"][data-index="0"]').value).toBe('40');
        expect(d.querySelector('[data-start-index="1"]').textContent).toBe('0:40');
    });

    it('puts 刪除這步 inside the ⚙ panel instead of on the row', async () => {
        await go('#/plans/p1/edit');
        d.getElementById('bp-steps-toggle').click();
        const [, pourRow, , waitRow] = d.querySelectorAll('.bp-step');
        expect(pourRow.querySelector('.bp-step-main [data-act="remove"]')).toBeNull();
        pourRow.querySelector('[data-act="gear"]').click();
        const remove = d.querySelectorAll('.bp-step')[1].querySelector('.bp-step-panel [data-act="remove"]');
        expect(remove.textContent).toContain('刪除這步');
        expect(remove.getAttribute('type')).toBe('button');
        expect(waitRow.querySelector('.bp-step-main [data-act="remove"]')).toBeNull();
        remove.click();
        expect(d.querySelectorAll('.bp-step')).toHaveLength(3);
    });

    it('updates the left-column 累計 while typing a pour amount', async () => {
        await go('#/plans/p1/edit');
        d.getElementById('bp-steps-toggle').click();
        const input = d.querySelector('input[data-field="water_g"][data-index="1"]');
        input.value = '115';
        input.dispatchEvent(new w.Event('input', { bubbles: true }));
        expect(d.querySelector('[data-cum-index="1"]').textContent).toBe('160 g');
        expect(d.querySelector('[data-cum-index="2"]').textContent).toBe('260 g');
    });

    it('does not call a non-duplicate 409 a duplicate name', async () => {
        w.apiFetch = (path, opts = {}) => {
            if (opts.method === 'PATCH') return Promise.reject(Object.assign(new Error('fk'), { status: 409, code: '23503' }));
            return Promise.resolve(path === '/api/brew-plans/p1' ? MINE : [MINE]);
        };
        w.console.error = () => {};
        await go('#/plans/p1/edit');
        d.getElementById('bp-form').requestSubmit();
        await tick(); await tick();
        expect(html()).not.toContain('已有同名計劃');
    });

    it('PATCHes my plan and shows 已有同名計劃 on a 409', async () => {
        w.apiFetch = (path, opts = {}) => {
            if (opts.method === 'PATCH') return Promise.reject(Object.assign(new Error('dup'), { status: 409, code: '23505' }));
            return Promise.resolve(path === '/api/brew-plans/p1' ? MINE : [MINE]);
        };
        await go('#/plans/p1/edit');
        d.getElementById('bp-form').requestSubmit();
        await tick(); await tick();
        expect(html()).toContain('已有同名計劃');
        expect(w.location.hash).toBe('#/plans/p1/edit');
    });
});
