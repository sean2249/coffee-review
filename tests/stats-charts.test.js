import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// 個人數據頁的分頁卡（issue #23）：分數分布、每月平均、店家排行。
// 單位是杯（杯測每一杯各算一筆）；沒有 CoE 總分的不進分布、趨勢與平均分。

const BODY = `<main id="app"></main><nav>
    <a class="tabbar-btn" data-route="/records" href="#/records"></a>
    <a class="tabbar-btn" data-route="/me" href="#/me"></a>
</nav>`;

let win, doc;
beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp({ bodyHtml: BODY }));
});

const tick = () => new Promise(r => setTimeout(r, 0));

function cupping(o) { return { _type: 'cupping', shop_id: null, coe_total: null, created_at: '2026-10-01T00:00:00Z', ...o }; }
function tasting(o) { return { _type: 'tasting', shop_id: null, coe_total: null, created_at: '2026-10-01T00:00:00Z', ...o }; }
function session(id, cups, o = {}) {
    return {
        _type: 'session', id, title: id, created_at: '2026-10-01T00:00:00Z', ...o,
        cups: cups.map((c, i) => ({ id: `${id}-${i}`, shop_id: null, coe_total: null, ...c })),
    };
}
const flat = records => win.flattenSessionCups(records);

describe('scoreDistribution', () => {
    it('lists all 7 tiers in order, including empty ones', () => {
        const d = win.scoreDistribution([]);
        expect(d.map(x => x.tier.medal)).toEqual(['劣', '凡', '銅', '銀', '金', '鉑', '神']);
        expect(d.every(x => x.count === 0)).toBe(true);
    });

    it('counts each session cup and skips unscored records', () => {
        const d = win.scoreDistribution(flat([
            cupping({ id: 'c1', coe_total: 84 }),
            tasting({ id: 't1' }),
            session('s1', [{ coe_total: 84 }, { coe_total: 87 }, {}]),
        ]));
        const byMedal = Object.fromEntries(d.map(x => [x.tier.medal, x.count]));
        expect(byMedal['銀']).toBe(2);
        expect(byMedal['金']).toBe(1);
        expect(d.reduce((n, x) => n + x.count, 0)).toBe(3);
    });

    it('puts boundary scores in the right tier', () => {
        const d = win.scoreDistribution(flat([
            cupping({ id: 'a', coe_total: 76.5 }),
            cupping({ id: 'b', coe_total: 77 }),
            cupping({ id: 'c', coe_total: 92 }),
        ]));
        const byMedal = Object.fromEntries(d.map(x => [x.tier.medal, x.count]));
        expect(byMedal['劣']).toBe(1);
        expect(byMedal['凡']).toBe(1);
        expect(byMedal['神']).toBe(1);
    });
});

describe('monthlyAverages', () => {
    const now = () => new win.Date(2026, 9, 15);

    it('returns the last 12 calendar months ending with the current one', () => {
        const m = win.monthlyAverages([], now());
        expect(m).toHaveLength(12);
        expect(m[0]).toEqual({ month: '2025-11', label: '11月', avg: null });
        expect(m[11]).toEqual({ month: '2026-10', label: '10月', avg: null });
    });

    it('groups by each type\'s own date field and averages scored rows only', () => {
        const m = win.monthlyAverages(flat([
            cupping({ id: 'c1', coe_total: 84, created_at: '2026-08-03T10:00:00Z' }),
            tasting({ id: 't1', coe_total: 88, visit_date: '2026-08-20', created_at: '2026-10-01T00:00:00Z' }),
            tasting({ id: 't2', visit_date: '2026-08-21' }),
            session('s1', [{ coe_total: 86 }, { coe_total: 90 }, {}], { session_date: '2026-09-05' }),
        ]), now());
        const byMonth = Object.fromEntries(m.map(x => [x.month, x.avg]));
        expect(byMonth['2026-08']).toBe(86);
        expect(byMonth['2026-09']).toBe(88);
        expect(byMonth['2026-10']).toBeNull();
    });

    // 時區固定成 UTC+8：在 UTC 的 CI 上，直接切字串和換成本地月份會得到同一個答案，測不出差別。
    it('puts a created_at timestamp in the device-local month', () => {
        const realTz = process.env.TZ;
        process.env.TZ = 'Asia/Taipei';
        try {
            const m = win.monthlyAverages(flat([
                cupping({ id: 'c1', coe_total: 85, created_at: '2026-09-30T23:30:00Z' }),
            ]), now());
            expect(m.filter(x => x.avg !== null).map(x => x.month)).toEqual(['2026-10']);
        } finally {
            if (realTz === undefined) delete process.env.TZ;
            else process.env.TZ = realTz;
        }
    });

    it('ignores records older than 12 months', () => {
        const m = win.monthlyAverages(flat([
            tasting({ id: 't1', coe_total: 88, visit_date: '2025-10-31' }),
        ]), now());
        expect(m.every(x => x.avg === null)).toBe(true);
    });
});

