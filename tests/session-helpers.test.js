import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp } from './load-app.js';

// 杯測場次（session）的純函式：編號產生、驗證、排名、店家頁攤平、日期與連結。
let win;

beforeAll(async () => {
    ({ window: win } = await loadApp());
});

describe('nextCupCode', () => {
    it('手動模式永遠回空字串', () => {
        expect(win.nextCupCode('manual', [])).toBe('');
        expect(win.nextCupCode('manual', ['A', '1'])).toBe('');
    });

    it('數字：接在現有最大的數字後面，忽略非數字編號', () => {
        expect(win.nextCupCode('number', [])).toBe('1');
        expect(win.nextCupCode('number', ['1', '3'])).toBe('4');
        expect(win.nextCupCode('number', ['A', '#317', ''])).toBe('1');
        expect(win.nextCupCode('number', [' 2 '])).toBe('3');
    });

    it('字母：A…Z 之後接 AA、AB…，小寫也算', () => {
        expect(win.nextCupCode('letter', [])).toBe('A');
        expect(win.nextCupCode('letter', ['A', 'b'])).toBe('C');
        expect(win.nextCupCode('letter', ['Z'])).toBe('AA');
        expect(win.nextCupCode('letter', ['AZ'])).toBe('BA');
        expect(win.nextCupCode('letter', ['A', '1', '#9'])).toBe('B');
    });

    it('刪掉中間的杯不回填（實體杯上的標籤不會變）', () => {
        expect(win.nextCupCode('letter', ['A', 'C'])).toBe('D');
        expect(win.nextCupCode('number', ['1', '3'])).toBe('4');
    });
});

describe('fillBlankCupCodes', () => {
    it('只補空白的編號，不覆蓋已填的', () => {
        expect(win.fillBlankCupCodes('letter', ['', '#9', ' ', ''])).toEqual(['A', '#9', 'B', 'C']);
        // 已填的字母也算進「最大值」：接在 X 後面
        expect(win.fillBlankCupCodes('letter', ['', 'X'])).toEqual(['Y', 'X']);
        expect(win.fillBlankCupCodes('number', ['5', ''])).toEqual(['5', '6']);
    });

    it('手動模式不動任何編號', () => {
        expect(win.fillBlankCupCodes('manual', ['', 'A'])).toEqual(['', 'A']);
    });
});

describe('findCupCodeProblem', () => {
    it('全部有編號且不重複時回傳 null', () => {
        expect(win.findCupCodeProblem([{ code: 'A' }, { code: 'B' }, { code: '1' }])).toBeNull();
    });

    it('抓到空白編號，指出第幾杯', () => {
        expect(win.findCupCodeProblem([{ code: 'A' }, { code: '  ' }])).toEqual({
            index: 1, message: '第 2 杯還沒有編號',
        });
    });

    it('重複編號忽略大小寫與前後空白', () => {
        expect(win.findCupCodeProblem([{ code: 'a' }, { code: ' A ' }])).toEqual({
            index: 1, message: '編號「A」重複了',
        });
    });
});

describe('rankCups / bestSessionCup', () => {
    const cups = [
        { code: 'A', coe_total: 85 },
        { code: 'B', coe_total: null },
        { code: 'C', coe_total: 88 },
        { code: 'D', coe_total: 85 },
        { code: 'E', coe_total: '90' }, // 非數字 = 未評分
    ];

    it('有分數的由高到低、同分同名次；未評分排最後且沒有名次', () => {
        const ranked = win.rankCups(cups);
        expect(ranked.map(r => [r.cup.code, r.rank, r.index])).toEqual([
            ['C', 1, 2],
            ['A', 2, 0],
            ['D', 2, 3],
            ['B', null, 1],
            ['E', null, 4],
        ]);
    });

    it('最佳杯是第一名；全部未評分時是 null', () => {
        expect(win.bestSessionCup(cups).code).toBe('C');
        expect(win.bestSessionCup([{ code: 'A', coe_total: null }])).toBeNull();
        expect(win.bestSessionCup([])).toBeNull();
        expect(win.bestSessionCup(undefined)).toBeNull();
    });

    it('formatCupScore：有分數顯示一位小數，否則「—」', () => {
        expect(win.formatCupScore({ coe_total: 86 })).toBe('86.0');
        expect(win.formatCupScore({ coe_total: null })).toBe('—');
    });
});

describe('flattenSessionCups', () => {
    it('場次攤成單杯列，其他類型原樣保留', () => {
        const cupping = { _type: 'cupping', id: 'c1', shop_id: 'x' };
        const session = {
            _type: 'session', id: 's1', title: '日曬比較', session_date: '2026-09-01',
            created_at: '2026-09-02T00:00:00Z',
            cups: [{ id: 'k1', code: 'A', shop_id: 'x', coe_total: 88 }],
        };
        const out = win.flattenSessionCups([cupping, session]);
        expect(out).toHaveLength(2);
        expect(out[0]).toBe(cupping);
        expect(out[1]).toEqual({
            id: 'k1', code: 'A', shop_id: 'x', coe_total: 88,
            _type: 'session_cup', session_id: 's1', session_title: '日曬比較',
            session_date: '2026-09-01', created_at: '2026-09-02T00:00:00Z',
        });
    });
});

describe('recordDateIso / recordHref', () => {
    it('依類型取日期，缺漏時 fallback created_at', () => {
        const created = '2026-06-09T00:00:00Z';
        expect(win.recordDateIso({ _type: 'cupping', created_at: created })).toBe(created);
        expect(win.recordDateIso({ _type: 'tasting', visit_date: '2026-06-01', created_at: created })).toBe('2026-06-01');
        expect(win.recordDateIso({ _type: 'session', session_date: '2026-06-02', created_at: created })).toBe('2026-06-02');
        expect(win.recordDateIso({ _type: 'session_cup', session_date: null, created_at: created })).toBe(created);
    });

    it('單杯連回所屬場次，其他類型連到自己', () => {
        expect(win.recordHref({ _type: 'session_cup', id: 'k1', session_id: 's1' })).toBe('#/session/s1');
        expect(win.recordHref({ _type: 'session', id: 's1' })).toBe('#/session/s1');
        expect(win.recordHref({ _type: 'cupping', id: 'c1' })).toBe('#/cupping/c1');
    });
});
