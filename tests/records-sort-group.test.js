import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// Records-list sorting / grouping (#21, #91): hash round-trip, missing values
// always last, session cards scored by their best cup, and group ordering.
let win;

beforeEach(async () => {
    ({ window: win } = await loadApp());
    win.eval(`state.shops = [
        { id: 'shop-a', name: '甲咖啡' },
        { id: 'shop-b', name: '乙烘豆' },
    ]; state.shopsLoaded = true;`);
});

const ids = rows => rows.map(r => r.id);

describe('sort / group in the hash query', () => {
    it('round-trips non-default sort and group', () => {
        win.hydrateFilterFromQuery({ sort: 'score-asc', group: 'shop' });
        win.syncFilterToHash();
        expect(win.location.hash).toBe('#/records?sort=score-asc&group=shop');
    });

    it('omits defaults and rejects unknown (incl. prototype) keys', () => {
        win.hydrateFilterFromQuery({ sort: 'toString', group: 'bogus' });
        win.syncFilterToHash();
        expect(win.location.hash).toBe('#/records');
    });

    it('does not count as a filter', () => {
        win.hydrateFilterFromQuery({ sort: 'shop', group: 'bean' });
        expect(win.hasAnyFilter()).toBe(false);
    });
});

describe('sortRecords', () => {
    const rows = [
        { id: 'old', _type: 'cupping', shop_id: 'shop-b', coe_total: 85, created_at: '2026-06-01T00:00:00Z' },
        { id: 'new', _type: 'cupping', shop_id: 'shop-a', coe_total: 80, created_at: '2026-06-05T00:00:00Z' },
        { id: 'unscored', _type: 'cupping', shop_id: null, coe_total: null, created_at: '2026-06-03T00:00:00Z' },
        // 卡片顯示的日期是 visit_date，所以依它排，而不是 created_at。
        { id: 'visit', _type: 'tasting', shop_id: 'shop-a', coe_total: 90, visit_date: '2026-05-20', created_at: '2026-06-10T00:00:00Z' },
    ];

    it('sorts by displayed date, both directions', () => {
        expect(ids(win.sortRecords(rows, 'date-desc'))).toEqual(['new', 'unscored', 'old', 'visit']);
        expect(ids(win.sortRecords(rows, 'date-asc'))).toEqual(['visit', 'old', 'unscored', 'new']);
    });

    it('keeps unscored rows last in both score directions', () => {
        expect(ids(win.sortRecords(rows, 'score-desc'))).toEqual(['visit', 'old', 'new', 'unscored']);
        expect(ids(win.sortRecords(rows, 'score-asc'))).toEqual(['new', 'old', 'visit', 'unscored']);
    });

    it('sorts by shop name (zh-Hant: 乙 before 甲), ties by date, shopless last', () => {
        expect(ids(win.sortRecords(rows, 'shop'))).toEqual(['old', 'new', 'visit', 'unscored']);
    });

    it('scores a session by its best cup', () => {
        const session = {
            id: 's', _type: 'session', created_at: '2026-06-02T00:00:00Z',
            cups: [{ code: 'A', coe_total: 84 }, { code: 'B', coe_total: 88 }],
        };
        expect(ids(win.sortRecords([rows[0], session], 'score-desc'))).toEqual(['s', 'old']);
    });
});

describe('groupRecords', () => {
    const rows = [
        { id: 'a1', _type: 'cupping', shop_id: 'shop-a', bean_type: 'single', coe_total: 80, created_at: '2026-06-01T00:00:00Z' },
        { id: 'a2', _type: 'cupping', shop_id: 'shop-a', bean_type: 'blend', coe_total: 84, created_at: '2026-06-04T00:00:00Z' },
        { id: 'b1', _type: 'tasting', shop_id: 'shop-b', bean_type: 'single', coe_total: 90, created_at: '2026-06-02T00:00:00Z' },
        { id: 'n1', _type: 'cupping', shop_id: null, bean_type: null, coe_total: 95, created_at: '2026-06-09T00:00:00Z' },
    ];

    it('groups by shop with count and average, missing shop last', () => {
        const groups = win.groupRecords(rows, 'shop', 'date-desc');
        expect(groups.map(g => g.label)).toEqual(['甲咖啡', '乙烘豆', '未指定店家']);
        expect(ids(groups[0].rows)).toEqual(['a2', 'a1']);
        expect(groups[0].avgScore).toBe(82);
    });

    it('orders groups by average score', () => {
        expect(win.groupRecords(rows, 'shop', 'score-asc').map(g => g.key)).toEqual(['shop-a', 'shop-b', '']);
        expect(win.groupRecords(rows, 'shop', 'score-desc').map(g => g.key)).toEqual(['shop-b', 'shop-a', '']);
    });

    it('groups by bean type', () => {
        const groups = win.groupRecords(rows, 'bean', 'date-desc');
        expect(groups.map(g => g.label)).toEqual(['配方豆', '單品', '未填豆子類型']);
        expect(ids(groups[1].rows)).toEqual(['b1', 'a1']);
    });
});

describe('records list view — sort / group re-render', () => {
    const records = [
        { id: 'lo', _type: 'cupping', shop_id: 'shop-a', coe_total: 80, created_at: '2026-06-05T00:00:00Z' },
        { id: 'hi', _type: 'cupping', shop_id: 'shop-b', coe_total: 90, created_at: '2026-06-01T00:00:00Z' },
        { id: 'empty', _type: 'session', title: '空場次', cups: [], created_at: '2026-06-03T00:00:00Z' },
    ];
    let root, recordFetches;

    beforeEach(async () => {
        recordFetches = 0;
        win.apiFetch = (path) => {
            if (path.startsWith('/api/shops')) return Promise.resolve([{ id: 'shop-a', name: '甲咖啡' }, { id: 'shop-b', name: '乙烘豆' }]);
            if (path.startsWith('/api/records')) { recordFetches += 1; return Promise.resolve(records); }
            throw new Error(`unexpected apiFetch: ${path}`);
        };
        win.setSessionUser({ id: 'u1' });
        // 掛在 #app 外面：app.js 的首次 renderRoute 會清掉 #app 的內容。
        root = win.document.createElement('div');
        win.document.body.appendChild(root);
        await win.viewRecordsList(root, {});
    });

    const change = (id, value) => {
        const el = win.document.getElementById(id);
        el.value = value;
        el.dispatchEvent(new win.Event('change'));
    };
    const hrefs = () => [...root.querySelectorAll('.record-card')].map(a => a.getAttribute('href'));

    it('re-sorts from the cached rows without refetching', () => {
        expect(hrefs()).toEqual(['#/cupping/lo', '#/session/empty', '#/cupping/hi']);
        change('list-sort', 'score-desc');
        expect(hrefs()).toEqual(['#/cupping/hi', '#/cupping/lo', '#/session/empty']);
        expect(recordFetches).toBe(1);
        expect(win.location.hash).toBe('#/records?sort=score-desc');
    });

    it('keeps a session with no cups when grouping', () => {
        change('list-group', 'shop');
        const titles = [...root.querySelectorAll('.records-group-title')].map(e => e.textContent);
        expect(titles).toEqual(['甲咖啡', '乙烘豆', '未指定店家']);
        expect(hrefs()).toContain('#/session/empty');
        expect(recordFetches).toBe(1);
    });
});
