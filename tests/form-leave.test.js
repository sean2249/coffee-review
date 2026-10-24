import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// 表單草稿功能已移除（#137）：離開再回來就是空白表單，舊版留在 localStorage 的草稿啟動時清掉。
// submitForm 存檔中離開：不把人拉回記錄頁，店家筆記用按儲存那一刻的快照。
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

describe.each([
    ['cupping', '#f-notes'],
    ['tasting', '#f-notes'],
    ['session', '#f-session-title'],
])('%s 新增表單', (mode, field) => {
    it('打完字離開再回來 → 空白表單，沒有草稿橫幅，也沒寫 localStorage', async () => {
        await boot(`#/new/${mode}`);
        const original = $(field).value;
        type(field, '沒存就離開');
        tabIcon('/shops').click();
        await settle();
        await go(`#/new/${mode}`);
        expect($('.draft-banner')).toBeNull();
        expect($(field).value).toBe(original);
        expect(win.localStorage.length).toBe(0);
    });
});

describe('purgeLegacyDrafts', () => {
    it('只刪 coffee-review:draft: 開頭的 key', async () => {
        await boot('#/records');
        win.localStorage.setItem('coffee-review:draft:new/cupping', '{}');
        win.localStorage.setItem('coffee-review:draft:session/s1', '{}');
        win.localStorage.setItem('coffee-review:other', 'keep');
        win.purgeLegacyDrafts();
        expect(Object.keys(win.localStorage)).toEqual(['coffee-review:other']);
    });

    it('localStorage 不可用時不丟錯', async () => {
        await boot('#/records');
        win.eval(`Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() { throw new Error('blocked'); },
        })`);
        expect(() => win.purgeLegacyDrafts()).not.toThrow();
    });
});

describe('存檔中離開', () => {
    it('沖煮：按下儲存後、API 回來前就點 tabbar 離開 → 停在別頁，不被拉回記錄頁', async () => {
        let release;
        await boot('#/new/cupping', (p, init = {}) => (init.method === 'POST'
            ? new Promise(r => { release = r; })
            : defaultApi(p, init)));
        $('.bean-type-chip-row[data-bean-type-group="cupping"] .bean-type-chip').click();
        type('#f-cupping-bean', '耶加雪菲');
        $('#f-save').click();
        await tick();
        tabIcon('/shops').click();
        await settle();
        expect(win.location.hash).toBe('#/shops');

        release({ id: 'r1' });
        await settle();
        expect(win.location.hash).toBe('#/shops');
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

    it('品鑑：記錄存好後用送出當下的快照存店家筆記，顯示成功、不跳走', async () => {
        const { calls, release } = await saveTastingThenLeave();
        release();
        await settle();
        const put = calls.find(c => c.method === 'PUT' && c.path === '/api/shops/shop1/note');
        expect(put?.body.intro).toBe('筆記改了');
        expect(doc.getElementById('toastMsg').textContent).toBe('✓ 已儲存');
        expect(win.location.hash).toBe('#/records');
    });

    it('品鑑：店家筆記存失敗 → 不顯示「✓ 已儲存」，改顯示錯誤', async () => {
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
});
