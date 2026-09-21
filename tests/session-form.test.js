import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// 杯測場次表單：同一組評分元件輪流裝不同的杯。這裡鎖住：
// - 切換分頁時每個元件都會重設（不會留著上一杯的值），切回來內容不變
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
const CLOUD = { url: 'https://example.supabase.co', anonKey: 'anon-key' };

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

let win, doc;

async function mount(cups = [cupA, cupB], { recordId = null } = {}) {
    ({ window: win, document: doc } = await loadApp({
        // 掛在 #app 外面：app.js 的首次 renderRoute 會清掉 #app 的內容。
        bodyHtml: `<main id="app"></main>${FORM_MARKUP}`,
    }));
    win.eval(`state.currentForm = { mode: 'session', recordId: ${JSON.stringify(recordId)}, id: 's1',
        cups: [], activeIndex: 0, savedCupCount: ${cups.length} };`);
    win.initSessionForm();
    win.applySessionToForm({ session_date: '2026-09-20', title: '日曬比較', code_style: 'manual', cups });
}

const form = () => win.eval('state.currentForm');
const $ = sel => doc.querySelector(sel);
const $$ = sel => [...doc.querySelectorAll(sel)];
const clickTab = i => $(`#cup-tabbar [data-cup-index="${i}"]`).click();

