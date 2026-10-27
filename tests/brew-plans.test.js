import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import vm from 'node:vm';
import { loadApp } from './load-app.js';

let win, dom;
beforeAll(async () => { ({ window: win, dom } = await loadApp()); });
// 頂層 const 不是 window 的屬性，要在 app.js 的 context 裡讀。
const app = expr => vm.runInContext(expr, dom.getInternalVMContext());

const pour = (at, to, x = {}) => ({ type: 'pour', at_seconds: at, to_g: to, ...x });
const wait = (until, x = {}) => ({ type: 'wait', until_seconds: until, ...x });

// James Hoffmann Ultimate V60（2 杯）：#146 的範例，最後一注後面接兩個等待。
const HOFFMANN_STEPS = [
    pour(0, 60, { bloom: true }), wait(45, { note: '輕搖' }),
    pour(45, 300), pour(75, 500), wait(105), wait(210, { note: '輕攪，等待滴完' }),
];

describe('planSummary', () => {
    it('totals the last pour, rounds the ratio and ends at the last step', () => {
        const s = win.planSummary({ dose_g: 30, steps: HOFFMANN_STEPS });
        expect(s).toEqual({ total: 500, ratio: '1:16.7', pourCount: 3, endSeconds: 210 });
    });

    it('drops the decimal when the ratio is whole', () => {
        const steps = [pour(0, 60), pour(45, 120), pour(90, 180), pour(135, 240), pour(180, 300)];
        expect(win.planSummary({ dose_g: 20, steps }).ratio).toBe('1:15');
    });
});

// 唯讀頁的步驟時間軸：注水後面寫的等待併進同一格；接兩個等待時第二個自己一塊（#146）。
describe('planBlocks', () => {
    it('groups the Hoffmann steps the way the canvas shows them', () => {
        expect(win.planBlocks(HOFFMANN_STEPS)).toEqual([
            { kind: 'pour', start: 0, end: 45, inc: 60, cum: 60, from: 0, bloom: true, temp: null, note: '輕搖' },
            { kind: 'pour', start: 45, end: 75, inc: 240, cum: 300, from: 60, bloom: false, temp: null, note: '' },
            { kind: 'pour', start: 75, end: 105, inc: 200, cum: 500, from: 300, bloom: false, temp: null, note: '' },
            { kind: 'wait', start: 105, end: 210, cum: 500, note: '輕攪，等待滴完' },
        ]);
    });

    it('labels a merged wait note unless the pour is the bloom', () => {
        const blocks = win.planBlocks([pour(0, 45, { note: '繞圈' }), pour(35, 150), pour(75, 250, { water_temp: 90 }), wait(165, { note: '等待滴完' })]);
        expect(blocks[0].note).toBe('繞圈');
        expect(blocks[2]).toMatchObject({ start: 75, end: 165, temp: 90, note: '等待：等待滴完' });
    });

    it('ends a final pour with no wait at its own start', () => {
        const blocks = win.planBlocks([pour(0, 60), pour(45, 120)]);
        expect(blocks[1]).toMatchObject({ start: 45, end: 45 });
    });
});

// 時間條：每一塊是條上的一段；注水上方標 +N g，下方標每個時間點（#146「時間條」）。
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

    it('skips zero-length blocks', () => {
        expect(win.planBar([pour(0, 60), pour(45, 120)]).segments).toEqual([{ kind: 'pour', start: 0, end: 45 }]);
    });
});

