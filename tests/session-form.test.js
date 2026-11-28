import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// 杯測場次表單：① 設定 → ② 評分 → ③ 揭曉，同一組評分元件輪流裝不同的杯。這裡鎖住：
// - 各階段只顯示該階段要做的事；存檔把 stage 往前推一格
// - 杯數 / 編號格子（三位數自動跳格、隨機產生、依 id 移除）
// - 切換杯時每個元件都會重設（不會留著上一杯的值），切回來內容不變
// - ③ 的杯卡：依分數排名、點開才出現可編輯的元件、編輯中不重新排序
// - 未評分（coe_total null）的語意與「清除分數」
// - 非送出按鈕不會送出整場、編號欄 Enter 不送出
// - 每杯 key 集合一致（upsert 需要）
// - ② 切杯 / 切到背景時自動暫存（只在真的修改時才送），和完成評分、刪除排在同一條存檔鏈
// 表單本體直接取自 index.html 的 #tpl-session-form，避免測試複製一份走鐘的 markup。

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
const TEMPLATE = '<template id="tpl-session-form">'
    + INDEX.split('<template id="tpl-session-form">')[1].split('</template>')[0]
    + '</template>';
const FORM_MARKUP = INDEX.split('<template id="tpl-session-form">')[1].split('</template>')[0];

const FLAVOR_LEMON = [
    'flavor_flavorList__l1-fruit',
    'flavor_flavorList__l1-fruit__l2-citrus',
    'flavor_flavorList__l1-fruit__l2-citrus__l3-檸檬',
];

const cupA = {
    id: 'k1', code: 'A', position: 0, user_id: 'u1', session_id: 's1', created_at: '2026-09-01T00:00:00Z',
    shop_id: null, bean_name: '耶加', bean_type: 'single', origin: '衣索比亞', process: '日曬',
    blend_composition: null, roast: '淺焙', defects: '有點澀', defects_tags: ['澀感'], notes: '好喝',
    coe_total: 87, coe_tier_id: 'recommend', schema_version: 1,
    evaluations: {
        flavor: { score: 7, notes: '檸檬皮', intensity: '濃郁', flavors: FLAVOR_LEMON },
        acidity: { score: 6.5, textures: ['活潑', '多汁'] },
    },
    observation: { aroma: { dryAroma: '花香', wetAroma: '柑橘', notes: '' } },
};
const cupB = { id: 'k2', code: 'B', position: 1, coe_total: null, coe_tier_id: null, schema_version: 2, evaluations: {}, observation: {} };
// 以前的表單每次都存 8 項參考分，沒動就是預設 5；沒評分的舊杯長這樣（coe_total null）。
const DEFAULT_REFERENCE = Object.fromEntries(
    ['flavor', 'acidity', 'sweetness', 'mouthfeel', 'aftertaste', 'cleanness', 'balance', 'overall']
        .map(k => [k, { score: 5, notes: '' }]));
const cupOldUnscored = {
    id: 'k4', code: 'D', position: 3, coe_total: null, coe_tier_id: null, schema_version: 1,
    evaluations: DEFAULT_REFERENCE, observation: { aroma: { notes: '舊的香氣筆記' } },
};
const cupC = { id: 'k3', code: 'C', position: 2, coe_total: 84, coe_tier_id: 'like', schema_version: 1, evaluations: {}, observation: {} };

let win, doc;

async function mount(cups = [cupA, cupB], { recordId = null, stage = 'scoring', codeStyle = 'manual', date = '2026-09-20' } = {}) {
    ({ window: win, document: doc } = await loadApp({
        // 掛在 #app 外面：app.js 的首次 renderRoute 會清掉 #app 的內容。
        bodyHtml: `<main id="app"></main>${FORM_MARKUP}`,
    }));
    // ② 改了東西再切杯會自動暫存；沒 stub 的話會真的送出請求、跳錯誤 toast。
    win.apiFetch = () => Promise.resolve(null);
    win.eval(`state.currentForm = { mode: 'session', recordId: ${JSON.stringify(recordId)}, id: 's1',
        cups: [], activeIndex: 0, savedCupCount: ${cups.length}, stage: 'setup' };`);
    win.initSessionForm();
    win.applySessionToForm({ session_date: date, title: '日曬比較', code_style: codeStyle, stage, cups });
}

const form = () => win.eval('state.currentForm');
const $ = sel => doc.querySelector(sel);
const $$ = sel => [...doc.querySelectorAll(sel)];
const clickTab = i => $(`#cup-tabbar [data-cup-index="${i}"]`).click();
const pick = (sel, value) => {
    const el = $(sel);
    el.value = String(value);
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
};
const pickCount = n => pick('#f-cup-count', n);
const pickStyle = style => pick('#f-code-style', style);
const gridInputs = () => $$('#cup-grid .cup-grid-code');
const typeInto = (el, value) => {
    el.value = value;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
};
const cardCodes = () => $$('#reveal-cup-cards .reveal-cup-head .cup-code-badge').map(e => e.textContent);
const openCard = code => $$('#reveal-cup-cards .reveal-cup-head')
    .find(h => h.querySelector('.cup-code-badge').textContent === code).click();
// 可見 = 自己和祖先都沒有 hidden（jsdom 不算 CSS，[hidden] 就是這裡的「看不到」）
const visible = el => {
    for (let n = el; n; n = n.parentElement) if (n.hidden) return false;
    return true;
};

const row = key => $(`.adjust-item[data-adjust-key="${key}"]`);
const adjValue = key => row(key).querySelector('.adjust-value').textContent.trim();
const press = (key, action, times = 1) => {
    for (let i = 0; i < times; i++) row(key).querySelector(`[data-adjust="${action}"]`).click();
};
const KEYS = ['aroma', 'flavor', 'aftertaste', 'acidity', 'sweetness', 'mouthfeel', 'balance', 'cleanness'];
const judgeAll = () => KEYS.forEach(k => press(k, 'zero'));