describe('切換分頁', () => {
    beforeEach(() => mount());

    it('第 1 杯載入後各元件都帶到值', () => {
        expect($('#f-cup-code').value).toBe('A');
        expect($('#coeTotalDisplay').textContent).toBe('87.0');
        expect($('#flavor_score').value).toBe('7');
        expect($$('#flavor_flavorList .flavor-tag.selected').length).toBeGreaterThan(0);
        expect($('#aroma_dryAroma').value).toBe('花香');
    });

    it('切到空白的杯：每個元件都重設，切回來內容不變', () => {
        const before = JSON.stringify(win.readCupFromForm());
        clickTab(1);

        expect($('#f-cup-code').value).toBe('B');
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

    it('分頁顯示編號與分數，總覽依分數排名、可點', () => {
        expect($$('#cup-tabbar .cup-tab-code').map(e => e.textContent)).toEqual(['A', 'B']);
        expect($$('#cup-tabbar .cup-tab-score').map(e => e.textContent)).toEqual(['87.0', '—']);
        const rows = $$('#session-overview button.cup-ranking-row');
        expect(rows.map(r => r.querySelector('.cup-code-badge').textContent)).toEqual(['A', 'B']);
        rows[1].click();
        expect(form().activeIndex).toBe(1);
        expect($('#f-cup-code').value).toBe('B');
    });

    it('多次切換後 chip 點一次仍只切換一次（accordion listener 沒有疊加）', () => {
        clickTab(1); clickTab(0); clickTab(1);
        const chip = $('.chip-group[data-chip-name="acidity_textures"] .chip[data-chip-value="活潑"]');
        chip.click();
        expect(chip.getAttribute('aria-pressed')).toBe('true');
        expect(form().cups[1].evaluations.acidity.textures).toEqual(['活潑']);
    });
});

describe('未評分與清除分數', () => {
    beforeEach(() => mount());

    it('新的一杯是未評分；只點徽章仍是未評分', () => {
        $('#cup-add').click();
        const idx = form().activeIndex;
        expect(form().cups[idx].coe_total).toBeNull();
        expect(form().cups[idx].coe_tier_id).toBeNull();

        $('.tier-medal[data-tier-id="recommend"]').click();
        expect(form().cups[idx].coe_total).toBeNull();
        expect(form().cups[idx].coe_tier_id).toBeNull();
        expect($('#coeTotalDisplay').textContent).toBe('—');
        // 分數列換成金獎的範圍，點下去才算評分
        $('.score-chip[data-score="87"]').click();
        expect(form().cups[idx].coe_total).toBe(87);
        expect(form().cups[idx].coe_tier_id).toBe('recommend');
    });

    it('直接點預設（銅）列的分數：徽章跟著亮起，tier 不會存成 null', () => {
        $('#cup-add').click();
        const idx = form().activeIndex;
        $('.score-chip[data-score="82"]').click();
        expect(form().cups[idx].coe_total).toBe(82);
        expect(form().cups[idx].coe_tier_id).toBe('common');
        expect($('.tier-medal.selected').dataset.tierId).toBe('common');
        expect($('#cup-tabbar .cup-tab.active .cup-tab-score').textContent).toBe('82.0');
        expect($('#f-coe-clear').hidden).toBe(false);
    });

    it('清除分數：回到未評分並退出排名', () => {
        expect($('#f-coe-clear').hidden).toBe(false);
        $('#f-coe-clear').click();
        expect(form().cups[0].coe_total).toBeNull();
        expect(form().cups[0].coe_tier_id).toBeNull();
        expect($('#coeTotalDisplay').textContent).toBe('—');
        expect($('#f-coe-clear').hidden).toBe(true);
        expect($$('#session-overview .cup-ranking-rank').map(e => e.textContent)).toEqual(['—', '—']);
    });

    it('沖煮 / 品鑑表單（分數不會是 null）點徽章仍跳到該級距最低分', () => {
        win.eval(`coeState.coeTotal = 82; coeState.selectedTierId = 'common';`);
        win.selectTier('recommend');
        expect(win.eval('coeState.coeTotal')).toBe(86);
    });
});

describe('按鈕不會送出整場', () => {
    beforeEach(() => mount());

    it('樣板裡除了 #f-save 以外的 button 都是 type="button"', () => {
        const nonButton = $$('.session-form button')
            .filter(b => b.id !== 'f-save' && b.getAttribute('type') !== 'button')
            .map(b => b.outerHTML.slice(0, 80));
        expect(nonButton).toEqual([]);
    });

    it('新增、切換、總覽、編號方式、移除都不觸發 submit', async () => {
        let submitted = 0;
        $('.session-form').addEventListener('submit', () => { submitted += 1; });
        win.confirmDialog = () => Promise.resolve(false);
        $('#cup-add').click();
        clickTab(0);
        $$('#session-overview button.cup-ranking-row')[1].click();
        $('[data-code-style="letter"]').click();
        $('#f-cup-remove').click();
        $('.score-chip[data-score="82"]').click();
        await new Promise(r => setTimeout(r, 0));
        expect(submitted).toBe(0);
    });

    it('在編號欄按 Enter 不送出', () => {
        const ev = new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        $('#f-cup-code').dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);
    });
});

describe('編號方式', () => {
    it('A、B、C：補上空白的編號，新增的杯接著編', async () => {
        await mount([{ id: 'k1', code: '' }]);
        $('[data-code-style="letter"]').click();
        expect(form().cups.map(c => c.code)).toEqual(['A']);
        expect($('#f-cup-code').value).toBe('A');
        $('#cup-add').click();
        expect(form().cups.map(c => c.code)).toEqual(['A', 'B']);
    });

    it('手動：新增的杯編號空白，分頁先顯示 #n 並聚焦編號欄', async () => {
        await mount();
        $('#cup-add').click();
        expect(form().cups[2].code).toBe('');
        expect($$('#cup-tabbar .cup-tab-code')[2].textContent).toBe('#3');
        expect(doc.activeElement).toBe($('#f-cup-code'));
    });

    it('輸入編號時分頁即時更新', async () => {
        await mount();
        $('#f-cup-code').value = 'X1';
        $('#f-cup-code').dispatchEvent(new win.Event('input', { bubbles: true }));
        expect($$('#cup-tabbar .cup-tab-code')[0].textContent).toBe('X1');
        expect(form().cups[0].code).toBe('X1');
    });
});

describe('移除一杯', () => {
    it('確認後移除並停在相鄰的杯；只剩一杯時不能移除', async () => {
        await mount();
        win.confirmDialog = () => Promise.resolve(true);
        clickTab(1);
        await win.removeActiveCup();
        expect(form().cups.map(c => c.code)).toEqual(['A']);
        expect(form().activeIndex).toBe(0);
        expect($('#f-cup-code').value).toBe('A');

        await win.removeActiveCup();
        expect(form().cups).toHaveLength(1);
    });

    it('確認框開著時杯的順序變了，移除的仍是確認的那一杯（依 id 找回）', async () => {
        await mount();
        let answer;
        win.confirmDialog = () => new Promise(r => { answer = r; });
        clickTab(1); // 確認要移除 B
        const pending = win.removeActiveCup();
        win.eval('state.currentForm.cups.reverse(); state.currentForm.activeIndex = 1;');
        answer(true);
        await pending;
        expect(form().cups.map(c => c.id)).toEqual(['k1']);
    });
});

describe('存檔', () => {
    beforeEach(() => mount([cupA, cupB], { recordId: 's1' }));

    it('存檔期間離開頁面：草稿照清，但不把人拉回場次頁', async () => {
        let release;
        win.eval('api').saveSession = () => new Promise(r => { release = r; });
        const navs = [];
        win.navigate = p => navs.push(p);
        win.showToast = () => {};
        const pending = win.submitSessionForm();
        win.eval('state.currentForm = null'); // 模擬 renderRoute 換頁
        release();
        await pending;
        expect(navs).toEqual([]);
    });

    it('留在頁面時存完會跳到場次頁', async () => {
        win.eval('api').saveSession = () => Promise.resolve();
        const navs = [];
        win.navigate = p => navs.push(p);
        win.showToast = () => {};
        await win.submitSessionForm();
        expect(navs).toEqual(['/session/s1']);
    });

    it('編號空白或重複時不存檔，切到那一杯並提示', async () => {
        let called = false;
        win.eval('api').saveSession = () => { called = true; return Promise.resolve(); };
        const toasts = [];
        win.showToast = m => toasts.push(m);
        $('#f-cup-code').value = '   ';
        $('#f-cup-code').dispatchEvent(new win.Event('input', { bubbles: true }));
        clickTab(1);
        await win.submitSessionForm();
        expect(called).toBe(false);
        expect(toasts).toEqual(['第 1 杯還沒有編號']);
        expect(form().activeIndex).toBe(0);
        expect(doc.activeElement).toBe($('#f-cup-code'));

        // 改成和 B 重複（忽略大小寫）→ 一樣不給存，指向後出現的那一杯
        $('#f-cup-code').value = 'b';
        $('#f-cup-code').dispatchEvent(new win.Event('input', { bubbles: true }));
        await win.submitSessionForm();
        expect(called).toBe(false);
        expect(toasts.at(-1)).toBe('編號「B」重複了');
        expect(form().activeIndex).toBe(1);
    });
});

describe('每杯 key 集合', () => {
    it('載入、新增、切換後每杯 key 都一樣，且不帶 DB 欄位', async () => {
        await mount();
        $('#cup-add').click();
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

    beforeEach(async () => {
        await mount([cupA, cupB], { recordId: 's1' });
        win.localStorage.clear();
        win.setupDraftAutosave('session', 's1', { build: win.buildSessionDraft, apply: win.applySessionToForm });
    });

    it('只切分頁不產生草稿', async () => {
        clickTab(1);
        clickTab(0);
        await wait();
        expect(win.localStorage.getItem(KEY)).toBeNull();
    });

    it('有修改才寫草稿，每杯帶著 id', async () => {
        clickTab(1);
        $('#f-cup-bean').value = '西達摩';
        $('#f-cup-bean').dispatchEvent(new win.Event('input', { bubbles: true }));
        await wait();
        const draft = JSON.parse(win.localStorage.getItem(KEY));
        expect(draft.payload.cups.map(c => c.id)).toEqual(['k1', 'k2']);
        expect(draft.payload.cups[1].bean_name).toBe('西達摩');
        expect(draft.payload.title).toBe('日曬比較');
    });

    it('刪除整場後草稿被清掉', async () => {
        $('#f-cup-bean').value = '改過';
        $('#f-cup-bean').dispatchEvent(new win.Event('input', { bubbles: true }));
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
        await mount([cupA, cupB], { recordId: 's1' }); // 重新掛一張沒綁過自動儲存的表單
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
    it('讀取中不掛表單（按不到儲存），離開頁面也不丟錯', async () => {
        ({ window: win, document: doc } = await loadApp({
            supabaseConfig: CLOUD,
            bodyHtml: `<main id="app"></main>${TEMPLATE}`,
        }));
        win.setSessionUser({ id: 'u1' });
        let release;
        win.ensureSupabase = () => new Promise(r => { release = r; });
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
        ({ window: win, document: doc } = await loadApp({
            supabaseConfig: CLOUD,
            bodyHtml: `<main id="app"></main>${TEMPLATE}`,
        }));
        win.setSessionUser({ id: 'u1' });
        win.ensureSupabase = () => Promise.resolve(null);
        win.localStorage.setItem('coffee-review:draft:new/session', JSON.stringify({
            schema: 1, savedAt: Date.now(), mode: 'session',
            payload: { title: '上次沒存完', code_style: 'letter', cups: [{ id: 'old-1', code: 'A' }, { id: 'old-2', code: 'B' }] },
        }));
        const root = doc.getElementById('app');
        await win.viewSessionForm(root, {});
        doc.querySelector('.draft-banner [data-draft="restore"]').click();
        const cups = win.eval('state.currentForm').cups;
        expect(cups.map(c => c.code)).toEqual(['A', 'B']);
        expect(cups.some(c => c.id.startsWith('old-'))).toBe(false);
        expect(doc.getElementById('f-session-title').value).toBe('上次沒存完');
    });

    it('新場次：日期預設今天、一杯空白、手動編號', async () => {
        ({ window: win, document: doc } = await loadApp({
            supabaseConfig: CLOUD,
            bodyHtml: `<main id="app"></main>${TEMPLATE}`,
        }));
        win.setSessionUser({ id: 'u1' });
        win.ensureSupabase = () => Promise.resolve(null);
        const root = doc.getElementById('app');
        await win.viewSessionForm(root, {});
        expect(doc.getElementById('f-session-date').value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(win.eval('state.currentForm').cups).toHaveLength(1);
        expect(doc.querySelector('[data-code-style="manual"]').classList.contains('selected')).toBe(true);
        expect(doc.getElementById('f-delete').hidden).toBe(true);
    });

    it('編輯時讀不到場次：顯示找不到，不留空白表單', async () => {
        ({ window: win, document: doc } = await loadApp({
            supabaseConfig: CLOUD,
            bodyHtml: `<main id="app"></main>${TEMPLATE}`,
        }));
        win.setSessionUser({ id: 'u1' });
        // 所有查詢都回空結果（店家清單、國家清單、場次）
        const builder = {
            select: () => builder, eq: () => builder, order: () => builder, not: () => builder,
            limit: () => builder, maybeSingle: () => builder,
            then: r => r({ data: null, error: null }),
        };
        win.ensureSupabase = () => Promise.resolve({ from: () => builder });
        const root = doc.getElementById('app');
        await win.viewSessionForm(root, { sessionId: 'missing' });
        expect(root.textContent).toContain('找不到記錄');
        expect(doc.getElementById('f-save')).toBeNull();
    });
});
