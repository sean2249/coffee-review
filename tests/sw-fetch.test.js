import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// 部署後第一次開：導航是 network-first，拿到新的 index.html；若 app.js 從快取回舊版，
// 新模板配舊程式，沖煮表單的 #f-defects 根本沒長出來，儲存就炸
// 「null is not an object (evaluating 'document.getElementById('f-defects').value')」。
// 同源的 app shell 必須跟 index.html 一樣先走網路。

const here = path.dirname(fileURLToPath(import.meta.url));
const SW = fs.readFileSync(path.join(here, '..', 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://coffee.example.test';

function loadSw({ cached, network }) {
    const listeners = {};
    const store = new Map(Object.entries(cached));
    const cache = {
        match: async req => store.get(typeof req === 'string' ? req : req.url),
        put: async (req, res) => { store.set(req.url, res); },
    };
    const ctx = vm.createContext({
        URL, Response, Promise,
        self: {
            location: { origin: ORIGIN },
            addEventListener: (type, fn) => { listeners[type] = fn; },
        },
        caches: { open: async () => cache },
        fetch: async req => network(req.url),
    });
    vm.runInContext(SW, ctx);
    return async url => {
        let p;
        listeners.fetch({
            request: { url, method: 'GET', mode: 'no-cors' },
            respondWith: r => { p = r; },
        });
        return p;
    };
}

const res = body => ({ ok: true, type: 'basic', clone() { return this; }, text: async () => body });

describe('service worker: same-origin app shell', () => {
    it('線上時 app.js 回網路上的新版，不回快取裡的舊版', async () => {
        const get = loadSw({
            cached: { [`${ORIGIN}/app.js`]: res('old') },
            network: () => res('new'),
        });
        const r = await get(`${ORIGIN}/app.js`);
        expect(await r.text()).toBe('new');
    });

    it('離線時退回快取', async () => {
        const get = loadSw({
            cached: { [`${ORIGIN}/app.js`]: res('old') },
            network: () => { throw new TypeError('offline'); },
        });
        const r = await get(`${ORIGIN}/app.js`);
        expect(await r.text()).toBe('old');
    });
});