describe('② 評分：切換杯', () => {
    beforeEach(() => mount());

    it('第 1 杯是舊杯：8 項照換算顯示、按鍵停用，分數列是當時的分數', () => {
        expect(adjValue('flavor')).toBe('2.0');   // 舊 7 → +2
        expect(adjValue('acidity')).toBe('1.5');  // 舊 6.5 → +1.5
        expect(adjValue('aftertaste')).toBe('0.0'); // 缺的當舊預設 5
        expect(adjValue('aroma')).toBe('0.0');
        expect(row('flavor').querySelector('[data-adjust="plus"]').disabled).toBe(true);
        expect($('#scoreBar').textContent).toContain('87.0');
        expect(visible($('#adjustLegacy'))).toBe(true);
        expect($('#adjustLegacy').textContent).toContain('87.0');
        expect($$('#flavor_flavorList .flavor-tag.selected').length).toBeGreaterThan(0);
    });

    it('切到空白的杯：每個元件都重設，切回來內容不變', () => {
        const before = JSON.stringify(win.readCupFromForm());
        clickTab(1);

        expect($('#f-cup-bean').value).toBe('');
        expect($('#f-origin').value).toBe('');
        expect($$('input[name="roast"]:checked')).toHaveLength(0);
        expect($$('.bean-type-chip-row .bean-type-chip.selected')).toHaveLength(0);
        expect(KEYS.map(adjValue)).toEqual(Array(8).fill('—'));
        expect(row('flavor').querySelector('[data-adjust="plus"]').disabled).toBe(false);
        expect($('#scoreBar').textContent).toContain('未評分 · 0/8');
        expect(visible($('#adjustLegacy'))).toBe(false);
        expect($$('#adjustList [aria-pressed="true"]')).toHaveLength(0);
        expect($$('.flavor-tag.selected')).toHaveLength(0);
        expect($('#f-notes').value).toBe('');
        expect($('#f-defects').value).toBe('');
        expect($$('#cupDefectsSection [aria-pressed="true"]')).toHaveLength(0);

        clickTab(0);
        expect(JSON.stringify(win.readCupFromForm())).toBe(before);
    });

    it('切到沒有筆記的杯：展開過的備註欄會收回去', async () => {
        await mount([
            { ...cupA, notes: '好喝', evaluations: { flavor: { score: 7, notes: '檸檬皮' } } },
            cupB,
        ]);
        const open = id => $(`[data-notes-slot="${id}"]`).classList.contains('is-open');
        expect(open('f-notes')).toBe(true);
        expect(open('flavor_notes')).toBe(true);

        clickTab(1);
        expect(open('f-notes')).toBe(false);
        expect(open('flavor_notes')).toBe(false);
        expect($('[data-notes-slot="f-notes"] .notes-toggle').getAttribute('aria-expanded')).toBe('false');
        expect($('#f-notes').value).toBe('');

        clickTab(0);
        expect(open('f-notes')).toBe(true);
        expect($('#flavor_notes').value).toBe('檸檬皮');
    });

    it('頂端分頁只有編號（沒有分數），評過分的杯另外標示', () => {
        expect($$('#cup-tabbar .cup-tab').map(t => t.textContent.trim())).toEqual(['A', 'B']);
        expect($$('#cup-tabbar .cup-tab').map(t => t.classList.contains('is-scored'))).toEqual([true, false]);
    });

    it('多次切換後 chip 點一次仍只切換一次（listener 沒有疊加）', () => {
        clickTab(1); clickTab(0); clickTab(1);
        const chip = $('.chip-group[data-chip-name="acidity_textures"] .chip[data-chip-value="活潑"]');
        chip.click();
        expect(chip.getAttribute('aria-pressed')).toBe('true');
        expect(form().cups[1].evaluations.acidity.textures).toEqual(['活潑']);
    });
});

describe('各階段只顯示該做的事', () => {
    it('① 設定：只有日期、編號方式、杯數與編號格子', async () => {
        await mount([], { stage: 'setup' });
        expect($('#session-stage-name').textContent).toBe('① 設定');
        expect($('#f-save-label').textContent).toContain('開始杯測');
        expect(visible($('#f-session-date'))).toBe(true);
        expect(visible($('#f-cup-count'))).toBe(true);
        expect(visible($('#f-session-title'))).toBe(false);
        expect(visible($('#f-session-notes'))).toBe(false);
        expect(visible($('#cup-tabbar'))).toBe(false);
        expect(visible($('#scoreBar'))).toBe(false);
        expect(visible($('#f-cup-bean'))).toBe(false);
        expect(visible($('#reveal-cup-cards'))).toBe(false);
        expect(visible($('#session-info-toggle'))).toBe(false);
    });

    it('② 評分：頂端杯號 + 評分卡，看不到場次資訊與豆子資訊', async () => {
        await mount();
        expect($('#session-stage-name').textContent).toBe('② 評分');
        expect(visible($('#cup-tabbar'))).toBe(true);
        expect(visible($('#scoreBar'))).toBe(true);
        expect(visible($('#adjustList'))).toBe(true);
        expect(visible($('#cup-score-toggle'))).toBe(false);
        expect(visible($('#f-session-date'))).toBe(false);
        expect(visible($('#f-cup-bean'))).toBe(false);
        expect(visible($('#reveal-cup-cards'))).toBe(false);
    });

    it('③ 揭曉：沒有頂端杯號，場次卡收合，下面是杯卡', async () => {
        await mount([cupA, cupB], { stage: 'reveal' });
        expect($('#session-stage-name').textContent).toBe('③ 揭曉');
        expect(visible($('#cup-tabbar'))).toBe(false);
        expect(visible($('#session-info-toggle'))).toBe(true);
        expect($('#session-info-summary').textContent).toBe('2026-09-20 · 2 杯');
        expect(visible($('#f-session-date'))).toBe(false);
        expect(visible($('#reveal-cup-cards'))).toBe(true);
        expect(visible($('#scoreBar'))).toBe(false);

        $('#session-info-toggle').click();
        expect(visible($('#f-session-date'))).toBe(true);
        expect(visible($('#f-session-title'))).toBe(true);
        expect(visible($('#cup-grid'))).toBe(true);
    });
});

