import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp } from './load-app.js';

// aggregateShopStats (app.js) — pure aggregation backing the shops list cards
// (issue #55). Groups records by shop_id into per-shop { cupping, tasting,
// total, avgScore }. The average MERGES cupping + tasting and only counts
// records whose coe_total is numeric (matching summarizeRecords). Shops with
// records but no numeric scores get avgScore = null.

let win;

beforeAll(async () => {
    ({ window: win } = await loadApp());
});

const rec = (shop_id, _type, coe_total) => ({ shop_id, _type, coe_total });

describe('aggregateShopStats', () => {
    it('returns an empty Map for no records', () => {
        const m = win.aggregateShopStats([]);
        expect(typeof m.get).toBe('function'); // Map (cross-realm: instanceof unreliable)
        expect(m.size).toBe(0);
    });

    it('counts cupping and tasting separately per shop', () => {
        const m = win.aggregateShopStats([
            rec('a', 'cupping', 85),
            rec('a', 'cupping', 87),
            rec('a', 'tasting', 80),
            rec('b', 'tasting', 90),
        ]);
        expect(m.get('a')).toMatchObject({ cupping: 2, tasting: 1, total: 3 });
        expect(m.get('b')).toMatchObject({ cupping: 0, tasting: 1, total: 1 });
    });

    it('averages coe_total merged across cupping + tasting', () => {
        const m = win.aggregateShopStats([
            rec('a', 'cupping', 86),
            rec('a', 'tasting', 84),
        ]);
        expect(m.get('a').avgScore).toBe(85);
    });

    it('excludes non-numeric coe_total from the average but still counts the record', () => {
        const m = win.aggregateShopStats([
            rec('a', 'cupping', 88),
            rec('a', 'cupping', null),
            rec('a', 'tasting', undefined),
        ]);
        expect(m.get('a').total).toBe(3);
        expect(m.get('a').avgScore).toBe(88);
    });

    it('sets avgScore null when a shop has records but none are scored', () => {
        const m = win.aggregateShopStats([rec('a', 'tasting', null)]);
        expect(m.get('a').total).toBe(1);
        expect(m.get('a').avgScore).toBeNull();
    });

    it('ignores records with no shop_id', () => {
        const m = win.aggregateShopStats([rec(null, 'cupping', 90), rec('a', 'cupping', 80)]);
        expect(m.size).toBe(1);
        expect(m.has('a')).toBe(true);
    });
});
