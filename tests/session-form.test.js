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
// - 每杯 key 集合一致（upsert 需要）、草稿只在真的修改時才寫
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
    coe_total: 87, coe_tier_id: 'recommend',
    evaluations: {
        flavor: { score: 7, notes: '檸檬皮', intensity: '濃郁', flavors: FLAVOR_LEMON },
        acidity: { score: 6.5, textures: ['活潑', '多汁'] },
    },
    observation: { aroma: { dryAroma: '花香', wetAroma: '柑橘', notes: '' } },
};
const cupB = { id: 'k2', code: 'B', position: 1, coe_total: null, coe_tier_id: null, evaluations: {}, observation: {} };
const cupC = { id: 'k3', code: 'C', position: 2, coe_total: 84, coe_tier_id: 'like', evaluations: {}, observation: {} };

let win, doc;

async function mount(cups = [cupA, cupB], { recordId = null, stage = 'scoring', codeStyle = 'manual', date = '2026-09-20' } = {}) {
    ({ window: win, document: doc } = await loadApp({
        // 掛在 #app 外面：app.js 的首次 renderRoute 會清掉 #app 的內容。
        bodyHtml: `<main id="app"></main>${FORM_MARKUP}`,
    }));
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

describe('② 評分：切換杯', () => {
    beforeEach(() => mount());

    it('第 1 杯載入後各元件都帶到值', () => {
        expect($('#coeTotalDisplay').textContent).toBe('87.0');
        expect($('#flavor_score').value).toBe('7');
        expect($$('#flavor_flavorList .flavor-tag.selected').length).toBeGreaterThan(0);
        expect($('#aroma_dryAroma').value).toBe('花香');
    });

    it('切到空白的杯：每個元件都重設，切回來內容不變', () => {
        const before = JSON.stringify(win.readCupFromForm());
        clickTab(1);

        expect($('#f-cup-bean').value).toBe('');
        expect($('#f-origin').value).toBe('');
        expect($$('input[name="roast"]:checked')).toHaveLength(0);
        expect($$('.bean-type-chip-row .bean-type-chip.selected')).toHaveLength(0);
        expect($('#coeTotalDisplay').textContent).toBe('—');
        expect($('#coeTotalTierBadge').textContent).toBe('[ 未評分 ]');
        expect($$('.tier-medal.selected')).toHaveLength(0);
        expect($$('#evaluationAccordion [aria-pressed="true"]')).toHaveLength(0);
        expect($$('.flavor-tag.selected')).toHaveLength(0);
        expect($$('input[type="range"][data-ref-score]').every(r => r.value === '5')).toBe(true);
        expect($('#f-notes').value).toBe('');
        expect($('#f-defects').value).toBe('');
        expect($('#aroma_dryAroma').value).toBe('');

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

    it('applyEvaluationsToForm({}) 把填過的評分全部清空', () => {
        win.applyEvaluationsToForm({});
        expect($$('#evaluationAccordion [aria-pressed="true"]')).toHaveLength(0);
        expect($$('.flavor-tag.selected')).toHaveLength(0);
        expect($('#flavor_score').value).toBe('5');
        expect($('#flavor_notes').value).toBe('');
    });

    it('頂端分頁只有編號（沒有分數），評過分的杯另外標示', () => {
        expect($$('#cup-tabbar .cup-tab').map(t => t.textContent.trim())).toEqual(['A', 'B']);
        expect($$('#cup-tabbar .cup-tab').map(t => t.classList.contains('is-scored'))).toEqual([true, false]);
    });

    it('多次切換後 chip 點一次仍只切換一次（accordion listener 沒有疊加）', () => {
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
        expect(visible($('#coeTotalDisplay'))).toBe(false);
        expect(visible($('#f-cup-bean'))).toBe(false);
        expect(visible($('#reveal-cup-cards'))).toBe(false);
        expect(visible($('#session-info-toggle'))).toBe(false);
    });

    it('② 評分：頂端杯號 + 評分卡，看不到場次資訊與豆子資訊', async () => {
        await mount();
        expect($('#session-stage-name').textContent).toBe('② 評分');
        expect(visible($('#cup-tabbar'))).toBe(true);
        expect(visible($('#coeTotalDisplay'))).toBe(true);
        expect(visible($('#evaluationAccordion'))).toBe(true);
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
        expect(visible($('#coeTotalDisplay'))).toBe(false);

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

describe('未評分與清除分數', () => {
    beforeEach(() => mount());

    it('空白的杯是未評分；只點徽章仍是未評分', () => {
        clickTab(1);
        expect(form().cups[1].coe_total).toBeNull();
        expect(form().cups[1].coe_tier_id).toBeNull();

        $('.tier-medal[data-tier-id="recommend"]').click();
        expect(form().cups[1].coe_total).toBeNull();
        expect(form().cups[1].coe_tier_id).toBeNull();
        expect($('#coeTotalDisplay').textContent).toBe('—');
        // 分數列換成金獎的範圍，點下去才算評分
        $('.score-chip[data-score="87"]').click();
        expect(form().cups[1].coe_total).toBe(87);
        expect(form().cups[1].coe_tier_id).toBe('recommend');
    });

    it('直接點預設（銅）列的分數：徽章跟著亮起，tier 不會存成 null', () => {
        clickTab(1);
        $('.score-chip[data-score="82"]').click();
        expect(form().cups[1].coe_total).toBe(82);
        expect(form().cups[1].coe_tier_id).toBe('common');
        expect($('.tier-medal.selected').dataset.tierId).toBe('common');
        expect($('#cup-tabbar .cup-tab.active').classList.contains('is-scored')).toBe(true);
        expect($('#f-coe-clear').hidden).toBe(false);
    });

    it('清除分數：回到未評分', () => {
        expect($('#f-coe-clear').hidden).toBe(false);
        $('#f-coe-clear').click();
        expect(form().cups[0].coe_total).toBeNull();
        expect(form().cups[0].coe_tier_id).toBeNull();
        expect($('#coeTotalDisplay').textContent).toBe('—');
        expect($('#f-coe-clear').hidden).toBe(true);
        expect($('#cup-tabbar .cup-tab.active').classList.contains('is-scored')).toBe(false);
    });

    it('沖煮 / 品鑑表單（分數不會是 null）點徽章仍跳到該級距最低分', () => {
        win.eval(`coeState.coeTotal = 82; coeState.selectedTierId = 'common';`);
        win.selectTier('recommend');
        expect(win.eval('coeState.coeTotal')).toBe(86);
    });
});

describe('③ 揭曉：杯卡', () => {
    beforeEach(() => mount([cupA, cupB, cupC], { stage: 'reveal' }));

    it('依分數排名，卡片顯示名次、編號、分數徽章與豆名', () => {
        expect(cardCodes()).toEqual(['A', 'C', 'B']);
        const heads = $$('#reveal-cup-cards .reveal-cup-head');
        expect(heads.map(h => h.querySelector('.reveal-cup-rank').textContent)).toEqual(['1', '2', '—']);
        expect(heads[0].querySelector('.reveal-cup-medal').textContent).toBe('金 87.0');
        expect(heads[0].querySelector('.reveal-cup-medal').classList.contains('t-recommend')).toBe(true);
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
        expect(visible($('#coeTotalDisplay'))).toBe(false);
        expect($('#cup-score-summary').textContent).toBe('評分 84.0 銀');

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
        expect(visible($('#coeTotalDisplay'))).toBe(true);
        $('.tier-medal[data-tier-id="amazing"]').click();
        $('.score-chip[data-score="90"]').click();
        expect(form().cups[2].coe_total).toBe(90);
        expect(cardCodes()).toEqual(['A', 'C', 'B']);
        expect($('#reveal-cup-cards .reveal-cup.is-open .reveal-cup-medal').textContent).toContain('90.0');

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
        $('.score-chip[data-score="82"]').click();
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

    it('存檔期間離開頁面：草稿照清，但不把人拉回場次頁', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        stub();
        let release;
        win.eval('api').saveSession = () => new Promise(r => { release = r; });
        const pending = win.submitSessionForm();
        win.eval('state.currentForm = null'); // 模擬 renderRoute 換頁
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

describe('草稿', () => {
    const KEY = 'coffee-review:draft:session/s1';
    const wait = () => new Promise(r => setTimeout(r, 350));
    const bindDraft = () => {
        win.localStorage.clear();
        win.setupDraftAutosave('session', 's1', { build: win.buildSessionDraft, apply: win.applySessionToForm });
    };

    it('只切分頁不產生草稿', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        bindDraft();
        clickTab(1);
        clickTab(0);
        await wait();
        expect(win.localStorage.getItem(KEY)).toBeNull();
    });

    it('③ 只開關杯卡與收合區塊也不產生草稿', async () => {
        await mount([cupA, cupB], { recordId: 's1', stage: 'reveal' });
        bindDraft();
        openCard('B');
        $('#cup-score-toggle').click();
        openCard('A');
        $('#session-info-toggle').click();
        await wait();
        expect(win.localStorage.getItem(KEY)).toBeNull();
    });

    it('有修改才寫草稿，每杯帶著 id，也記下階段', async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        bindDraft();
        clickTab(1);
        $('.score-chip[data-score="82"]').click();
        await wait();
        const draft = JSON.parse(win.localStorage.getItem(KEY));
        expect(draft.payload.cups.map(c => c.id)).toEqual(['k1', 'k2']);
        expect(draft.payload.cups[1].coe_total).toBe(82);
        expect(draft.payload.title).toBe('日曬比較');
        expect(draft.payload.stage).toBe('scoring');
    });

    it('刪除整場後草稿被清掉', async () => {
        await mount([cupA, cupB], { recordId: 's1', stage: 'reveal' });
        bindDraft();
        openCard('A');
        typeInto($('#f-cup-bean'), '改過');
        await wait();
        expect(win.localStorage.getItem(KEY)).not.toBeNull();

        win.confirmDialog = () => Promise.resolve(true);
        win.eval('api').deleteSession = () => Promise.resolve();
        $('#f-delete').click();
        await new Promise(r => setTimeout(r, 0));
        await wait();
        expect(win.localStorage.getItem(KEY)).toBeNull();
    });

    // 還原列在 <form> 裡面，那次點擊會冒泡到自動儲存；還原的內容算「未儲存」，
    // 不能被當成新 baseline，否則按了還原沒再動就離開時草稿會被清掉。
    it('按還原後沒再改就離開 → 草稿仍在', async () => {
        await mount([cupA, cupB], { recordId: 's1', stage: 'reveal' });
        win.localStorage.clear();
        win.writeDraft(KEY, 'session', { ...win.buildSessionDraft(), title: '沒存完的場次' });
        win.setupDraftAutosave('session', 's1', { build: win.buildSessionDraft, apply: win.applySessionToForm });

        doc.querySelector('.draft-banner [data-draft="restore"]').click();
        expect($('#f-session-title').value).toBe('沒存完的場次');
        await wait();

        expect(win.readDraft(KEY)?.payload.title).toBe('沒存完的場次');
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

    it('新場次還原草稿時換新的杯 id（不會把上次已存的杯搬進新場次）', async () => {
        await boot();
        win.apiFetch = () => Promise.resolve(null);
        win.localStorage.setItem('coffee-review:draft:new/session', JSON.stringify({
            schema: 1, savedAt: Date.now(), mode: 'session',
            payload: { title: '上次沒存完', code_style: 'letter', stage: 'setup', cups: [{ id: 'old-1', code: 'A' }, { id: 'old-2', code: 'B' }] },
        }));
        const root = doc.getElementById('app');
        await win.viewSessionForm(root, {});
        doc.querySelector('.draft-banner [data-draft="restore"]').click();
        const cups = win.eval('state.currentForm').cups;
        expect(cups.map(c => c.code)).toEqual(['A', 'B']);
        expect(cups.some(c => c.id.startsWith('old-'))).toBe(false);
        expect(doc.getElementById('f-session-title').value).toBe('上次沒存完');
        expect(gridInputs().map(i => i.value)).toEqual(['A', 'B']);
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