describe('① 杯數與編號格子', () => {
    beforeEach(() => mount([], { stage: 'setup' }));

    it('新場次預設三位數；點杯數長出對應的格子，聚焦第一格', () => {
        expect($('#f-code-style').value).toBe('three');
        pickCount(6);
        expect(form().cups).toHaveLength(6);
        expect(gridInputs()).toHaveLength(6);
        expect(gridInputs()[0].getAttribute('inputmode')).toBe('numeric');
        expect(doc.activeElement).toBe(gridInputs()[0]);
        expect($('#f-cup-count').value).toBe('6');
        pickCount(form().cups.length + 1);
        expect(form().cups).toHaveLength(7);
    });

    it('杯數選單：還沒選時是提示項，選項 1–20 杯；載入更多杯時照樣列出', async () => {
        const opts = () => $$('#f-cup-count option');
        expect($('#f-cup-count').value).toBe('');
        expect(opts()[0].disabled).toBe(true);
        expect(opts().filter(o => !o.disabled).map(o => o.value)).toEqual(
            Array.from({ length: 20 }, (_, i) => String(i + 1)));
        pickCount(3);
        expect(opts().some(o => o.disabled)).toBe(false);

        await mount(Array.from({ length: 22 }, (_, i) => ({ id: `c${i}`, code: String(100 + i) })), { stage: 'setup' });
        expect($('#f-cup-count').value).toBe('22');
    });

    it('三位數：只收數字，打滿 3 碼自動跳下一格；空格按 Backspace 回上一格', () => {
        pickCount(4);
        typeInto(gridInputs()[0], '3a17');
        expect(gridInputs()[0].value).toBe('317');
        expect(form().cups[0].code).toBe('317');
        expect(doc.activeElement).toBe(gridInputs()[1]);

        const bs = new win.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
        gridInputs()[1].dispatchEvent(bs);
        expect(bs.defaultPrevented).toBe(true);
        expect(doc.activeElement).toBe(gridInputs()[0]);
    });

    it('隨機產生只填空白的格子，編號合格且不重複', () => {
        pickCount(6);
        typeInto(gridInputs()[0], '999');
        $('#cup-code-random').click();
        const codes = form().cups.map(c => c.code);
        expect(codes[0]).toBe('999');
        codes.slice(1).forEach(c => expect(win.isAcceptableRandomCode(c)).toBe(true));
        expect(new Set(codes).size).toBe(6);
        expect(gridInputs().map(i => i.value)).toEqual(codes);
    });

    it('確認框開著時換頁：回來後不去動新頁面（沒有杯數選單也不丟錯）', async () => {
        pickCount(6);
        typeInto(gridInputs()[5], '952');
        let answer;
        win.confirmDialog = () => new Promise(r => { answer = r; });
        pickCount(4);
        // 模擬換到沒有杯數選單的表單（例如 #/new/cupping）
        win.eval(`state.currentForm = { mode: 'cupping', cups: [] }`);
        $('.session-form').remove();
        answer(true);
        await new Promise(r => setTimeout(r, 0));
        expect(form().mode).toBe('cupping');
    });

    it('減少杯數從後面移除；有打過的編號先確認', async () => {
        pickCount(6);
        typeInto(gridInputs()[5], '952');
        let asked = 0;
        win.confirmDialog = () => { asked += 1; return Promise.resolve(false); };
        pickCount(4);
        await new Promise(r => setTimeout(r, 0));
        expect(asked).toBe(1);
        expect(form().cups).toHaveLength(6);
        expect($('#f-cup-count').value).toBe('6'); // 按了取消，選單回到實際杯數

        win.confirmDialog = () => Promise.resolve(true);
        pickCount(4);
        await new Promise(r => setTimeout(r, 0));
        expect(form().cups).toHaveLength(4);
        expect(gridInputs()).toHaveLength(4);
    });

    it('A、B、C：自動編號，加杯接著編，減杯不必確認', async () => {
        pickStyle('letter');
        pickCount(4);
        expect(form().cups.map(c => c.code)).toEqual(['A', 'B', 'C', 'D']);
        expect($('#cup-code-random').hidden).toBe(true);
        pickCount(form().cups.length + 1);
        expect(form().cups.at(-1).code).toBe('E');
        let asked = 0;
        win.confirmDialog = () => { asked += 1; return Promise.resolve(true); };
        pickCount(4);
        await new Promise(r => setTimeout(r, 0));
        expect(asked).toBe(0);
        expect(form().cups).toHaveLength(4);
    });

    it('格子裡的單品 / 配方是選填，再點一次取消；目前這杯的元件跟著變', () => {
        pickCount(4);
        const chip = (i, t) => $$('#cup-grid .cup-grid-cell')[i].querySelector(`[data-cup-bean="${t}"]`);
        chip(1, 'blend').click();
        expect(form().cups[1].bean_type).toBe('blend');
        chip(1, 'blend').click();
        expect(form().cups[1].bean_type).toBeNull();

        chip(0, 'single').click();
        expect(form().cups[0].bean_type).toBe('single');
        expect(win.getBeanType('session')).toBe('single');
    });

    it('× 依 id 移除（確認框開著時順序變了也不會移錯）；只剩一杯時不能移除', async () => {
        pickCount(4);
        typeInto(gridInputs()[1], '317');
        const target = form().cups[1].id;
        let answer;
        win.confirmDialog = () => new Promise(r => { answer = r; });
        $$('#cup-grid [data-cup-remove]')[1].click();
        win.eval('state.currentForm.cups.reverse()');
        answer(true);
        await new Promise(r => setTimeout(r, 0));
        expect(form().cups).toHaveLength(3);
        expect(form().cups.some(c => c.id === target)).toBe(false);

        const toasts = [];
        win.showToast = m => toasts.push(m);
        win.confirmDialog = () => Promise.resolve(true);
        for (let i = 0; i < 3; i++) {
            $$('#cup-grid [data-cup-remove]')[0].click();
            await new Promise(r => setTimeout(r, 0));
        }
        expect(form().cups).toHaveLength(1);
        expect(toasts).toContain('至少要有一杯');
    });
});