describe('rankShops', () => {
    // A: 2 筆、平均 86；B: 3 筆、平均 86；C: 4 筆、平均 84；D: 4 筆、沒評分；E: 1 筆、平均 90
    const records = () => flat([
        cupping({ id: 'a1', shop_id: 'A', coe_total: 86 }),
        tasting({ id: 'a2', shop_id: 'A', coe_total: 86 }),
        tasting({ id: 'b1', shop_id: 'B', coe_total: 86 }),
        session('sb', [{ shop_id: 'B', coe_total: 86 }, { shop_id: 'B', coe_total: 86 }]),
        session('sc', [{ shop_id: 'C', coe_total: 84 }, { shop_id: 'C', coe_total: 84 }, { shop_id: 'C', coe_total: 84 }, { shop_id: 'C' }]),
        tasting({ id: 'd1', shop_id: 'D' }), tasting({ id: 'd2', shop_id: 'D' }),
        tasting({ id: 'd3', shop_id: 'D' }), tasting({ id: 'd4', shop_id: 'D' }),
        tasting({ id: 'e1', shop_id: 'E', coe_total: 90 }),
        tasting({ id: 'n1', coe_total: 95 }),
    ]);

    it('avg mode: higher average first, more records breaks ties, unscored shops left out', () => {
        const r = win.rankShops(records(), 'avg');
        expect(r.map(x => x.shopId)).toEqual(['E', 'B', 'A', 'C']);
        expect(r[1]).toEqual({ shopId: 'B', avgScore: 86, total: 3 });
    });

    it('count mode: more records first, higher average breaks ties, unscored last', () => {
        const r = win.rankShops(records(), 'count');
        expect(r.map(x => x.shopId)).toEqual(['C', 'D', 'B', 'A', 'E']);
    });

    it('keeps at most 5 shops', () => {
        const many = flat(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((s, i) => tasting({ id: s, shop_id: s, coe_total: 80 + i })));
        expect(win.rankShops(many, 'avg')).toHaveLength(5);
        expect(win.rankShops(many, 'count')).toHaveLength(5);
        expect(win.rankShops(many, 'avg')[0].shopId).toBe('G');
    });

    it('matches the shops list card numbers', () => {
        const stats = win.aggregateShopStats(records());
        for (const r of win.rankShops(records(), 'count')) {
            expect(r.total).toBe(stats.get(r.shopId).total);
            expect(r.avgScore).toBe(stats.get(r.shopId).avgScore);
        }
    });
});

