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

// formatShopLocation (app.js) — strips a Taiwan postal-code + 縣市 prefix for
// the compact shops-list address line, while leaving overseas / non-matching
// addresses untouched.
describe('formatShopLocation', () => {
    it('strips postal code + 台灣 + 縣市 before a district', () => {
        expect(win.formatShopLocation('105台灣臺北市松山區民有里敦化北路222巷6號1F'))
            .toBe('松山區民有里敦化北路222巷6號1F');
        expect(win.formatShopLocation('106台灣臺北市大安區誠安里復興南路一段122巷6-3號'))
            .toBe('大安區誠安里復興南路一段122巷6-3號');
    });

    it('strips a bare leading postal code even without 台灣', () => {
        expect(win.formatShopLocation('103臺北市大同區建泰里承德路一段77巷25號'))
            .toBe('大同區建泰里承德路一段77巷25號');
    });

    it('leaves overseas addresses untouched', () => {
        expect(win.formatShopLocation('日本名古屋市中村區名駅2丁目42-2'))
            .toBe('日本名古屋市中村區名駅2丁目42-2');
    });

    it('does not strip leading digits from Latin-format addresses', () => {
        expect(win.formatShopLocation('123 Main St, Springfield'))
            .toBe('123 Main St, Springfield');
        expect(win.formatShopLocation('1600 Pennsylvania Ave NW'))
            .toBe('1600 Pennsylvania Ave NW');
    });

    it('does not strip a 市 not followed by a district token', () => {
        expect(win.formatShopLocation('臺北市')).toBe('臺北市');
    });

    it('returns empty string for null / empty input', () => {
        expect(win.formatShopLocation(null)).toBe('');
        expect(win.formatShopLocation('')).toBe('');
        expect(win.formatShopLocation('  ')).toBe('');
    });
});