describe('8 項調整分（#183）', () => {
    beforeEach(() => mount());

    it('新杯：沒判斷完是未評分；8 項判斷完 → 80 + Σ，等級跟著分數', () => {
        clickTab(1);
        press('flavor', 'plus');
        expect(form().cups[1].coe_total).toBeNull();
        expect(form().cups[1].coe_tier_id).toBeNull();
        expect(form().cups[1].schema_version).toBe(2);
        expect($('#cup-tabbar .cup-tab.active').classList.contains('is-scored')).toBe(false);

        judgeAll();
        press('flavor', 'plus', 3);  // 1.5
        press('cleanness', 'minus'); // −1
        expect(form().cups[1].coe_total).toBe(80.5);
        expect(form().cups[1].coe_tier_id).toBe(win.tierFromScore(80.5).id);
        expect(form().cups[1].evaluations.flavor.score).toBe(1.5);
        expect($('#cup-tabbar .cup-tab.active').classList.contains('is-scored')).toBe(true);
        expect($('#scoreBar').textContent).toContain('80.5');
    });

    it('沒有徽章挑選器與預估總分', () => {
        expect($('#medalRow')).toBeNull();
        expect($('#scoreChipRow')).toBeNull();
        expect($('#evalEstimatedValue')).toBeNull();
        expect(doc.body.textContent).not.toContain('預估總分');
    });

    it('舊杯：只改豆名與備註，評分欄位原樣寫回', () => {
        typeInto($('#f-cup-bean'), '新的豆名');
        typeInto($('#f-notes'), '改了備註');
        const cup = form().cups[0];
        expect(cup.bean_name).toBe('新的豆名');
        expect(cup.notes).toBe('改了備註');
        expect(cup.coe_total).toBe(87);
        expect(cup.coe_tier_id).toBe(cupA.coe_tier_id);
        expect(cup.evaluations).toEqual(cupA.evaluations);
        expect(cup.observation).toEqual(cupA.observation);
        expect(cup.schema_version).toBe(1);
    });

    it('舊杯：按「重新評分」→ 8 項清成未判斷、改用新制', () => {
        $('#f-adjust-reset').click();
        expect(KEYS.map(adjValue)).toEqual(Array(8).fill('—'));
        expect(row('flavor').querySelector('[data-adjust="plus"]').disabled).toBe(false);
        expect(visible($('#adjustLegacy'))).toBe(false);
        expect($('#scoreBar').textContent).toContain('未評分 · 0/8');
        const cup = form().cups[0];
        expect(cup.coe_total).toBeNull();
        expect(cup.schema_version).toBe(2);
        expect(cup.bean_name).toBe('耶加');
    });

    // review #183：以前沒評分的舊杯存著 8 個預設 5，不能被換算成 8 個 0、變成 80 分進排名。
    it('沒評分的舊杯（參考分都是預設 5）：維持未評分、唯讀，存檔原樣寫回、不進排名', async () => {
        await mount([cupA, cupOldUnscored], { recordId: 's1' });
        clickTab(1);
        expect(KEYS.map(adjValue)).toEqual(Array(8).fill('—'));
        expect(row('flavor').querySelector('[data-adjust="zero"]').disabled).toBe(true);
        expect($('#scoreBar').textContent).toContain('未評分 · 0/8');
        expect($('#adjustLegacyText').textContent).toBe('舊制的杯，當時沒有評分');
        typeInto($('#f-notes'), '補個備註');
        const cup = form().cups[1];
        expect(cup.coe_total).toBeNull();
        expect(cup.coe_tier_id).toBeNull();
        expect(cup.schema_version).toBe(1);
        expect(cup.evaluations).toEqual(cupOldUnscored.evaluations);
        expect(cup.observation).toEqual(cupOldUnscored.observation);
        expect(win.rankCups(form().cups).map(r => r.rank)).toEqual([1, null]);
    });

    // review #183 round 2–3：沒有總分但動過參考分 → 照換算顯示、唯讀、仍未評分、不進排名；
    // 只動了「整體」（不在 8 項裡）→ 當作沒評過。
    it('沒有總分、但動過參考分的舊杯：照換算顯示，仍未評分、原樣寫回、不進排名', async () => {
        const touched = { ...cupOldUnscored, evaluations: { ...DEFAULT_REFERENCE, flavor: { score: 7, notes: '' } } };
        await mount([cupA, touched], { recordId: 's1' });
        clickTab(1);
        expect(adjValue('flavor')).toBe('2.0');
        expect(adjValue('acidity')).toBe('0.0');
        expect(row('flavor').querySelector('[data-adjust="zero"]').disabled).toBe(true);
        expect($('#scoreBar').textContent).toContain('未評分 · 8/8');
        typeInto($('#f-notes'), '補個備註');
        const cup = form().cups[1];
        expect(cup.coe_total).toBeNull();
        expect(cup.schema_version).toBe(1);
        expect(cup.evaluations).toEqual(touched.evaluations);
        expect(win.rankCups(form().cups).map(r => r.rank)).toEqual([1, null]);

        const onlyOverall = { ...cupOldUnscored, evaluations: { ...DEFAULT_REFERENCE, overall: { score: 7, notes: '' } } };
        await mount([cupA, onlyOverall], { recordId: 's1' });
        clickTab(1);
        expect(KEYS.map(adjValue)).toEqual(Array(8).fill('—'));
        expect($('#scoreBar').textContent).toContain('未評分 · 0/8');
    });

    // review #183：舊杯的唯讀狀態不能帶進下一個表單（例如接著去新增沖煮）。
    it('重新掛載評分元件 → 不再是舊杯、按鍵可以按', () => {
        expect(row('flavor').querySelector('[data-adjust="plus"]').disabled).toBe(true);
        win.initAdjustmentWidget(); // 下一個表單掛載時做的事（這裡不點按鍵，不在意 listener 疊加）
        expect(win.eval('adjustState.legacyCup')).toBeNull();
        expect(row('flavor').querySelector('[data-adjust="plus"]').disabled).toBe(false);
        expect($('#scoreBar').textContent).toContain('未評分 · 0/8');
    });

    it('舊杯沒有任何參考分：8 項是「—」但仍唯讀，分數列是當時的分數', async () => {
        await mount([cupC, cupB]);
        expect(KEYS.map(adjValue)).toEqual(Array(8).fill('—'));
        expect(row('flavor').querySelector('[data-adjust="zero"]').disabled).toBe(true);
        expect($('#scoreBar').textContent).toContain('84.0');
    });
});

