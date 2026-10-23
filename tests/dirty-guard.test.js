import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// Dirty guard（#18）：表單有未儲存修改時，點 app 內連結 / 返回鍵 / 關分頁都先問。
// 走真的 router（hashchange → renderRoute → viewForm / viewSessionForm），只 stub apiFetch，
// 所以「沒有重繪」可以用 #app 第一個子節點是不是同一個物件來判斷。

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
const TEMPLATES = INDEX.match(/<template id="[^"]+">[\s\S]*?<\/template>/g).join('');
const TABBAR = INDEX.match(/<nav class="tabbar"[\s\S]*?<\/nav>/)[0];

const SHOP = { id: 'shop1', name: '測試咖啡', location: '台北', lat: 0, lng: 0, google_place_id: 'p1' };
const SESSION = { id: 's1', session_date: '2026-09-28', code_style: 'manual', stage: 'scoring', title: '日曬比較',
    cups: [{ id: 'k1', code: 'A', position: 0, coe_total: null, coe_tier_id: null, evaluations: {}, observation: {} }] };

let win, doc;

const tick = () => new Promise(resolve => setTimeout(resolve, 20));
async function settle(n = 5) {
    for (let i = 0; i < n; i++) await tick();
}

function defaultApi(p, { method = 'GET' } = {}) {
    if (method === 'POST') return Promise.resolve({ id: 'r1' });
    if (method !== 'GET') return Promise.resolve(null);
    if (p === '/api/shops') return Promise.resolve([SHOP]);
    if (p.startsWith('/api/sessions/')) return Promise.resolve(SESSION);
    if (p.startsWith('/api/records?') || p.endsWith('/beans')) return Promise.resolve([]);
    return Promise.resolve(null);
}

async function go(hash) {
    win.location.hash = hash;
    await settle();
}

// #/records → 表單，history 裡才有「上一頁」可以返回。
async function boot(formHash, api = defaultApi) {
    ({ window: win, document: doc } = await loadApp({
        bodyHtml: `<main id="app"></main>${TABBAR}${TEMPLATES}`,
    }));
    win.localStorage.clear();
    win.apiFetch = api;
    win.setSessionUser({ id: 'u1' });
    await go('#/records');
    if (formHash) await go(formHash);
}

const $ = sel => doc.querySelector(sel);
const appChild = () => doc.getElementById('app').firstElementChild;
const dialogs = () => doc.querySelectorAll('.confirm-dialog');
const dialogBtn = which => $(`.confirm-dialog [data-confirm="${which}"]`);
// 點在 tabbar 的圖示上（實際手機上點到的通常是內部的 <i>）
const tabIcon = route => $(`.tabbar-btn[data-route="${route}"] i`);
function type(sel, value) {
    const el = $(sel);
    el.value = value;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
}
const FIELD = { cupping: '#f-notes', tasting: '#f-notes', session: '#f-session-title' };

describe.each(['cupping', 'tasting', 'session'])('%s 新增表單', mode => {
    const formHash = `#/new/${mode}`;

    it('改欄位後點 tabbar → 跳確認框；繼續編輯 → 留在原表單、內容不變、焦點回到連結', async () => {
        await boot(formHash);
        const form = appChild();
        type(FIELD[mode], '改過了');
        tabIcon('/shops').click();
        await tick();

        expect(dialogs()).toHaveLength(1);
        expect($('#confirm-dialog-title').textContent).toBe('有未儲存的變更');
        expect(doc.activeElement).toBe(dialogBtn('cancel'));
        expect(dialogBtn('ok').textContent).toBe('離開');
        expect(dialogBtn('ok').className).not.toContain('btn-danger');

        dialogBtn('cancel').click();
        await settle();
        expect(win.location.hash).toBe(formHash);
        expect(appChild()).toBe(form);
        expect($(FIELD[mode]).value).toBe('改過了');
    });

    it('按離開 → 跳到目標頁；回來看得到草稿，還原後含最後一次輸入', async () => {
        await boot(formHash);
        type(FIELD[mode], '最後一次輸入'); // 不等 debounce：離開時要立刻寫進去
        tabIcon('/shops').click();
        await tick();
        dialogBtn('ok').click();
        await settle();
        expect(win.location.hash).toBe('#/shops');
        expect(dialogs()).toHaveLength(0);

        await go(formHash);
        expect($('.draft-banner')).not.toBeNull();
        $('.draft-banner [data-draft="restore"]').click();
        expect($(FIELD[mode]).value).toBe('最後一次輸入');
    });

    it('沒改 / 改了又改回原值 → 離開不問', async () => {
        await boot(formHash);
        const original = $(FIELD[mode]).value;
        type(FIELD[mode], 'x');
        type(FIELD[mode], original);
        tabIcon('/shops').click();
        await settle();
        expect(dialogs()).toHaveLength(0);
        expect(win.location.hash).toBe('#/shops');
    });
});

