import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// 沖煮 / 品鑑的評分（#169）：8 項調整分，分數 = 80 + Σ，8 項都判斷完才算得出來。
// 舊紀錄保留當時輸入的 coe_total，8 項參考分（4–8）在顯示時換算成調整分。

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
const TEMPLATES = INDEX.match(/<template id="[^"]+">[\s\S]*?<\/template>/g).join('');
const TABBAR = INDEX.match(/<nav class="tabbar"[\s\S]*?<\/nav>/)[0];

const SHOP = { id: 'shop1', name: '測試咖啡', location: '台北', lat: 0, lng: 0, google_place_id: 'p1' };
const KEYS = ['aroma', 'flavor', 'aftertaste', 'acidity', 'sweetness', 'mouthfeel', 'balance', 'cleanness'];

let win, doc;
beforeAll(async () => {
    ({ window: win, document: doc } = await loadApp());
});

describe('stepAdjustment', () => {
    const step = (v, a) => win.stepAdjustment(v, a);

    it('未判斷：＋ → 0.5、− → −1、點數值 → 0', () => {
        expect(step(null, 'plus')).toBe(0.5);
        expect(step(null, 'minus')).toBe(-1);
        expect(step(null, 'zero')).toBe(0);
    });

    it('＋ 每次加 0.5，−1 按 ＋ 直接到 0（沒有 −0.5）', () => {
        expect(step(-1, 'plus')).toBe(0);
        expect(step(0, 'plus')).toBe(0.5);
        expect(step(1.5, 'plus')).toBe(2);
    });

    it('2 以上可以一直加，沒有上限', () => {
        let v = 2;
        for (let i = 0; i < 10; i++) v = step(v, 'plus');
        expect(v).toBe(7);
    });

    it('− 每次減 0.5，0 按 − 直接到 −1，−1 再按不動', () => {
        expect(step(2.5, 'minus')).toBe(2);
        expect(step(0.5, 'minus')).toBe(0);
        expect(step(0, 'minus')).toBe(-1);
        expect(step(-1, 'minus')).toBe(-1);
    });

    it('已判斷時點數值 → 回到 0', () => {
        expect(step(2, 'zero')).toBe(0);
        expect(step(-1, 'zero')).toBe(0);
    });

    it('從任何地方開始按，都不會出現 −0.5', () => {
        const seen = new Set();
        let frontier = [null];
        for (let depth = 0; depth < 8; depth++) {
            frontier = [...new Set(frontier.flatMap(v => ['plus', 'minus', 'zero'].map(a => step(v, a))))];
            frontier.forEach(v => seen.add(v));
        }
        expect(seen.has(-0.5)).toBe(false);
        expect([...seen].every(v => v === -1 || (v >= 0 && Number.isInteger(v * 2)))).toBe(true);
    });
});

describe('formatAdjustment', () => {
    it('一位小數、不加 ＋ 號，負數用 −', () => {
        expect(win.formatAdjustment(1)).toBe('1.0');
        expect(win.formatAdjustment(0)).toBe('0.0');
        expect(win.formatAdjustment(-1)).toBe('−1.0');
        expect(win.formatAdjustment(2.5)).toBe('2.5');
    });

    it('未判斷顯示「—」', () => {
        expect(win.formatAdjustment(null)).toBe('—');
        expect(win.formatAdjustment(undefined)).toBe('—');
    });
});

describe('adjustmentLevel（5 階顏色）', () => {
    it.each([
        [null, 'none'], [-1, 'neg'], [0, 'zero'], [0.5, 'low'], [1, 'low'],
        [1.5, 'high'], [2, 'high'], [2.5, 'top'], [6, 'top'],
    ])('%s → %s', (v, level) => {
        expect(win.adjustmentLevel(v)).toBe(level);
    });
});

describe('scoreFromAdjustments', () => {
    const all = v => Object.fromEntries(KEYS.map(k => [k, v]));

    it('8 項都是 0 → 80', () => {
        expect(win.scoreFromAdjustments(all(0))).toBe(80);
    });

    it('分數 = 80 + Σ 調整分', () => {
        const v = { ...all(0), aroma: 1, flavor: 2.5, acidity: -1, balance: 0.5 };
        expect(win.scoreFromAdjustments(v)).toBe(83);
    });

    it('8 項都是 −1 → 72', () => {
        expect(win.scoreFromAdjustments(all(-1))).toBe(72);
    });

    it('還有任何一項未判斷 → null', () => {
        expect(win.scoreFromAdjustments({ ...all(1), cleanness: null })).toBeNull();
        expect(win.scoreFromAdjustments({})).toBeNull();
    });
});

