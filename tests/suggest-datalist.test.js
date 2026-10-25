import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// 表單 datalist 建議（#29）：GET /api/suggest 的歷史值（已依頻率）在前，內建常見值中
// 歷史沒出現的接在後面；/api/suggest 失敗仍有內建值；存檔成功後再進表單會重抓。
// 走真的 router（hashchange → renderRoute → viewForm / viewSessionForm），只 stub apiFetch。

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
const TEMPLATES = INDEX.match(/<template id="[^"]+">[\s\S]*?<\/template>/g).join('');
const TABBAR = INDEX.match(/<nav class="tabbar"[\s\S]*?<\/nav>/)[0];

const SHOP = { id: 'shop1', name: '測試咖啡', location: '台北', lat: 0, lng: 0, google_place_id: 'p1' };
const SUGGEST = {
    origins: ['肯亞', 'Kenya AA', '衣索比亞'],
    processes: ['日曬', '酒桶發酵'],
    methods: ['V60', '愛樂壓'],
    beans: ['測試莊園 耶加雪菲', '測試莊園 西達摩'],
    items: ['氮氣冷萃', '濃縮'],
};

let win, doc;

const tick = () => new Promise(resolve => setTimeout(resolve, 20));
async function settle(n = 5) {
    for (let i = 0; i < n; i++) await tick();
}

function makeApi({ suggest = () => Promise.resolve(SUGGEST) } = {}) {
    const calls = [];
    const fn = (p, init = {}) => {
        const method = init.method || 'GET';
        calls.push({ method, path: p });
        if (p === '/api/suggest') return suggest();
        if (method === 'POST') return Promise.resolve({ id: 'r1' });
        if (method !== 'GET') return Promise.resolve(null);
        if (p === '/api/shops') return Promise.resolve([SHOP]);
        if (p.startsWith('/api/records?') || p.endsWith('/beans')) return Promise.resolve([]);
        return Promise.resolve(null);
    };
    return { fn, calls, suggestCalls: () => calls.filter(c => c.path === '/api/suggest').length };
}

async function go(hash) {
    win.location.hash = hash;
    await settle();
}

async function boot(formHash, api) {
    ({ window: win, document: doc } = await loadApp({
        bodyHtml: `<main id="app"></main>${TABBAR}${TEMPLATES}`,
    }));
    win.apiFetch = api.fn;
    win.setSessionUser({ id: 'u1' });
    await go('#/records');
    await go(formHash);
}

const options = id => [...doc.querySelectorAll(`#app #${id} option`)].map(o => o.value);
const COMMON_COUNTRIES = () => win.eval('COMMON_COUNTRIES');
const COMMON_PROCESSES = () => win.eval('COMMON_PROCESSES');
const COMMON_ITEMS = () => win.eval('COMMON_ITEMS');

describe('mergeSuggestions', () => {
    it('歷史值在前，內建值去掉已出現的（不分大小寫）接在後面', async () => {
        ({ window: win } = await loadApp());
        expect(win.mergeSuggestions(['Kenya', '巴西'], ['kenya', '巴西', '巴拿馬'])).toEqual(['Kenya', '巴西', '巴拿馬']);
        expect(win.mergeSuggestions([], ['A', 'B'])).toEqual(['A', 'B']);
    });
});