describe('瀏覽器返回鍵', () => {
    it('dirty 時返回 → 確認框；繼續編輯 → 網址仍是表單、沒重繪、history 不變長（重複數次）', async () => {
        await boot('#/new/cupping');
        const form = appChild();
        type('#f-notes', 'x');
        const len = win.history.length;
        for (let i = 0; i < 3; i++) {
            win.history.back();
            await settle();
            expect(dialogs()).toHaveLength(1);
            expect(win.location.hash).toBe('#/new/cupping');
            dialogBtn('cancel').click();
            await settle();
            expect(win.location.hash).toBe('#/new/cupping');
            expect(appChild()).toBe(form);
            expect(win.history.length).toBe(len);
        }
    });

    it('確認框開著時再返回 / 再點 tabbar → 不會出現第二個，網址仍是表單', async () => {
        await boot('#/new/cupping');
        type('#f-notes', 'x');
        win.history.back();
        await settle();
        win.history.back();
        await settle();
        tabIcon('/me').click();
        await settle();
        expect(dialogs()).toHaveLength(1);
        expect(win.location.hash).toBe('#/new/cupping');
        dialogBtn('cancel').click();
        await settle();
    });

    it('返回 → 離開 → 回到上一頁；在那裡再返回不會回到空白新表單', async () => {
        await boot('#/new/cupping');
        type('#f-notes', 'x');
        win.history.back();
        await settle();
        dialogBtn('ok').click();
        await settle();
        expect(win.location.hash).toBe('#/records');
        expect(dialogs()).toHaveLength(0);

        win.history.back();
        await settle();
        expect(win.location.hash).not.toBe('#/new/cupping');
        expect(dialogs()).toHaveLength(0);
    });

    it.each([true, false])('其他對話框開著時返回（dirty=%s）→ 網址留在表單、不重繪、對話框還在', async dirty => {
        await boot('#/new/cupping');
        const form = appChild();
        if (dirty) type('#f-notes', 'x');
        const other = doc.createElement('div');
        other.className = 'modal-backdrop-custom';
        doc.body.appendChild(other);

        win.history.back();
        await settle();
        expect(win.location.hash).toBe('#/new/cupping');
        expect(appChild()).toBe(form);
        expect(other.isConnected).toBe(true);
        expect(dialogs()).toHaveLength(0);
    });
});

describe('beforeunload', () => {
    const fire = () => {
        const e = new win.Event('beforeunload', { cancelable: true });
        win.dispatchEvent(e);
        return e.defaultPrevented;
    };

    it('dirty 時要求原生提示；乾淨時不攔', async () => {
        await boot('#/new/cupping');
        expect(fire()).toBe(false);
        type('#f-notes', 'x');
        expect(fire()).toBe(true);
    });

    it('列表 / 唯讀詳細頁 / 店家頁：不攔，點連結也不問', async () => {
        await boot();
        expect(fire()).toBe(false);
        await go('#/session/s1');
        expect(fire()).toBe(false);
        await go('#/shops');
        expect(fire()).toBe(false);
        tabIcon('/me').click();
        await settle();
        expect(dialogs()).toHaveLength(0);
        expect(win.location.hash).toBe('#/me');
    });
});

