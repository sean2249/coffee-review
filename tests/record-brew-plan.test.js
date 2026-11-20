import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
const TEMPLATES = INDEX.match(/<template id="[^"]+">[\s\S]*?<\/template>/g).join('');
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 20)); };

// 沖煮記錄的「所依計劃」（#147，docs/adr/0004）：存計劃 id 與名稱，參數抄進記錄既有的五欄。

let win;
beforeAll(async () => { ({ window: win } = await loadApp()); });

const pour = (seconds, water, x = {}) => ({ type: 'pour', seconds, water_g: water, ...x });
const wait = seconds => ({ type: 'wait', seconds });

describe('brewPlanRecordFields', () => {
    it('copies 粕谷哲 4:6 into the record columns', () => {
        const plan = {
            id: 'builtin-kasuya-4-6', name: '粕谷哲 4:6', dripper: 'V60', grind: '粗', dose_g: 20, water_temp: 92,
            steps: [pour(45, 60), pour(45, 60), pour(45, 60), pour(45, 60), pour(30, 60)],
        };
        expect(win.brewPlanRecordFields(plan)).toEqual({
            brew_plan_id: 'builtin-kasuya-4-6', brew_plan_name: '粕谷哲 4:6',
            method: 'V60', grind: '粗', water_temp: '92', ratio: '1:15', extraction_time: '210',
        });
    });

    it('uses the plan name as the method when no dripper is set', () => {
        const plan = { id: 'p1', name: '家裡的日常', dripper: null, grind: null, dose_g: 15, water_temp: null,
            steps: [pour(60, 250), wait(105)] };
        expect(win.brewPlanRecordFields(plan)).toEqual({
            brew_plan_id: 'p1', brew_plan_name: '家裡的日常',
            method: '家裡的日常', grind: null, water_temp: null, ratio: '1:16.7', extraction_time: '165',
        });
    });
});

// 表單走真的 router（#/new/cupping），只 stub apiFetch。
describe('沖煮表單：依計劃沖', () => {
    const MINE = { id: 'p1', name: '家裡的日常', dripper: null, grind: null, dose_g: 15, water_temp: 93,
        steps: [pour(60, 250), wait(105)] };

    let fwin, doc, posts;
    const $ = sel => doc.querySelector(sel);

    beforeEach(async () => {
        ({ window: fwin, document: doc } = await loadApp({ bodyHtml: `<main id="app"></main>${TEMPLATES}` }));
        posts = [];
        fwin.apiFetch = (p, init = {}) => {
            if (init.method === 'POST') { posts.push(init.body); return Promise.resolve({ id: 'r1' }); }
            if (p === '/api/brew-plans') return Promise.resolve([MINE]);
            if (p === '/api/shops' || p.startsWith('/api/records?') || p.endsWith('/beans')) return Promise.resolve([]);
            return Promise.resolve(null);
        };
        fwin.setSessionUser({ id: 'u1' });
        fwin.location.hash = '#/new/cupping';
        await settle();
        $('.bean-type-chip-row[data-bean-type-group="cupping"] .bean-type-chip').click();
        $('#f-cupping-bean').value = '耶加雪菲';
    });

    async function pick(id) {
        $('#f-brew-plan-open').click();
        await settle();
        doc.querySelector(`.brew-plan-option[data-plan-id="${id}"]`).click();
        await settle();
    }

    async function save() {
        $('#f-save').click();
        await settle();
        return posts[0];
    }

    it('沒選計劃時只有方法，研磨度等四欄不在表單上', () => {
        expect($('#f-method')).not.toBeNull();
        for (const id of ['f-grind', 'f-water_temp', 'f-ratio', 'f-extraction_time']) expect($(`#${id}`)).toBeNull();
        expect($('#f-brew-plan-summary').hidden).toBe(true);
    });

    it('面板列出我的計劃與 4 個內建手沖法', async () => {
        $('#f-brew-plan-open').click();
        await settle();
        const ids = [...doc.querySelectorAll('.brew-plan-option')].map(b => b.dataset.planId);
        expect(ids).toEqual(['p1', 'builtin-kasuya-4-6', 'builtin-hoffmann-ultimate-v60',
            'builtin-hoffmann-1-cup', 'builtin-scott-rao-v60']);
    });

    it('選了內建 4:6：卡片收成摘要，存檔帶計劃與抄下來的參數', async () => {
        await pick('builtin-kasuya-4-6');
        expect(doc.querySelector('.brew-plan-option')).toBeNull();
        expect($('#f-brew-plan-summary').hidden).toBe(false);
        expect($('#f-brew-plan-summary').textContent).toContain('粕谷哲 4:6');
        expect($('#f-brew-plan-summary').textContent).toContain('1:15');
        expect($('#f-brew-free').hidden).toBe(true);
        expect(await save()).toMatchObject({
            brew_plan_id: 'builtin-kasuya-4-6', brew_plan_name: '粕谷哲 4:6',
            method: 'V60', grind: '粗', water_temp: '92', ratio: '1:15', extraction_time: '210',
        });
    });

    it('按「不用計劃」回到只有方法，存檔不帶計劃', async () => {
        await pick('p1');
        $('#f-brew-plan-clear').click();
        expect($('#f-brew-plan-summary').hidden).toBe(true);
        expect($('#f-brew-free').hidden).toBe(false);
        doc.querySelector('.brewing-method-chip[data-method="耳掛包"]').click();
        expect(await save()).toMatchObject({
            brew_plan_id: null, brew_plan_name: null,
            method: '耳掛包', grind: null, water_temp: null, ratio: null, extraction_time: null,
        });
    });
});

