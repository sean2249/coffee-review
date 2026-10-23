import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// 草稿立即寫入（#18，Decision 2：不做離開提示）：離開表單 / 切到背景時，debounce 中的
// 最後一次輸入立刻寫進草稿，不跳任何確認框；重開表單照 #17 的橫幅。
// 走真的 router（hashchange → renderRoute → viewForm / viewSessionForm），只 stub apiFetch。

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
const TEMPLATES = INDEX.match(/<template id="[^"]+">[\s\S]*?<\/template>/g).join('');
const TABBAR = INDEX.match(/<nav class="tabbar"[\s\S]*?<\/nav>/)[0];

const SHOP = { id: 'shop1', name: '測試咖啡', location: '台北', lat: 0, lng: 0, google_place_id: 'p1' };

let win, doc;

const tick = () => new Promise(resolve => setTimeout(resolve, 20));
async function settle(n = 5) {
    for (let i = 0; i < n; i++) await tick();
}

function defaultApi(p, { method = 'GET' } = {}) {
    if (method === 'POST') return Promise.resolve({ id: 'r1' });
    if (method !== 'GET') return Promise.resolve(null);
    if (p === '/api/shops') return Promise.resolve([SHOP]);
    if (p.startsWith('/api/records?') || p.endsWith('/beans')) return Promise.resolve([]);
    return Promise.resolve(null);
}

async function go(hash) {
    win.location.hash = hash;
    await settle();
}

async function boot(formHash, api = defaultApi) {
    ({ window: win, document: doc } = await loadApp({
        bodyHtml: `<main id="app"></main>${TABBAR}${TEMPLATES}`,
    }));
    win.localStorage.clear();
    win.apiFetch = api;
    win.setSessionUser({ id: 'u1' });
    await go('#/records');
    await go(formHash);
}

const $ = sel => doc.querySelector(sel);
// 點在 tabbar 的圖示上（實際手機上點到的通常是內部的 <i>）
const tabIcon = route => $(`.tabbar-btn[data-route="${route}"] i`);
function type(sel, value) {
    const el = $(sel);
    el.value = value;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
}
const FIELD = { cupping: '#f-notes', tasting: '#f-notes', session: '#f-session-title' };
const draftOf = mode => win.readDraft(win.draftKey(mode, null));
const draftField = (mode, draft) => (mode === 'session' ? draft.payload.title : draft.payload.notes);

describe.each(['cupping', 'tasting', 'session'])('%s 新增表單', mode => {
    const formHash = `#/new/${mode}`;

    it('改欄位後立刻點 tabbar → 直接跳頁、沒有確認框；草稿已含最後一次輸入，回來可還原', async () => {
        await boot(formHash);
        type(FIELD[mode], '最後一次輸入');
        tabIcon('/shops').click();
        await tick();

        expect(win.location.hash).toBe('#/shops');
        expect($('.confirm-dialog')).toBeNull();
        // 換頁當下就寫了，不靠表單卸載後才跑的 300 ms timer
        expect(draftField(mode, draftOf(mode))).toBe('最後一次輸入');

        await go(formHash);
        expect($('.draft-banner')).not.toBeNull();
        $('.draft-banner [data-draft="restore"]').click();
        expect($(FIELD[mode]).value).toBe('最後一次輸入');
    });

    it('沒改 / 改了又改回原值就離開 → 不留草稿，重開沒有橫幅', async () => {
        await boot(formHash);
        const original = $(FIELD[mode]).value;
        type(FIELD[mode], 'x');
        type(FIELD[mode], original);
        tabIcon('/shops').click();
        await tick();
        expect(draftOf(mode)).toBeNull();
        await go(formHash);
        expect($('.draft-banner')).toBeNull();
    });
});

it('有修改時按瀏覽器返回 → 直接離開、沒有確認框，草稿含最後一次輸入', async () => {
    await boot('#/new/cupping');
    type('#f-notes', '返回前');
    win.history.back();
    await settle();
    expect(win.location.hash).toBe('#/records');
    expect($('.confirm-dialog')).toBeNull();
    expect(draftOf('cupping').payload.notes).toBe('返回前');
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
    expect(draftOf('cupping').payload.notes).toBe('最後一個字');
});

it('有修改時 beforeunload 不被攔（沒有原生「離開網站？」提示）', async () => {
    await boot('#/new/cupping');
    type('#f-notes', 'x');
    const e = new win.Event('beforeunload', { cancelable: true });
    win.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
});