describe('③ 揭曉：杯卡', () => {
    beforeEach(() => mount([cupA, cupB, cupC], { stage: 'reveal' }));

    it('依分數排名，卡片顯示名次、編號、分數徽章與豆名', () => {
        expect(cardCodes()).toEqual(['A', 'C', 'B']);
        const heads = $$('#reveal-cup-cards .reveal-cup-head');
        expect(heads.map(h => h.querySelector('.reveal-cup-rank').textContent)).toEqual(['1', '2', '—']);
        expect(heads[0].querySelector('.reveal-cup-medal').textContent).toBe('B 87.0'); // 87 = B 稀有
        expect(heads[0].querySelector('.reveal-cup-medal').classList.contains('t-b')).toBe(true);
        expect(heads[2].querySelector('.reveal-cup-medal').textContent).toBe('未評分');
        expect(heads[0].querySelector('.reveal-cup-bean').textContent).toBe('耶加');
        expect(heads[1].querySelector('.reveal-cup-bean').textContent).toBe('未填豆名');
    });

    it('點卡片：該杯的元件出現在卡片下面、評分先收合；再點一次收起', () => {
        openCard('C');
        const slot = $('#reveal-cup-cards .reveal-cup.is-open .reveal-cup-slot');
        expect(slot.contains($('#cup-editor'))).toBe(true);
        expect(form().cups[form().activeIndex].id).toBe('k3');
        expect(visible($('#f-cup-bean'))).toBe(true);
        expect(visible($('#cup-score-toggle'))).toBe(true);
        expect(visible($('#scoreBar'))).toBe(false);
        expect($('#cup-score-summary').textContent).toBe('評分 84.0 C');
        expect($('#cup-score-summary .tier-badge.t-c')).not.toBeNull();

        openCard('C');
        expect($$('#reveal-cup-cards .reveal-cup.is-open')).toHaveLength(0);
        expect(visible($('#f-cup-bean'))).toBe(false);
    });

    it('同時只展開一張', () => {
        openCard('A');
        openCard('B');
        expect($$('#reveal-cup-cards .reveal-cup.is-open')).toHaveLength(1);
        expect(form().cups[form().activeIndex].id).toBe('k2');
    });

    it('展開評分改分數：存進這杯、編輯中順序不跳，收起後才重新排序', () => {
        openCard('C');
        $('#cup-score-toggle').click();
        expect(visible($('#scoreBar'))).toBe(true);
        $('#f-adjust-reset').click();
        judgeAll();
        press('flavor', 'plus', 16); // +8 → 88
        expect(form().cups[2].coe_total).toBe(88);
        expect(cardCodes()).toEqual(['A', 'C', 'B']);
        expect($('#reveal-cup-cards .reveal-cup.is-open .reveal-cup-medal').textContent).toContain('88.0');

        openCard('C');
        expect(cardCodes()).toEqual(['C', 'A', 'B']);
    });

    it('豆名即時更新卡片', () => {
        openCard('B');
        typeInto($('#f-cup-bean'), '西達摩');
        expect(form().cups[1].bean_name).toBe('西達摩');
        expect($('#reveal-cup-cards .reveal-cup.is-open .reveal-cup-bean').textContent).toBe('西達摩');
    });

    it('格子改編號與咖啡資訊卡改豆子類型不會互相蓋掉，key 集合仍一致', () => {
        openCard('A');
        $('.bean-type-chip-row[data-bean-type-group="session"] [data-bean-type="blend"]').click();
        $('#session-info-toggle').click();
        typeInto(gridInputs()[0], 'Z');
        expect(form().cups[0].code).toBe('Z');
        expect(form().cups[0].bean_type).toBe('blend');
        expect($('#reveal-cup-cards .reveal-cup.is-open .cup-code-badge').textContent).toBe('Z');
        // ③ 的格子不再放豆子類型（由咖啡資訊卡負責）
        expect($$('#cup-grid [data-cup-bean]')).toHaveLength(0);
        const keySets = form().cups.map(c => Object.keys(c).sort().join(','));
        expect(new Set(keySets).size).toBe(1);
    });
});

describe('按鈕不會送出整場', () => {
    it('樣板裡除了 #f-save 以外的 button 都是 type="button"', async () => {
        await mount();
        const nonButton = $$('.session-form button')
            .filter(b => b.id !== 'f-save' && b.getAttribute('type') !== 'button')
            .map(b => b.outerHTML.slice(0, 80));
        expect(nonButton).toEqual([]);
    });

    it('杯數、格子、隨機、編號方式、分頁、杯卡、收合都不觸發 submit', async () => {
        await mount([], { stage: 'setup' });
        let submitted = 0;
        $('.session-form').addEventListener('submit', () => { submitted += 1; });
        win.confirmDialog = () => Promise.resolve(false);
        pickCount(4);
        $('#cup-code-random').click();
        $$('#cup-grid [data-cup-bean="single"]')[0].click();
        $$('#cup-grid [data-cup-remove]')[1].click();
        pickStyle('letter');
        win.setSessionStage('scoring');
        clickTab(1);
        press('flavor', 'plus');
        win.setSessionStage('reveal');
        $('#session-info-toggle').click();
        $$('#reveal-cup-cards .reveal-cup-head')[0].click();
        $('#cup-score-toggle').click();
        await new Promise(r => setTimeout(r, 0));
        expect(submitted).toBe(0);
    });

    it('在編號格子按 Enter 不送出', async () => {
        await mount([], { stage: 'setup' });
        pickCount(4);
        const ev = new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        gridInputs()[0].dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);
    });
});