describe('沖煮 / 品鑑表單', () => {
    it('每個 datalist = 歷史值依頻率 + 尚未出現的內建值', async () => {
        await boot('#/new/cupping', makeApi());
        expect(options('origin-options')).toEqual([
            '肯亞', 'Kenya AA', '衣索比亞',
            ...COMMON_COUNTRIES().filter(c => c !== '肯亞' && c !== '衣索比亞'),
        ]);
        expect(options('process-options')).toEqual([
            '日曬', '酒桶發酵', ...COMMON_PROCESSES().filter(p => p !== '日曬'),
        ]);
        expect(options('method-options')).toEqual(['V60', '愛樂壓']);
        expect(options('bean-options')).toEqual(SUGGEST.beans);
        expect(doc.getElementById('f-cupping-bean').getAttribute('list')).toBe('bean-options');
        expect(doc.getElementById('f-tasting-bean').getAttribute('list')).toBe('bean-options');
        expect(doc.getElementById('f-process').getAttribute('list')).toBe('process-options');
        expect(doc.getElementById('f-method').getAttribute('list')).toBe('method-options');
    });

    it('品鑑模式也填品項清單', async () => {
        await boot('#/new/tasting', makeApi());
        expect(options('item-options')).toEqual([
            '氮氣冷萃', '濃縮', ...COMMON_ITEMS().filter(i => i !== '濃縮'),
        ]);
        expect(options('bean-options')).toEqual(SUGGEST.beans);
    });

    it('/api/suggest 失敗時仍有內建值，豆名 / 方法清單為空', async () => {
        const api = makeApi({ suggest: () => Promise.reject(new Error('boom')) });
        let warned = 0;
        ({ window: win, document: doc } = await loadApp({
            bodyHtml: `<main id="app"></main>${TABBAR}${TEMPLATES}`,
        }));
        win.console.warn = () => { warned++; };
        win.apiFetch = api.fn;
        win.setSessionUser({ id: 'u1' });
        await go('#/records');
        await go('#/new/cupping');
        expect(warned).toBeGreaterThan(0);
        expect(options('origin-options')).toEqual(COMMON_COUNTRIES());
        expect(options('origin-options')).toHaveLength(15);
        expect(options('process-options')).toEqual(COMMON_PROCESSES());
        expect(options('bean-options')).toEqual([]);
        expect(options('method-options')).toEqual([]);
        expect(win.eval('state.suggestLoaded')).toBe(false);
    });

    it('已載入過就不再重抓；存檔成功後再進表單會重抓', async () => {
        const api = makeApi();
        await boot('#/new/cupping', api);
        expect(api.suggestCalls()).toBe(1);

        await go('#/records');
        await go('#/new/cupping');
        expect(api.suggestCalls()).toBe(1);

        doc.querySelector('.bean-type-chip-row[data-bean-type-group="cupping"] .bean-type-chip').click();
        doc.getElementById('f-cupping-bean').value = '新的豆';
        doc.getElementById('f-save').click();
        await settle();
        expect(api.calls.some(c => c.method === 'POST')).toBe(true);
        expect(win.eval('state.suggestLoaded')).toBe(false);

        await go('#/new/cupping');
        expect(api.suggestCalls()).toBe(2);
    });

    it('請求期間存檔：舊快照不會把 suggestLoaded 設回 true，下次進表單仍重抓', async () => {
        let release;
        const api = makeApi({ suggest: () => new Promise(resolve => { release = () => resolve(SUGGEST); }) });
        await boot('#/new/cupping', api);
        expect(api.suggestCalls()).toBe(1);

        win.invalidateSuggestions(); // 模擬 /api/suggest 還沒回來時存檔成功
        release();
        await settle();
        expect(win.eval('state.suggestLoaded')).toBe(false);
        expect(options('origin-options').slice(0, 3)).toEqual(SUGGEST.origins);

        await go('#/records');
        await go('#/new/cupping');
        expect(api.suggestCalls()).toBe(2);
    });
});

describe('杯測表單', () => {
    it('豆名 / 國家 / 處理法都有清單', async () => {
        await boot('#/new/session', makeApi());
        expect(options('bean-options')).toEqual(SUGGEST.beans);
        expect(options('origin-options').slice(0, 3)).toEqual(['肯亞', 'Kenya AA', '衣索比亞']);
        expect(options('process-options').slice(0, 2)).toEqual(['日曬', '酒桶發酵']);
        expect(doc.getElementById('f-cup-bean').getAttribute('list')).toBe('bean-options');
    });
});
