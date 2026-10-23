import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// 個人數據頁（#/stats，issue #129）。鎖住計數規則：記錄數算杯測「場次」、
// 杯數另計；平均分與店家以每一杯為單位；未評分不拉低平均；店家只算自己記錄過的。

// 底部 tabbar 的兩顆就夠驗「#/stats 亮個人」。
const BODY = `<main id="app"></main><nav>
    <a class="tabbar-btn" data-route="/records" href="#/records"></a>
    <a class="tabbar-btn" data-route="/me" href="#/me"></a>
</nav>`;

let win, doc;
beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp({ bodyHtml: BODY }));
});

const tick = () => new Promise(r => setTimeout(r, 0));

function cupping(o) { return { _type: 'cupping', shop_id: null, coe_total: null, ...o }; }
function tasting(o) { return { _type: 'tasting', shop_id: null, coe_total: null, ...o }; }
function session(id, cups) {
    return { _type: 'session', id, title: id, cups: cups.map((c, i) => ({ id: `${id}-${i}`, shop_id: null, coe_total: null, ...c })) };
}

describe('summarizePersonalStats', () => {
    it('is all zeros with a null average for no records', () => {
        expect(win.summarizePersonalStats([])).toEqual({
            shopCount: 0, cupping: 0, tasting: 0, sessions: 0, sessionCups: 0, total: 0, avgScore: null,
        });
    });

    it('counts sessions as records and cups separately', () => {
        const s = win.summarizePersonalStats([
            cupping({ id: 'c1' }), cupping({ id: 'c2' }), tasting({ id: 't1' }),
            session('s1', [{}, {}, {}]), session('s2', [{}, {}]),
        ]);
        expect(s.cupping).toBe(2);
        expect(s.tasting).toBe(1);
        expect(s.sessions).toBe(2);
        expect(s.sessionCups).toBe(5);
        expect(s.total).toBe(5);
    });

    it('counts a session with no cups as one record and zero cups', () => {
        const s = win.summarizePersonalStats([session('s1', [])]);
        expect(s.sessions).toBe(1);
        expect(s.sessionCups).toBe(0);
        expect(s.total).toBe(1);
    });

    it('averages every scored record and cup, ignoring unscored ones', () => {
        const s = win.summarizePersonalStats([
            cupping({ id: 'c1', coe_total: 86 }),
            tasting({ id: 't1', coe_total: 84 }),
            tasting({ id: 't2' }),
            session('s1', [{ coe_total: 88 }, { coe_total: 82 }, {}]),
        ]);
        expect(s.avgScore).toBe(85);
    });

    it('has a null average when nothing is scored', () => {
        const s = win.summarizePersonalStats([cupping({ id: 'c1' }), session('s1', [{}])]);
        expect(s.avgScore).toBeNull();
    });

    it('counts each shop once across types and skips records without a shop', () => {
        const s = win.summarizePersonalStats([
            cupping({ id: 'c1', shop_id: 'A' }),
            tasting({ id: 't1', shop_id: 'A' }),
            tasting({ id: 't2' }),
            session('s1', [{ shop_id: 'A' }, { shop_id: 'B' }, {}]),
        ]);
        expect(s.shopCount).toBe(2);
    });
});

describe('statsMarkup', () => {
    const base = { shopCount: 2, cupping: 1, tasting: 1, sessions: 1, sessionCups: 3, total: 3, avgScore: 85.25 };

    it('shows every row with the average at one decimal', () => {
        const html = win.statsMarkup(base);
        expect(html).toContain('記錄過的店家');
        expect(html).toContain('已完成記錄');
        expect(html).toContain('場 · 3 杯');
        expect(html).toContain('85.3');
        expect(html).toContain('href="#/me"');
        expect(html).not.toContain('href="#/new"');
    });

    it('shows — when there is no score', () => {
        expect(win.statsMarkup({ ...base, avgScore: null })).toContain('—');
    });

    it('offers to add the first record when there are none', () => {
        const html = win.statsMarkup({ ...base, shopCount: 0, cupping: 0, tasting: 0, sessions: 0, sessionCups: 0, total: 0, avgScore: null });
        expect(html).toContain('href="#/new"');
        expect(html).toContain('新增第一筆記錄');
    });
});

describe('#/stats route', () => {
    it('shows the sign-in prompt and fetches nothing while signed out', async () => {
        win.setSessionUser(null);
        let called = false;
        win.apiFetch = () => { called = true; return Promise.resolve([]); };
        win.location.hash = '#/stats';
        await tick();
        expect(doc.getElementById('app').innerHTML).toContain('請先登入');
        expect(called).toBe(false);
    });

    it('fetches records and shops once and renders the stats when signed in', async () => {
        win.setSessionUser({ id: 'u1', email: 'a@b.com' });
        const paths = [];
        win.apiFetch = (path) => {
            paths.push(path);
            if (path === '/api/shops') return Promise.resolve([]);
            return Promise.resolve([cupping({ id: 'c1', shop_id: 'A', coe_total: 86 })]);
        };
        win.location.hash = '#/stats';
        await tick();
        await tick();
        expect(paths).toEqual(['/api/records?type=all', '/api/shops']);
        const html = doc.getElementById('app').innerHTML;
        expect(html).toContain('我的數據');
        expect(html).toContain('86.0');
        const active = doc.querySelector('.tabbar-btn[aria-current="page"]');
        expect(active?.dataset.route).toBe('/me');
    });

    it('shows an error with a reload button when the fetch fails', async () => {
        win.setSessionUser({ id: 'u1' });
        win.apiFetch = () => Promise.reject(new Error('boom'));
        const realError = win.console.error;
        win.console.error = () => {};
        win.location.hash = '#/stats';
        await tick();
        await tick();
        win.console.error = realError;
        const html = doc.getElementById('app').innerHTML;
        expect(html).toContain('讀取失敗');
        expect(html).not.toContain('記錄過的店家');
        expect(doc.getElementById('stats-retry')).not.toBe(null);
    });

    it('does not overwrite the next page when the response arrives after leaving', async () => {
        win.setSessionUser({ id: 'u1' });
        let resolve;
        win.apiFetch = (path) => path === '/api/shops'
            ? Promise.resolve([])
            : new Promise(r => { resolve = r; });
        win.location.hash = '#/stats';
        await tick();
        win.location.hash = '#/me';
        await tick();
        resolve([{ _type: 'cupping', id: 'c1', coe_total: 86 }]);
        await tick();
        const html = doc.getElementById('app').innerHTML;
        expect(html).toContain('account-card');
        expect(html).not.toContain('記錄過的店家');
        expect(html).not.toContain('stats-charts');
    });
});