describe('存檔：每次換階段都寫回伺服器', () => {
    let saved, navs, toasts;
    const stub = () => {
        saved = [];
        navs = [];
        toasts = [];
        win.eval('api').saveSession = (id, session, cups) => { saved.push({ id, session, cups }); return Promise.resolve(); };
        win.navigate = p => navs.push(p);
        win.showToast = m => toasts.push(m);
    };

    it('① 沒填日期、沒選杯數、編號空白都不存', async () => {
        await mount([], { stage: 'setup', date: '' });
        stub();
        await win.submitSessionForm();
        expect(toasts.at(-1)).toBe('請先填日期');
        expect(doc.activeElement).toBe($('#f-session-date'));

        $('#f-session-date').value = '2026-09-28';
        await win.submitSessionForm();
        expect(toasts.at(-1)).toBe('請先選擇杯數');

        pickCount(4);
        typeInto(gridInputs()[0], '317');
        await win.submitSessionForm();
        expect(toasts.at(-1)).toBe('第 2 杯還沒有編號');
        expect(doc.activeElement).toBe(gridInputs()[1]);
        expect(saved).toEqual([]);
    });

    it('① 開始杯測：存成 scoring，重新載入進 ②', async () => {
        await mount([], { stage: 'setup' });
        stub();
        pickCount(4);
        $('#cup-code-random').click();
        await win.submitSessionForm();
        expect(saved).toHaveLength(1);
        expect(saved[0].session.stage).toBe('scoring');
        expect(saved[0].session.code_style).toBe('manual'); // 三位數在 DB 裡是手動編號
        expect(saved[0].cups).toHaveLength(4);
        expect(new Set(saved[0].cups.map(c => Object.keys(c).sort().join(','))).size).toBe(1);
        expect(navs).toEqual(['/session/s1/edit']);
    });

    it('② 完成評分：存成 reveal，重新載入進 ③', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        stub();
        await win.submitSessionForm();
        expect(saved[0].session.stage).toBe('reveal');
        expect(navs).toEqual(['/session/s1/edit']);
    });

    it('③ 儲存：stage 維持 reveal，回到場次頁', async () => {
        await mount([cupA, cupB], { recordId: 's1', stage: 'reveal' });
        stub();
        await win.submitSessionForm();
        expect(saved[0].session.stage).toBe('reveal');
        expect(navs).toEqual(['/session/s1']);
    });

    it('③ 編號重複：展開場次卡並聚焦那一格', async () => {
        await mount([cupA, cupB], { recordId: 's1', stage: 'reveal' });
        stub();
        $('#session-info-toggle').click();
        typeInto(gridInputs()[0], 'b');
        $('#session-info-toggle').click(); // 收起來
        await win.submitSessionForm();
        expect(saved).toEqual([]);
        expect(toasts.at(-1)).toBe('編號「B」重複了');
        expect(visible($('#cup-grid'))).toBe(true);
        expect(doc.activeElement).toBe(gridInputs()[1]);
    });

    it('存檔期間離開頁面：不把人拉回場次頁', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        stub();
        let release;
        win.eval('api').saveSession = () => new Promise(r => { release = r; });
        const pending = win.submitSessionForm();
        win.eval('state.currentForm = null'); // 模擬 renderRoute 換頁
        await new Promise(r => setTimeout(r, 0)); // 排在存檔鏈上，下一輪才送出
        release();
        await pending;
        expect(navs).toEqual([]);
    });
});

describe('每杯 key 集合', () => {
    it('載入、加杯、切換後每杯 key 都一樣，且不帶 DB 欄位', async () => {
        await mount([cupA, cupB], { stage: 'setup' });
        pickCount(form().cups.length + 1);
        win.setSessionStage('scoring');
        clickTab(2);
        clickTab(0);
        const keySets = form().cups.map(c => Object.keys(c).sort().join(','));
        expect(new Set(keySets).size).toBe(1);
        for (const k of ['created_at', 'user_id', 'session_id', 'position']) {
            expect(form().cups[0]).not.toHaveProperty(k);
        }
        expect(form().cups[0].id).toBe('k1');
        expect(form().cups[2].id).toMatch(/^[0-9a-f-]{36}$/);
    });
});