describe('brewPlanMeta', () => {
    it('reads {濾杯} {水溫} 粉 N g 水 N g', () => {
        expect(win.brewPlanMeta({ dripper: 'V60', water_temp: 93, dose_g: 15, steps: [pour(0, 45), pour(35, 250)] }))
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

    it('stores the Hoffmann last pour as a pour and two waits', () => {
        const h = app('BUILTIN_BREW_PLANS')[1];
        expect(h.steps.slice(3).map(s => win.stepTime(s))).toEqual([75, 105, 210]);
        expect(win.planSummary(h)).toMatchObject({ total: 500, ratio: '1:16.7', endSeconds: 210 });
    });

    it('obeys the API rules', () => {
        for (const p of app('BUILTIN_BREW_PLANS')) {
            expect(p.builtin).toBe(true);
            expect(p.id).toMatch(/^builtin-/);
            expect(p.water_temp).toBeGreaterThanOrEqual(0);
            expect(p.water_temp).toBeLessThanOrEqual(100);
            expect(p.steps[0]).toMatchObject({ type: 'pour', at_seconds: 0 });
            let lastT = 0, lastTo = 0;
            p.steps.forEach((s, i) => {
                expect(win.stepTime(s)).toBeGreaterThanOrEqual(lastT);
                lastT = win.stepTime(s);
                if (s.type === 'pour') { expect(s.to_g).toBeGreaterThan(lastTo); lastTo = s.to_g; }
                if (s.bloom) expect(i).toBe(0);
            });
        }
    });
});

// 編輯頁的草稿：注水列輸入本次（inc），存檔才換成累計。
const draftOf = (rows, x = {}) => ({
    name: '日常 15 g', description: '', dripper: 'V60', grind: '中細', dose_g: 15, water_temp: 93, rows, ...x,
});
const pr = (at, inc, x = {}) => ({ type: 'pour', at_seconds: at, inc, ...x });
const wr = (until, x = {}) => ({ type: 'wait', until_seconds: until, ...x });

describe('brewPlanPayload', () => {
    it('sends cumulative to_g, water_temp and bloom, and nothing about tags', () => {
        const body = win.brewPlanPayload(draftOf([pr(0, 60, { bloom: true }), pr(45, 60), pr(90, 60)], { dose_g: 20 }));
        expect(body).toEqual({
            name: '日常 15 g', description: null, dripper: 'V60', grind: '中細', dose_g: 20, water_temp: 93,
            steps: [pour(0, 60, { bloom: true }), pour(45, 120), pour(90, 180)],
        });
    });

    it('trims text, drops blank notes and per-pour temps, and only keeps a true bloom', () => {
        const body = win.brewPlanPayload(draftOf([
            pr(0, 45, { bloom: false, note: '  ', water_temp: null }), wr(35, { note: ' 輕搖 ' }), pr(35, 105, { water_temp: 90 }),
        ], { name: '  日常  ', description: ' 平日早上 ' }));
        expect(body.name).toBe('日常');
        expect(body.description).toBe('平日早上');
        expect(body.steps).toEqual([pour(0, 45), wait(35, { note: '輕搖' }), pour(35, 150, { water_temp: 90 })]);
    });
});

describe('validateBrewPlanDraft', () => {
    const fields = d => win.validateBrewPlanDraft(d).map(e => e.field);

    it('accepts a complete plan, including dose 100', () => {
        expect(fields(draftOf([pr(0, 60)], { dose_g: 100 }))).toEqual([]);
    });

    it('flags what the API would reject', () => {
        expect(fields(draftOf([pr(0, 60)], { name: ' ' }))).toEqual(['name']);
        expect(fields(draftOf([pr(0, 60)], { dose_g: 0 }))).toEqual(['dose_g']);
        expect(fields(draftOf([pr(0, 60)], { dose_g: 100.5 }))).toEqual(['dose_g']);
        expect(fields(draftOf([pr(0, 60)], { water_temp: null }))).toEqual(['water_temp']);
        expect(fields(draftOf([pr(0, 60)], { description: 'x'.repeat(501) }))).toEqual(['description']);
        expect(fields(draftOf([pr(0, 0)]))).toEqual(['rows.0']);
        expect(fields(draftOf([pr(0, 60), wr(30), pr(20, 60)]))).toEqual(['rows.2']);
        expect(fields(draftOf([pr(0, 60, { note: 'x'.repeat(101) })]))).toEqual(['rows.0']);
        expect(fields(draftOf([wr(30)]))).toEqual(['rows']);
    });

    it('allows a wait right after another wait', () => {
        expect(fields(draftOf([pr(0, 60), wr(30), wr(90)]))).toEqual([]);
    });
});

describe('brewPlanDraft', () => {
    it('opens a plan as 本次 rows', () => {
        const d = win.brewPlanDraft(app('BUILTIN_BREW_PLANS')[1]);
        expect(d.rows.slice(0, 4).map(r => r.inc ?? r.until_seconds)).toEqual([60, 45, 240, 200]);
        expect(d.name).toBe('James Hoffmann Ultimate V60（2 杯）');
    });

    it('names a copy「<原名>（複製）」and round-trips the steps', () => {
        const plan = app('BUILTIN_BREW_PLANS')[1];
        const d = win.brewPlanDraft(plan, { copy: true });
        expect(d.name).toBe('James Hoffmann Ultimate V60（2 杯）（複製）');
        expect(win.brewPlanPayload(d).steps).toEqual(plan.steps);
    });

    it('starts a new plan with one pour at 0:00 and 93°C', () => {
        const d = win.brewPlanDraft(null);
        expect(d).toMatchObject({ name: '', water_temp: 93, rows: [{ type: 'pour', at_seconds: 0 }] });
    });
});

// 畫面上輸入的是本次，存的是累計（#146「累計／本次」）。
describe('本次 ↔ 累計', () => {
    it('reads each pour as this pour minus the previous pour, skipping waits', () => {
        expect(win.pourIncrements(HOFFMANN_STEPS)).toEqual([60, null, 240, 200, null, null]);
    });

    it('turns 本次 into cumulative to_g (4:6 is 60 × 5 → 60 … 300)', () => {
        const rows = [0, 45, 90, 135, 180].map(at => ({ type: 'pour', at_seconds: at, inc: 60 }));
        expect(win.stepsFromIncrements(rows).map(s => s.to_g)).toEqual([60, 120, 180, 240, 300]);
    });

    it('rounds the running total to 0.1 g so floats do not drift', () => {
        const rows = [{ type: 'pour', at_seconds: 0, inc: 0.1 }, { type: 'pour', at_seconds: 30, inc: 0.2 }];
        expect(win.stepsFromIncrements(rows).map(s => s.to_g)).toEqual([0.1, 0.3]);
    });

    it('keeps waits as waits and drops the inc key', () => {
        const rows = [{ type: 'pour', at_seconds: 0, inc: 45, bloom: true }, { type: 'wait', until_seconds: 35, note: '輕搖' }];
        expect(win.stepsFromIncrements(rows)).toEqual([pour(0, 45, { bloom: true }), wait(35, { note: '輕搖' })]);
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
        steps: [pour(0, 45, { bloom: true }), wait(35, { note: '輕搖' }), pour(35, 150), pour(75, 250, { water_temp: 90 }), wait(165, { note: '等待滴完' })],
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

    it('prefills a copy and saves cumulative to_g without tags', async () => {
        await go('#/plans/new?from=builtin-kasuya-4-6');
        expect(d.getElementById('bp-name').value).toBe('粕谷哲 4:6（複製）');
        d.getElementById('bp-form').requestSubmit();
        await tick(); await tick();
        const post = calls.find(c => c.method === 'POST');
        expect(post.path).toBe('/api/brew-plans');
        expect(post.body.steps.map(s => s.to_g)).toEqual([60, 120, 180, 240, 300]);
        expect(post.body).toMatchObject({ water_temp: 92, dose_g: 20 });
        expect(post.body).not.toHaveProperty('tags');
    });

    it('never saves from a non-submit button', async () => {
        await go('#/plans/p1/edit');
        const buttons = [...d.querySelectorAll('#bp-form button:not([type="submit"])')];
        expect(buttons.length).toBeGreaterThan(5);
        for (const b of buttons) expect(b.getAttribute('type')).toBe('button');
    });

    it('merges the bloom wait into the first pour row while editing', async () => {
        await go('#/plans/p1/edit');
        d.getElementById('bp-steps-toggle').click();
        await tick();
        const rows = d.querySelectorAll('.bp-step');
        expect(rows).toHaveLength(4);
        expect(rows[0].querySelector('input[data-field="time"]').value).toBe('0:35');
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
