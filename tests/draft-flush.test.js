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