// 詳細頁（#/cupping/<id>）：顯示抄下來的參數；計劃還在就連過去，找不到就標「計劃已刪除」。
describe('沖煮記錄詳細頁：所依計劃', () => {
    const REC = { id: 'r1', bean_name: '耶加雪菲', method: 'V60', water_temp: '93', ratio: '1:16.7',
        extraction_time: '165', created_at: '2026-11-12T00:00:00Z' };
    let dwin, doc;

    async function open(record, { planExists }) {
        ({ window: dwin, document: doc } = await loadApp());
        dwin.apiFetch = p => {
            if (p === '/api/records/cupping/r1') return Promise.resolve(record);
            if (p.startsWith('/api/brew-plans/')) return Promise.resolve(planExists ? { id: 'p1', name: '日常 15 g', steps: [] } : null);
            if (p === '/api/shops') return Promise.resolve([]);
            return Promise.resolve(null);
        };
        dwin.setSessionUser({ id: 'u1' });
        dwin.location.hash = '#/cupping/r1';
        await settle();
        return doc.querySelector('.brew-plan-ref');
    }

    it('計劃還在：名稱連到計劃頁，參數是記錄上抄的值', async () => {
        const ref = await open({ ...REC, brew_plan_id: 'p1', brew_plan_name: '日常 15 g' }, { planExists: true });
        expect(ref.tagName).toBe('A');
        expect(ref.getAttribute('href')).toBe('#/plans/p1');
        expect(ref.textContent).toContain('日常 15 g');
        expect(doc.getElementById('app').textContent).toContain('93 °C');
    });

    it('內建手沖法不用問 API 也連得過去', async () => {
        const ref = await open({ ...REC, brew_plan_id: 'builtin-kasuya-4-6', brew_plan_name: '粕谷哲 4:6' }, { planExists: false });
        expect(ref.getAttribute('href')).toBe('#/plans/builtin-kasuya-4-6');
    });

    it('計劃已刪除：只顯示名稱與「計劃已刪除」，沒有連結', async () => {
        const ref = await open({ ...REC, brew_plan_id: 'gone', brew_plan_name: '冰手沖 Kalita' }, { planExists: false });
        expect(ref.tagName).not.toBe('A');
        expect(ref.textContent).toContain('冰手沖 Kalita（計劃已刪除）');
    });

    it('舊記錄沒有所依計劃：照原本的參數顯示', async () => {
        const ref = await open({ ...REC, grind: '中細' }, { planExists: false });
        expect(ref).toBeNull();
        expect(doc.getElementById('app').textContent).toContain('中細');
    });
});

describe('沖煮表單：沒有自己的計劃', () => {

    it('面板仍列出 4 個內建手沖法；選了沒填研磨度的計劃，摘要顯示「—」', async () => {
        const { window: w, document: doc } = await loadApp({ bodyHtml: `<main id="app"></main>${TEMPLATES}` });
        w.apiFetch = p => Promise.resolve(p === '/api/brew-plans' || p === '/api/shops' ? [] : null);
        w.setSessionUser({ id: 'u1' });
        w.location.hash = '#/new/cupping';
        await settle();
        doc.getElementById('f-brew-plan-open').click();
        await settle();
        const opts = [...doc.querySelectorAll('.brew-plan-option')];
        expect(opts.map(b => b.dataset.planId)).toEqual(['builtin-kasuya-4-6', 'builtin-hoffmann-ultimate-v60',
            'builtin-hoffmann-1-cup', 'builtin-scott-rao-v60']);
        // 內建都有研磨度，所以借一個沒研磨度的快照直接進摘要。
        w.setFormBrewPlan({ brew_plan_id: 'p1', brew_plan_name: '家裡的日常', method: '家裡的日常',
            grind: null, water_temp: null, ratio: '1:16.7', extraction_time: '165' });
        const rows = [...doc.querySelectorAll('#f-brew-plan-summary dd')].map(d => d.textContent);
        expect(rows).toEqual(['家裡的日常', '—', '—', '1:16.7', '165 秒']);
    });
});