describe('存檔', () => {
    function fillCupping() {
        $('.bean-type-chip-row[data-bean-type-group="cupping"] .bean-type-chip').click();
        type('#f-cupping-bean', '耶加雪菲');
    }

    it('新增存檔成功 → 再進新增表單沒有草稿橫幅', async () => {
        await boot('#/new/cupping');
        fillCupping();
        $('#f-save').click();
        await settle();
        expect(win.location.hash).toBe('#/cupping/r1');
        await go('#/new/cupping');
        expect($('.draft-banner')).toBeNull();
    });

    it('按下儲存後、API 回來前就離開 → 存檔成功後沒有草稿', async () => {
        let release;
        await boot('#/new/cupping', (p, init = {}) => (init.method === 'POST'
            ? new Promise(r => { release = r; })
            : defaultApi(p, init)));
        fillCupping();
        $('#f-save').click();
        await tick();
        tabIcon('/shops').click();
        await settle();
        expect(win.location.hash).toBe('#/shops');
        expect(draftOf('cupping')).not.toBeNull(); // 存檔還沒回來：先留著

        release({ id: 'r1' });
        await settle();
        expect(draftOf('cupping')).toBeNull();
        expect(win.location.hash).toBe('#/shops'); // 不把人從別頁拉回記錄頁
    });

    it('存檔中離開、又打開同一個新增表單繼續寫 → 存檔回來不清掉新表單的草稿，也不跳走', async () => {
        let release;
        await boot('#/new/cupping', (p, init = {}) => (init.method === 'POST'
            ? new Promise(r => { release = r; })
            : defaultApi(p, init)));
        fillCupping();
        $('#f-save').click();
        await tick();
        await go('#/records');
        await go('#/new/cupping');
        $('.draft-banner [data-draft="restore"]').click();
        type('#f-notes', '新表單接著寫');
        await settle(20); // 過 debounce，pending 已寫出

        release({ id: 'r1' });
        await settle();
        expect(win.location.hash).toBe('#/new/cupping');
        expect(draftOf('cupping')?.payload.notes).toBe('新表單接著寫');
    });

    // 品鑑表單：填好必填、改店家筆記、按儲存（POST 卡住），然後離開到記錄頁。
    async function saveTastingThenLeave({ noteFails = false } = {}) {
        let release;
        const calls = [];
        await boot('#/new/tasting?shop=shop1', (p, init = {}) => {
            calls.push({ method: init.method || 'GET', path: p, body: init.body });
            if (init.method === 'POST') return new Promise(r => { release = r; });
            if (init.method === 'PUT' && p.endsWith('/note') && noteFails) return Promise.reject(new Error('note boom'));
            return defaultApi(p, init);
        });
        $('.bean-type-chip-row[data-bean-type-group="tasting"] .bean-type-chip').click();
        type('#f-item_ordered', '拿鐵');
        type('#sn-intro', '筆記改了');
        $('#f-save').click();
        await tick();
        await go('#/records');
        return { calls, release: () => release({ id: 'r1' }) };
    }

    it('品鑑存檔中離開 → 記錄存好後用送出當下的快照存店家筆記，顯示成功、不跳走', async () => {
        const { calls, release } = await saveTastingThenLeave();
        release();
        await settle();
        const put = calls.find(c => c.method === 'PUT' && c.path === '/api/shops/shop1/note');
        expect(put?.body.intro).toBe('筆記改了');
        expect(doc.getElementById('toastMsg').textContent).toBe('✓ 已儲存');
        expect(win.location.hash).toBe('#/records');
    });

    it('品鑑存檔中離開、店家筆記存失敗 → 不顯示「✓ 已儲存」，改顯示錯誤', async () => {
        const { release } = await saveTastingThenLeave({ noteFails: true });
        const realError = win.console.error;
        win.console.error = () => {};
        release();
        await settle();
        win.console.error = realError;
        const toast = doc.getElementById('toastMsg');
        expect(toast.textContent).not.toBe('✓ 已儲存');
        expect(toast.textContent).toContain('店家筆記沒存起來');
        expect(toast.classList.contains('error')).toBe(true);
    });

    it('存檔中離開、又打開同一個新增表單但沒改 → 存檔回來照樣清掉那份草稿（不留已存內容的草稿）', async () => {
        let release;
        await boot('#/new/cupping', (p, init = {}) => (init.method === 'POST'
            ? new Promise(r => { release = r; })
            : defaultApi(p, init)));
        fillCupping();
        $('#f-save').click();
        await tick();
        await go('#/records');
        await go('#/new/cupping');
        expect($('.draft-banner')).not.toBeNull();

        release({ id: 'r1' }); // 存檔回來時還停在重開的表單上
        await settle();
        expect(draftOf('cupping')).toBeNull();
        await go('#/shops'); // 不理橫幅就走
        expect(draftOf('cupping')).toBeNull();
    });

    it('先存過一版草稿、改了又立刻按儲存 → 存檔成功後沒有草稿（比對前先 flush）', async () => {
        await boot('#/new/cupping');
        fillCupping();
        await settle(20); // 第一版草稿已寫出
        type('#f-notes', '最後一刻才改');
        $('#f-save').click(); // 300 ms 內就按
        await settle();
        expect(win.location.hash).toBe('#/cupping/r1');
        expect(draftOf('cupping')).toBeNull();
    });

    it('存檔失敗後離開 → 草稿還在', async () => {
        await boot('#/new/cupping', (p, init = {}) => (init.method === 'POST'
            ? Promise.reject(new Error('boom'))
            : defaultApi(p, init)));
        const realError = win.console.error;
        win.console.error = () => {};
        fillCupping();
        $('#f-save').click();
        await settle();
        win.console.error = realError;
        tabIcon('/shops').click();
        await tick();
        expect(draftOf('cupping')?.payload.bean_name).toBe('耶加雪菲');
    });
});
