import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// #92：主導覽只有一份 markup（手機是底部 tabbar、電腦是左側欄，只靠 CSS 切換），
// 所以這裡用 index.html 裡真正的 <nav>，鎖住「每條路由恰好亮一個入口」。

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
const NAV = INDEX.match(/<nav class="tabbar"[\s\S]*?<\/nav>/)[0];
// 表單路由要從 template 掛載。
const TEMPLATES = INDEX.match(/<template[\s\S]*?<\/template>/g).join('');

const tick = () => new Promise(r => setTimeout(r, 0));
let win, doc;

beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp({ bodyHtml: `<main id="app"></main>${NAV}${TEMPLATES}` }));
    win.setSessionUser({ id: 'u1', email: 'a@example.com' });
    // 清單回空陣列；用 id 抓單筆的回 null（= 找不到），各頁照常畫完。
    win.apiFetch = p => Promise.resolve(/\/api\/[\w-]+\/[\w-]+/.test(p) ? null : []);
});

const activeRoutes = async hash => {
    win.location.hash = hash;
    await tick();
    await tick();
    return [...doc.querySelectorAll('nav [aria-current="page"]')].map(a => a.dataset.route);
};

describe('main navigation', () => {
    // #172 / #164：數據併入設定，第五格就是設定。
    it('lists 記錄、沖煮計劃、新增、店家、設定 in that order', () => {
        const routes = [...doc.querySelectorAll('nav a[data-route]')].map(a => a.dataset.route);
        expect(routes).toEqual(['/records', '/plans', '/new', '/shops', '/me']);
    });

    it.each([
        ['#/records', '/records'],
        ['#/cupping/c1', '/records'],
        ['#/tasting/t1', '/records'],
        ['#/session/s1', '/records'],
        ['#/session/s1/edit', '/records'],
        ['#/plans', '/plans'],
        ['#/plans/builtin-hoffmann-ultimate-v60', '/plans'],
        ['#/plans/new', '/plans'],
        ['#/plans/p1/edit', '/plans'],
        ['#/shops', '/shops'],
        ['#/shops/shop-a', '/shops'],
        ['#/stats', '/me'],
        ['#/new', '/new'],
        ['#/new/tasting', '/new'],
        ['#/me', '/me'],
    ])('%s lights up exactly %s', async (hash, route) => {
        expect(await activeRoutes(hash)).toEqual([route]);
    });

    // 設定已在主導覽，記錄頁右上角不再放第二個入口。
    it('has no extra 設定 link on the records page', async () => {
        await activeRoutes('#/records');
        expect(doc.querySelector('#app a[href="#/me"]')).toBeNull();
    });
});