describe('程式自己跳頁不被擋', () => {
    async function fillCupping() {
        $('.bean-type-chip-row[data-bean-type-group="cupping"] .bean-type-chip').click();
        type('#f-cupping-bean', '耶加雪菲');
    }

    it('新增沖煮存檔成功 → 跳到記錄頁不問；再進新增表單沒有假草稿', async () => {
        await boot('#/new/cupping');
        await fillCupping();
        $('#f-save').click();
        await settle();
        expect(dialogs()).toHaveLength(0);
        expect(win.location.hash).toBe('#/cupping/r1');
        await go('#/new/cupping');
        expect($('.draft-banner')).toBeNull();
    });

    it('按下儲存後、API 回來前點 tabbar → 不問；存完後沒有假草稿', async () => {
        let release;
        await boot('#/new/cupping', (p, init = {}) => (init.method === 'POST'
            ? new Promise(r => { release = r; })
            : defaultApi(p, init)));
        await fillCupping();
        $('#f-save').click();
        await tick();
        tabIcon('/shops').click();
        await settle(20); // 等過 debounce：save 鈕那一下 click 排的草稿寫入會先落地
        expect(dialogs()).toHaveLength(0);
        expect(win.location.hash).toBe('#/shops');

        release({ id: 'r1' });
        await settle();
        expect(win.localStorage.getItem(win.draftKey('cupping', null))).toBeNull();
    });

    it('杯測「開始杯測 ›」存檔成功 → 跳頁不問', async () => {
        await boot('#/new/session');
        const count = $('#f-cup-count');
        count.value = '1';
        count.dispatchEvent(new win.Event('change', { bubbles: true }));
        type('.cup-grid-code', '123');
        $('#f-save').click();
        await settle();
        expect(dialogs()).toHaveLength(0);
        expect(win.location.hash).toMatch(/^#\/session\/[^/]+\/edit$/);
    });

    it('編輯中的場次改了東西後刪除 → 只有刪除確認，跳回列表不問', async () => {
        await boot('#/session/s1/edit');
        type('#f-session-title', '改過');
        $('#f-delete').click();
        await tick();
        expect($('#confirm-dialog-title').textContent).toBe('刪除杯測');
        dialogBtn('ok').click();
        await settle();
        expect(dialogs()).toHaveLength(0);
        expect(win.location.hash).toBe('#/records');
    });
});

describe('品鑑表單的我的店家筆記', () => {
    it('只改店家筆記 → 離開會問，訊息提到筆記不會保留', async () => {
        await boot('#/new/tasting?shop=shop1');
        type('#sn-intro', '新的筆記');
        tabIcon('/shops').click();
        await tick();
        expect(dialogs()).toHaveLength(1);
        expect($('.confirm-dialog-message').textContent).toContain('我的店家筆記的修改不會保留');
        dialogBtn('ok').click();
        await settle();
    });

    it('先在品鑑表單改過店家筆記，再開杯測表單不改 → 離開不問', async () => {
        await boot('#/new/tasting?shop=shop1');
        type('#sn-intro', '新的筆記');
        tabIcon('/new').click();
        await tick();
        dialogBtn('ok').click();
        await settle();
        await go('#/new/session');
        tabIcon('/shops').click();
        await settle();
        expect(dialogs()).toHaveLength(0);
        expect(win.location.hash).toBe('#/shops');
    });
});

describe('其他', () => {
    it('還原草稿後直接離開 → 會問', async () => {
        await boot('#/new/cupping');
        type('#f-notes', '草稿');
        await settle(20);
        await go('#/records');
        expect(dialogs()).toHaveLength(1);
        dialogBtn('ok').click();
        await settle();

        await go('#/new/cupping');
        $('.draft-banner [data-draft="restore"]').click();
        tabIcon('/shops').click();
        await tick();
        expect(dialogs()).toHaveLength(1);
        dialogBtn('cancel').click();
        await settle();
    });

    it.each([
        ['ctrlKey', { ctrlKey: true }],
        ['metaKey', { metaKey: true }],
        ['中鍵', { button: 1 }],
    ])('%s 點 app 內連結 → 不攔', async (_, init) => {
        await boot('#/new/cupping');
        type('#f-notes', 'x');
        const e = new win.MouseEvent('click', { bubbles: true, cancelable: true, ...init });
        // 不讓 jsdom 真的跟著連結走：只看我們的 capture listener 有沒有攔
        doc.addEventListener('click', ev => ev.preventDefault());
        tabIcon('/shops').dispatchEvent(e);
        await tick();
        expect(dialogs()).toHaveLength(0);
    });

    it('Esc / 點背景 = 繼續編輯', async () => {
        await boot('#/new/cupping');
        const form = appChild();
        type('#f-notes', 'x');
        tabIcon('/shops').click();
        await tick();
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await settle();
        expect(dialogs()).toHaveLength(0);
        tabIcon('/shops').click();
        await tick();
        $('.modal-backdrop-custom').click();
        await settle();
        expect(dialogs()).toHaveLength(0);
        expect(win.location.hash).toBe('#/new/cupping');
        expect(appChild()).toBe(form);
    });

    it.each(['visibilitychange', 'pagehide'])('%s → debounce 內的最後一次輸入立刻寫進草稿', async event => {
        await boot('#/new/cupping');
        type('#f-notes', '最後一個字');
        if (event === 'visibilitychange') {
            Object.defineProperty(doc, 'visibilityState', { value: 'hidden', configurable: true });
            doc.dispatchEvent(new win.Event('visibilitychange'));
        } else {
            win.dispatchEvent(new win.Event('pagehide'));
        }
        expect(win.readDraft(win.draftKey('cupping', null))?.payload.notes).toBe('最後一個字');
    });
});