describe('② 自動暫存', () => {
    let calls;
    // handler 決定每個請求怎麼回；calls 記下所有請求（含 keepalive）。
    const record = (handler = () => Promise.resolve(null)) => {
        calls = [];
        win.apiFetch = (p, init = {}) => {
            calls.push({ path: p, method: init.method || 'GET', body: init.body, keepalive: init.keepalive });
            return handler(p, init);
        };
    };
    const puts = () => calls.filter(c => c.method === 'PUT');
    const flush = () => new Promise(r => setTimeout(r, 0));
    const deferred = () => {
        let resolve;
        const promise = new Promise(r => { resolve = r; });
        return { promise, resolve };
    };
    const status = () => $('#session-autosave-status');
    const toast = () => doc.getElementById('toastMsg');
    // 在 B 杯（未評分）評成 82（8 項判斷完、風味 +2）：還沒切杯，所以還沒暫存。
    const scoreCupB = () => {
        clickTab(1);
        judgeAll();
        press('flavor', 'plus', 4);
    };
    const hide = () => {
        Object.defineProperty(doc, 'visibilityState', { value: 'hidden', configurable: true });
        doc.dispatchEvent(new win.Event('visibilitychange'));
    };
    const quietly = async fn => {
        const realError = win.console.error;
        win.console.error = () => {};
        try { await fn(); } finally { win.console.error = realError; }
    };

    // 作者 2026-11-28：不放「切到別杯時會自動暫存」的提示；暫存過才顯示時間。
    it('② 平常沒有提示文字；①、③ 不顯示', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        expect(status().textContent).toBe('');
        win.setSessionStage('reveal');
        expect(visible(status())).toBe(false);
        win.setSessionStage('setup');
        expect(visible(status())).toBe(false);
    });

    it('改了分數再切杯 → 送一次 PUT（stage 仍是 scoring），狀態文字換成暫存時間', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        record();
        scoreCupB();
        expect(puts()).toHaveLength(0);
        clickTab(0);
        await flush();
        expect(puts()).toHaveLength(1);
        expect(puts()[0].path).toBe('/api/sessions/s1');
        expect(puts()[0].body.session.stage).toBe('scoring');
        expect(puts()[0].body.cups[1].coe_total).toBe(82);
        expect(puts()[0].keepalive).toBe(false);
        expect(status().textContent).toMatch(/^已自動暫存 \d{2}:\d{2}$/);
    });

    it('只切杯沒改 → 不送請求、狀態文字不變；存過之後再來回切也不送', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        record();
        clickTab(1);
        clickTab(0);
        await flush();
        expect(calls).toHaveLength(0);
        expect(status().textContent).toBe('');

        scoreCupB();
        clickTab(0);
        await flush();
        clickTab(1);
        clickTab(0);
        await flush();
        expect(puts()).toHaveLength(1);
    });

    it('暫存失敗 → 杯照樣切換、跳「暫存失敗」（不帶內部訊息）；下次切杯再送', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        let offline = true;
        record((p, init) => (init.method === 'PUT' && offline
            ? Promise.reject(new Error('Failed to fetch'))
            : Promise.resolve(null)));
        await quietly(async () => {
            scoreCupB();
            clickTab(0);
            await flush();
        });
        expect(form().activeIndex).toBe(0);
        expect(toast().textContent).toBe('暫存失敗，請再試一次');
        expect(toast().classList.contains('error')).toBe(true);
        expect(status().textContent).toBe('');

        offline = false;
        clickTab(1);
        await flush();
        expect(puts()).toHaveLength(2);
        expect(puts()[1].body.cups[1].coe_total).toBe(82);
        expect(status().textContent).toMatch(/^已自動暫存 /);
    });

    it('② 切到背景 → 不必切杯就暫存，帶 keepalive', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        record();
        scoreCupB();
        hide();
        await flush();
        expect(puts()).toHaveLength(1);
        expect(puts()[0].keepalive).toBe(true);
        expect(puts()[0].body.cups[1].coe_total).toBe(82);
    });

    it('切到背景但內容超過 keepalive 上限 → 照樣送，不帶 keepalive', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        record();
        typeInto($('#f-notes'), '香'.repeat(25000)); // 75,000 bytes（中文一字 3 bytes）
        hide();
        await flush();
        expect(puts()).toHaveLength(1);
        expect(puts()[0].keepalive).toBe(false);
    });

    it('不在 ② 時切到背景 → 不暫存', async () => {
        await mount([cupA, cupB], { recordId: 's1', stage: 'reveal' });
        record();
        openCard('A');
        typeInto($('#f-cup-bean'), '改過');
        hide();
        await flush();
        expect(calls).toHaveLength(0);
    });

    it('暫存還沒回來就按「完成評分 ›」→ 等暫存回來才送，最後的 stage 是 reveal', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        const first = deferred();
        record((p, init) => (init.method === 'PUT' && puts().length === 1 ? first.promise : Promise.resolve(null)));
        win.navigate = () => {};
        scoreCupB();
        clickTab(0);
        const pending = win.submitSessionForm();
        await flush();
        expect(puts()).toHaveLength(1);
        first.resolve(null);
        await pending;
        expect(puts()).toHaveLength(2);
        expect(puts()[1].body.session.stage).toBe('reveal');
    });

    it('暫存還沒回來就刪除 → 等暫存回來才送 DELETE', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        const first = deferred();
        record((p, init) => (init.method === 'PUT' ? first.promise : Promise.resolve(null)));
        win.confirmDialog = () => Promise.resolve(true);
        win.navigate = () => {};
        scoreCupB();
        clickTab(0);
        const pending = win.deleteCurrentSession();
        await flush();
        expect(calls.map(c => c.method)).toEqual(['PUT']);
        first.resolve(null);
        await pending;
        expect(calls.map(c => c.method)).toEqual(['PUT', 'DELETE']);
    });

    it('「完成評分 ›」還沒回來時切杯或切到背景 → 不再送 stage: scoring 的暫存', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        const done = deferred();
        record((p, init) => (init.method === 'PUT' ? done.promise : Promise.resolve(null)));
        win.navigate = () => {};
        scoreCupB();
        const pending = win.submitSessionForm();
        await flush();
        typeInto($('#f-notes'), '送出後才改');
        clickTab(0);
        hide();
        await flush();
        done.resolve(null);
        await pending;
        await flush();
        expect(puts()).toHaveLength(1);
        expect(puts()[0].body.session.stage).toBe('reveal');
    });

    it('完成評分被伺服器拒絕 → 留在 ②，之後切杯照樣暫存', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        let failSubmit = true;
        record((p, init) => (init.method === 'PUT' && init.body.session.stage === 'reveal' && failSubmit
            ? Promise.reject(Object.assign(new Error('boom'), { status: 500 }))
            : Promise.resolve(null)));
        await quietly(() => win.submitSessionForm());
        failSubmit = false;
        scoreCupB();
        clickTab(0);
        await flush();
        expect(puts().map(c => c.body.session.stage)).toEqual(['reveal', 'scoring']);
    });

    it.each([
        ['完成評分', () => win.submitSessionForm(), 'PUT', { stage: 'reveal' }],
        ['刪除', () => win.deleteCurrentSession(), 'DELETE', null],
    ])('%s連線中斷、其實已寫進去 → 下次切杯先問伺服器，不再暫存', async (_, act, method, server) => {
        await mount([cupA, cupB], { recordId: 's1' });
        let first = true;
        record((p, init) => {
            if (init.method === method && first) {
                first = false;
                return Promise.reject(new TypeError('Failed to fetch'));
            }
            return Promise.resolve(init.method ? null : server);
        });
        win.confirmDialog = () => Promise.resolve(true);
        await quietly(act);
        scoreCupB();
        clickTab(0);
        hide();
        await flush();
        expect(calls.map(c => c.method)).toEqual([method, 'GET']);
    });

    it('完成評分連線中斷、其實沒寫進去 → 問過伺服器（仍在 ②）就照樣暫存', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        record((p, init) => (init.method === 'PUT' && init.body.session.stage === 'reveal'
            ? Promise.reject(new TypeError('Failed to fetch'))
            : Promise.resolve(init.method ? null : { stage: 'scoring' })));
        await quietly(() => win.submitSessionForm());
        scoreCupB();
        clickTab(0);
        await flush();
        expect(calls.map(c => c.method)).toEqual(['PUT', 'GET', 'PUT']);
        expect(puts()[1].body.session.stage).toBe('scoring');
        clickTab(1);
        typeInto($('#f-notes'), '再改');
        clickTab(0);
        await flush();
        expect(calls.map(c => c.method)).toEqual(['PUT', 'GET', 'PUT', 'PUT']); // 確認過一次就不再問
    });

    it('結果不明、等 GET 時又切杯 → 只送最新的那一份暫存', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        const check = deferred();
        record((p, init) => {
            if (init.method === 'PUT' && init.body.session.stage === 'reveal') return Promise.reject(new TypeError('Failed to fetch'));
            if (!init.method) return check.promise;
            return Promise.resolve(null);
        });
        await quietly(() => win.submitSessionForm());
        scoreCupB();
        clickTab(0); // A：先等 GET
        await flush();
        typeInto($('#f-notes'), '等 GET 時改的');
        clickTab(1); // B：排在 A 後面
        check.resolve({ stage: 'scoring' });
        await flush();
        await flush();
        const scoring = puts().filter(c => c.body.session.stage === 'scoring');
        expect(scoring).toHaveLength(1);
        expect(scoring[0].body.cups[0].notes).toBe('等 GET 時改的');
    });

    it('結果不明時切到背景 → 不暫存（留給下次切杯先問伺服器）', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        record((p, init) => (init.method === 'PUT' && init.body.session.stage === 'reveal'
            ? Promise.reject(new TypeError('Failed to fetch'))
            : Promise.resolve(init.method ? null : { stage: 'scoring' })));
        await quietly(() => win.submitSessionForm());
        scoreCupB();
        hide();
        await flush();
        expect(calls.map(c => c.method)).toEqual(['PUT']);
        clickTab(0);
        await flush();
        expect(calls.map(c => c.method)).toEqual(['PUT', 'GET', 'PUT']);
    });

    it('完成評分遇到 session_expired（確定沒寫）→ 不必問伺服器，照樣暫存', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        record((p, init) => (init.method === 'PUT' && init.body.session.stage === 'reveal'
            ? Promise.reject(new Error('session_expired'))
            : Promise.resolve(null)));
        await quietly(() => win.submitSessionForm());
        scoreCupB();
        clickTab(0);
        await flush();
        expect(calls.map(c => c.method)).toEqual(['PUT', 'PUT']);
    });

    it('切到背景的暫存先送出後，排隊中較舊的暫存不再送（不會蓋掉較新的內容）', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        const first = deferred();
        record((p, init) => (init.method === 'PUT' && puts().length === 1 ? first.promise : Promise.resolve(null)));
        scoreCupB();
        clickTab(0);
        await flush(); // X 已送出、還沒回來
        typeInto($('#f-notes'), '排隊中');
        clickTab(1); // A 排在 X 後面
        typeInto($('#f-notes'), '最新');
        hide(); // B 立刻送出
        await flush();
        first.resolve(null);
        await flush();
        await flush();
        expect(puts().map(c => c.keepalive)).toEqual([false, true]);
        expect(puts()[1].body.cups[1].notes).toBe('最新');
    });

    it('暫存還在路上時切到背景 → 不等前一個回來，立刻送出帶 keepalive 的暫存', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        const first = deferred();
        record((p, init) => (init.method === 'PUT' && puts().length === 1 ? first.promise : Promise.resolve(null)));
        scoreCupB();
        clickTab(0);
        await flush(); // 第一個 PUT 已送出、還沒回來
        typeInto($('#f-notes'), '鎖螢幕前');
        hide();
        await flush();
        expect(puts().map(c => c.keepalive)).toEqual([false, true]);
        expect(puts()[1].body.cups[0].notes).toBe('鎖螢幕前');
        first.resolve(null);
        await flush();
    });

    it('暫存還在路上時再切杯（沒改）→ 不重送同一份', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        const first = deferred();
        record((p, init) => (init.method === 'PUT' ? first.promise : Promise.resolve(null)));
        scoreCupB();
        clickTab(0);
        clickTab(1);
        clickTab(0);
        await flush();
        expect(puts()).toHaveLength(1);
        first.resolve(null);
        await flush();
        expect(puts()).toHaveLength(1);
    });

    it('刪除還沒回來時切杯或切到背景 → 不送任何 PUT', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        const done = deferred();
        record((p, init) => (init.method === 'DELETE' ? done.promise : Promise.resolve(null)));
        win.confirmDialog = () => Promise.resolve(true);
        win.navigate = () => {};
        scoreCupB();
        const pending = win.deleteCurrentSession();
        await flush();
        clickTab(0);
        hide();
        await flush();
        done.resolve(null);
        await pending;
        await flush();
        expect(calls.map(c => c.method)).toEqual(['DELETE']);
    });
});