describe('legacyAdjustment（舊參考分 → 調整分）', () => {
    it.each([[5, 0], [6.5, 1.5], [8, 3], [4.5, -1], [4, -1]])('%s → %s', (old, adj) => {
        expect(win.legacyAdjustment(old)).toBe(adj);
    });

    it('沒有數字 → null', () => {
        expect(win.legacyAdjustment(undefined)).toBeNull();
    });
});

describe('recordAdjustments', () => {
    it('新制紀錄直接讀 evaluations[key].score', () => {
        const evaluations = Object.fromEntries(KEYS.map((k, i) => [k, { score: i * 0.5 }]));
        const adj = win.recordAdjustments('cupping', { schema_version: 4, evaluations });
        expect(adj.aroma).toBe(0);
        expect(adj.cleanness).toBe(3.5);
    });

    it('舊紀錄換算：舊分 − 5，4.5 歸到 −1，香氣記為 0，沒有「整體」', () => {
        const r = {
            schema_version: 5,
            evaluations: {
                flavor: { score: 7 }, acidity: { score: 4.5 }, sweetness: { score: 5 },
                mouthfeel: { score: 6 }, aftertaste: { score: 5.5 }, cleanness: { score: 8 },
                balance: { score: 4 }, overall: { score: 8 },
            },
        };
        const adj = win.recordAdjustments('tasting', r);
        expect({ ...adj }).toEqual({
            aroma: 0, flavor: 2, aftertaste: 0.5, acidity: -1, sweetness: 0,
            mouthfeel: 1, balance: -1, cleanness: 3,
        });
    });

    it('舊紀錄缺某一項 → 當成舊預設 5，換算成 0', () => {
        const adj = win.recordAdjustments('cupping', { schema_version: 3, evaluations: { flavor: { score: 6 } } });
        expect(adj.flavor).toBe(1);
        expect(adj.acidity).toBe(0);
        expect(adj.cleanness).toBe(0);
    });

    it('新舊分界依類型：沖煮 4、品鑑 6', () => {
        expect(win.isAdjustmentRecord('cupping', { schema_version: 3 })).toBe(false);
        expect(win.isAdjustmentRecord('cupping', { schema_version: 4 })).toBe(true);
        expect(win.isAdjustmentRecord('tasting', { schema_version: 5 })).toBe(false);
        expect(win.isAdjustmentRecord('tasting', { schema_version: 6 })).toBe(true);
    });
});

describe('renderRecordDetail', () => {
    const legacy = {
        id: 'r1', schema_version: 3, coe_total: 84.5, coe_tier_id: 'like', bean_name: '耶加',
        evaluations: {
            flavor: { score: 7 }, acidity: { score: 4.5 }, sweetness: { score: 5 },
            mouthfeel: { score: 5 }, aftertaste: { score: 5 }, cleanness: { score: 5 },
            balance: { score: 5 }, overall: { score: 8, notes: '整體很好' },
        },
        observation: { aroma: { dryAroma: '堅果' } },
        defects: '有點澀', defects_tags: ['澀感'],
    };

    function mount(html) {
        const el = doc.createElement('div');
        el.innerHTML = html;
        return el;
    }

    it('舊紀錄：顯示原本的 coe_total，8 項換算後顯示', () => {
        const el = mount(win.renderRecordDetail('cupping', legacy));
        expect(el.querySelector('.detail-score-value').textContent).toBe('84.5');
        const rows = [...el.querySelectorAll('.detail-adjust-row')];
        expect(rows).toHaveLength(8);
        const valueOf = label => rows.find(r => r.querySelector('.detail-adjust-label').textContent === label)
            .querySelector('.detail-adjust-value').textContent;
        expect(valueOf('酸 / 鹹')).toBe('−1.0');
        expect(valueOf('風味')).toBe('2.0');
        expect(valueOf('香氣')).toBe('0.0');
        expect(el.textContent).not.toContain('整體');
        expect(el.textContent).toContain('堅果');
    });

    it('沒有 CoE、預估總分、瑕疵字樣；負面風味照樣顯示', () => {
        const text = mount(win.renderRecordDetail('tasting', { ...legacy, schema_version: 5 })).textContent;
        expect(text).not.toContain('CoE');
        expect(text).not.toContain('預估總分');
        expect(text).not.toContain('瑕疵');
        expect(text).toContain('負面風味');
        expect(text).toContain('有點澀');
    });

    it('新制紀錄：顯示存下來的調整分', () => {
        const evaluations = Object.fromEntries(KEYS.map(k => [k, { score: 0 }]));
        evaluations.flavor = { score: 2.5, notes: '很甜' };
        const el = mount(win.renderRecordDetail('cupping', {
            id: 'r2', schema_version: 4, coe_total: 82.5, coe_tier_id: 'common', evaluations, observation: {},
        }));
        const flavorRow = [...el.querySelectorAll('.detail-adjust-row')]
            .find(r => r.querySelector('.detail-adjust-label').textContent === '風味');
        expect(flavorRow.querySelector('.detail-adjust-value').textContent).toBe('2.5');
        expect(el.textContent).toContain('很甜');
    });
});