describe('#/stats charts card', () => {
    const thisMonth = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-10`;
    };
    const SHOPS = [{ id: 'A', name: '森高砂咖啡館' }, { id: 'B', name: '<b>鳥窩</b>' }];

    async function open(records, { shops = SHOPS } = {}) {
        win.setSessionUser({ id: 'u1' });
        const paths = [];
        win.apiFetch = (path) => {
            paths.push(path);
            return Promise.resolve(path === '/api/shops' ? shops : records);
        };
        win.location.hash = '#/stats';
        await tick();
        await tick();
        return paths;
    }
    const card = () => doc.querySelector('.stats-charts');
    const panel = () => doc.querySelector('.stats-panel').textContent;
    const click = sel => doc.querySelector(sel).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const selectedTab = () => doc.querySelector('.stats-tab[aria-selected="true"]').textContent;

    const sample = () => [
        tasting({ id: 't1', shop_id: 'A', coe_total: 88, visit_date: thisMonth() }),
        tasting({ id: 't2', shop_id: 'B', coe_total: 84, visit_date: thisMonth() }),
        tasting({ id: 't3', shop_id: 'B', coe_total: 84, visit_date: thisMonth() }),
    ];

    it('shows three tabs below the list card, starting on 分數分布', async () => {
        await open(sample());
        expect(card()).not.toBe(null);
        expect([...doc.querySelectorAll('[role="tab"]')].map(t => t.textContent)).toEqual(['分數分布', '每月平均', '店家排行']);
        expect(selectedTab()).toBe('分數分布');
        expect(doc.querySelectorAll('.stats-dist-row')).toHaveLength(7);
        expect(panel()).toContain('杯測場次以每一杯計；未評分的不算');
        expect([...doc.querySelectorAll('.stats-tab, .stats-toggle-btn')].every(b => b.type === 'button')).toBe(true);
    });

    it('switches tabs and ranking mode without refetching, and keeps the mode across tabs', async () => {
        const paths = await open(sample());
        click('[data-stats-tab="trend"]');
        expect(selectedTab()).toBe('每月平均');
        expect(doc.querySelector('svg.stats-trend')).not.toBe(null);
        expect(panel()).toContain('空白的月份 = 那個月沒有評分記錄');

        click('[data-stats-tab="rank"]');
        expect(panel()).toContain('前 5 家 · 點店名看店家頁');
        const names = () => [...doc.querySelectorAll('.stats-rank-name')].map(n => n.textContent);
        expect(names()).toEqual(['森高砂咖啡館', '<b>鳥窩</b>']);
        expect(doc.querySelector('[data-stats-mode="avg"]').getAttribute('aria-pressed')).toBe('true');

        click('[data-stats-mode="count"]');
        expect(names()).toEqual(['<b>鳥窩</b>', '森高砂咖啡館']);
        expect(doc.querySelector('.stats-rank-main').textContent).toBe('2 筆');

        click('[data-stats-tab="dist"]');
        click('[data-stats-tab="rank"]');
        expect(doc.querySelector('[data-stats-mode="count"]').getAttribute('aria-pressed')).toBe('true');
        expect(paths).toEqual(['/api/records?type=all', '/api/shops']);
    });

    it('links tabs to the panel and moves between tabs with the arrow keys', async () => {
        await open(sample());
        const key = k => doc.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true }));
        const tabindex = () => [...doc.querySelectorAll('[role="tab"]')].map(t => t.getAttribute('tabindex'));
        expect(tabindex()).toEqual(['0', '-1', '-1']);
        expect(doc.querySelector('[role="tab"]').getAttribute('aria-controls')).toBe(doc.querySelector('[role="tabpanel"]').id);
        doc.querySelector('[data-stats-tab="dist"]').focus();
        key('ArrowRight');
        expect(selectedTab()).toBe('每月平均');
        expect(doc.activeElement.dataset.statsTab).toBe('trend');
        key('ArrowLeft');
        key('ArrowLeft');
        expect(selectedTab()).toBe('店家排行');
        key('Home');
        expect(selectedTab()).toBe('分數分布');
        doc.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
        expect(selectedTab()).toBe('分數分布');
        expect(tabindex()).toEqual(['0', '-1', '-1']);
    });

    it('links each ranking row to its shop page', async () => {
        await open(sample());
        click('[data-stats-tab="rank"]');
        expect([...doc.querySelectorAll('.stats-rank-row')].map(a => a.getAttribute('href'))).toEqual(['#/shops/A', '#/shops/B']);
    });

    it('starts over on 分數分布 / 平均分 after leaving and coming back', async () => {
        await open(sample());
        click('[data-stats-tab="rank"]');
        click('[data-stats-mode="count"]');
        win.location.hash = '#/me';
        await tick();
        win.location.hash = '#/stats';
        await tick();
        await tick();
        expect(selectedTab()).toBe('分數分布');
        click('[data-stats-tab="rank"]');
        expect(doc.querySelector('[data-stats-mode="avg"]').getAttribute('aria-pressed')).toBe('true');
    });

    it('has no charts card when there are no records', async () => {
        await open([]);
        expect(card()).toBe(null);
        expect(doc.getElementById('app').textContent).toContain('還沒有任何記錄');
    });

    it('shows the empty states when nothing is scored', async () => {
        await open([tasting({ id: 't1', shop_id: 'A' })]);
        expect(panel()).toContain('還沒有評分過的記錄');
        click('[data-stats-tab="trend"]');
        expect(panel()).toContain('最近 12 個月沒有評分記錄');
        expect(doc.querySelector('svg.stats-trend')).toBe(null);
        click('[data-stats-tab="rank"]');
        expect(panel()).toContain('還沒有評分過的店家記錄');
        click('[data-stats-mode="count"]');
        expect(doc.querySelectorAll('.stats-rank-row')).toHaveLength(1);
    });

    it('says no shops yet, without the toggle, when no record has a shop', async () => {
        await open([tasting({ id: 't1', coe_total: 85 })]);
        click('[data-stats-tab="rank"]');
        expect(panel()).toContain('還沒有記錄過店家');
        expect(doc.querySelector('.stats-toggle')).toBe(null);
    });

    it('still ranks shops when the shops list fails to load', async () => {
        win.setSessionUser({ id: 'u1' });
        win.apiFetch = (path) => path === '/api/shops' ? Promise.reject(new Error('boom')) : Promise.resolve(sample());
        const realWarn = win.console.warn;
        win.console.warn = () => {};
        win.location.hash = '#/stats';
        await tick();
        await tick();
        win.console.warn = realWarn;
        click('[data-stats-tab="rank"]');
        expect(doc.querySelectorAll('.stats-rank-row')).toHaveLength(2);
    });
});