describe('viewSessionForm', () => {
    const boot = async () => {
        ({ window: win, document: doc } = await loadApp({
            bodyHtml: `<main id="app"></main>${TEMPLATE}`,
        }));
        win.setSessionUser({ id: 'u1' });
    };

    it('讀取中不掛表單（按不到儲存），離開頁面也不丟錯', async () => {
        await boot();
        let release;
        win.apiFetch = () => new Promise(r => { release = r; });
        const root = doc.getElementById('app');
        const pending = win.viewSessionForm(root, { sessionId: 's1' });
        expect(doc.getElementById('f-save')).toBeNull();
        expect(root.textContent).toContain('讀取中');
        win.eval('state.currentForm = null'); // 模擬 renderRoute 換頁
        release(null);
        await expect(pending).resolves.toBeUndefined();
        expect(doc.getElementById('f-save')).toBeNull();
    });

    it('新場次：① 設定、日期預設今天、還沒有杯、三位數編號', async () => {
        await boot();
        win.apiFetch = () => Promise.resolve(null);
        const root = doc.getElementById('app');
        await win.viewSessionForm(root, {});
        expect(win.eval('state.currentForm').stage).toBe('setup');
        expect(doc.getElementById('f-session-date').value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(win.eval('state.currentForm').cups).toHaveLength(0);
        expect(visible(doc.getElementById('f-delete'))).toBe(false);
        expect(doc.getElementById('f-code-style').value).toBe('three');
        expect(doc.getElementById('f-delete').hidden).toBe(true);
    });

    it('編輯時打開在存下來的階段；舊場次（三位數編號）還原成三位數', async () => {
        await boot();
        const session = { id: 's1', session_date: '2026-09-28', code_style: 'manual', stage: 'scoring',
            cups: [{ ...cupB, code: '317' }, { ...cupC, code: '952' }] };
        win.apiFetch = p => Promise.resolve(p.startsWith('/api/sessions') ? session : []);
        const root = doc.getElementById('app');
        await win.viewSessionForm(root, { sessionId: 's1' });
        expect(win.eval('state.currentForm').stage).toBe('scoring');
        expect(doc.getElementById('session-stage-name').textContent).toBe('② 評分');
        expect(doc.getElementById('f-code-style').value).toBe('three');
        // 評分到一半放棄的場次也刪得掉，不必先按完成評分
        expect(visible(doc.getElementById('f-delete'))).toBe(true);
    });

    it('編輯時讀不到場次：顯示找不到，不留空白表單', async () => {
        await boot();
        // 所有查詢都回空結果（店家清單、國家清單、場次）
        win.apiFetch = p => Promise.resolve(p.startsWith('/api/shops') ? [] : null);
        const root = doc.getElementById('app');
        await win.viewSessionForm(root, { sessionId: 'missing' });
        expect(root.textContent).toContain('找不到記錄');
        expect(doc.getElementById('f-save')).toBeNull();
    });
});