// ─── 表單（走真的 router，只 stub apiFetch） ────────────────────────────────
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
async function settle(n = 5) {
    for (let i = 0; i < n; i++) await tick();
}

describe.each(['cupping', 'tasting'])('%s 表單', mode => {
    let calls, fwin, fdoc;
    const $ = sel => fdoc.querySelector(sel);
    const $$ = sel => [...fdoc.querySelectorAll(sel)];
    const row = key => $(`.adjust-item[data-adjust-key="${key}"]`);
    const valueOf = key => row(key).querySelector('.adjust-value').textContent.trim();
    const press = (key, action) => row(key).querySelector(`[data-adjust="${action}"]`).click();

    async function boot() {
        ({ window: fwin, document: fdoc } = await loadApp({
            bodyHtml: `<main id="app"></main>${TABBAR}${TEMPLATES}`,
        }));
        calls = [];
        fwin.apiFetch = (p, init = {}) => {
            calls.push({ method: init.method || 'GET', path: p, body: init.body });
            if (init.method === 'POST') return Promise.resolve({ id: 'r1' });
            if (init.method) return Promise.resolve(null);
            if (p === '/api/shops') return Promise.resolve([SHOP]);
            if (p.startsWith('/api/records?') || p.endsWith('/beans')) return Promise.resolve([]);
            return Promise.resolve(null);
        };
        fwin.setSessionUser({ id: 'u1' });
        fwin.location.hash = '#/records';
        await settle();
        fwin.location.hash = mode === 'tasting' ? '#/new/tasting?shop=shop1' : '#/new/cupping';
        await settle();
    }

    function fillRequired() {
        $(`.bean-type-chip-row[data-bean-type-group="${mode}"] .bean-type-chip`).click();
        const input = $(mode === 'cupping' ? '#f-cupping-bean' : '#f-item_ordered');
        input.value = '耶加';
        input.dispatchEvent(new fwin.Event('input', { bubbles: true }));
    }

    it('一開始 8 項都是「—」，分數列「未評分 · 0/8」，沒有 CoE 字樣', async () => {
        await boot();
        expect($$('.adjust-item .adjust-value').map(b => b.textContent.trim())).toEqual(Array(8).fill('—'));
        expect($('#scoreBar').textContent).toContain('未評分 · 0/8');
        const text = $('#app').textContent;
        expect(text).not.toContain('CoE');
        expect(text).not.toContain('預估總分');
        expect(text).not.toContain('瑕疵');
        expect(text).toContain('負面風味');
        expect(text).toContain('CFGC:2026.01');
    });

    it('沒判斷完按儲存 → 「尚未填完」，不送出請求', async () => {
        await boot();
        fillRequired();
        press('flavor', 'plus');
        $('#f-save').click();
        await settle();
        expect(fdoc.getElementById('toastMsg').textContent).toContain('尚未填完');
        expect(calls.some(c => c.method === 'POST')).toBe(false);
    });

    it('按鍵：＋ → 0.5、− 停在 −1 並停用、點數值 → 0', async () => {
        await boot();
        press('flavor', 'plus');
        expect(valueOf('flavor')).toBe('0.5');
        press('acidity', 'minus');
        expect(valueOf('acidity')).toBe('−1.0');
        expect(row('acidity').querySelector('[data-adjust="minus"]').disabled).toBe(true);
        press('acidity', 'plus');
        expect(valueOf('acidity')).toBe('0.0');
        expect(row('acidity').querySelector('[data-adjust="minus"]').disabled).toBe(false);
        press('balance', 'zero');
        expect(valueOf('balance')).toBe('0.0');
        expect($('#scoreBar').textContent).toContain('未評分 · 3/8');
    });

    it('8 項判斷完 → 分數 = 80 + Σ，存進 coe_total，coe_tier_id 與 tierFromScore 一致', async () => {
        await boot();
        fillRequired();
        KEYS.forEach(k => press(k, 'zero'));
        press('flavor', 'plus'); press('flavor', 'plus'); press('flavor', 'plus'); // 1.5
        press('aroma', 'plus'); press('aroma', 'plus');                            // 1.0
        press('cleanness', 'minus');                                               // −1
        expect($('#scoreBar').textContent).toContain('81.5');

        $('#f-save').click();
        await settle();
        const post = calls.find(c => c.method === 'POST');
        expect(post).toBeTruthy();
        const body = post.body;
        expect(body.coe_total).toBe(81.5);
        expect(body.coe_tier_id).toBe(fwin.tierFromScore(81.5).id);
        expect(body.schema_version).toBe(mode === 'cupping' ? 4 : 6);
        expect(Object.keys(body.evaluations).sort()).toEqual([...KEYS].sort());
        expect(body.evaluations.flavor.score).toBe(1.5);
        expect(body.evaluations.cleanness.score).toBe(-1);
        expect(body.observation).toEqual({});
    });

    it('有輸入時換頁會跳確認；取消留在表單，確認才離開', async () => {
        await boot();
        press('flavor', 'plus');
        fwin.location.hash = '#/shops';
        await settle();
        const dialog = fdoc.querySelector('.confirm-dialog');
        expect(dialog?.textContent).toContain('尚未儲存，確定離開？');
        dialog.querySelector('[data-confirm="cancel"]').click();
        await settle();
        expect(fwin.location.hash).toContain('#/new/');
        expect(valueOf('flavor')).toBe('0.5');

        fwin.location.hash = '#/shops';
        await settle();
        fdoc.querySelector('.confirm-dialog [data-confirm="ok"]').click();
        await settle();
        expect(fwin.location.hash).toBe('#/shops');
        expect($('.adjust-list')).toBeNull();
    });

    it('存檔中所有儲存鈕都停用（電腦版面板的儲存鈕也是），連按不會送出兩次', async () => {
        await boot();
        let release;
        const api = fwin.apiFetch;
        fwin.apiFetch = (p, init = {}) => {
            if (init.method !== 'POST') return api(p, init);
            calls.push({ method: 'POST', path: p, body: init.body });
            return new Promise(r => { release = r; });
        };
        fillRequired();
        KEYS.forEach(k => press(k, 'zero'));
        $('.score-panel-save').click();
        await tick();
        expect($$('button[type="submit"]').every(b => b.disabled)).toBe(true);
        $('.score-panel-save').click();
        $('#f-save').click();
        await tick();
        expect(calls.filter(c => c.method === 'POST')).toHaveLength(1);
        release({ id: 'r1' });
        await settle();
    });

    it('點 tabbar 離開、按取消：留在表單，瀏覽紀錄不多也不少', async () => {
        await boot();
        press('flavor', 'plus');
        const before = fwin.history.length;
        $('.tabbar-btn[data-route="/shops"] i').click();
        await settle();
        fdoc.querySelector('.confirm-dialog [data-confirm="cancel"]').click();
        await settle();
        expect(fwin.location.hash).toContain('#/new/');
        expect(fwin.history.length).toBe(before);
        expect(valueOf('flavor')).toBe('0.5');
    });

    it('沒有輸入時換頁不跳確認', async () => {
        await boot();
        fwin.location.hash = '#/shops';
        await settle();
        expect(fdoc.querySelector('.confirm-dialog')).toBeNull();
        expect(fwin.location.hash).toBe('#/shops');
    });
});
