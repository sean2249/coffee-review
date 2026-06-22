import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp } from './load-app.js';

let win;

beforeAll(async () => {
    ({ window: win } = await loadApp());
});

// summarizeRecords (app.js) — pure aggregation behind the shop-detail
// 統計摘要 card. These tests lock the contract the card depends on:
// counts, average (null-score excluded), high/low picking, last-date
// preference, and leaf-node flavor tallying.

function cupping(o) {
    return Object.assign({ _type: 'cupping', created_at: '2026-01-01' }, o);
}
function tasting(o) {
    return Object.assign({ _type: 'tasting', created_at: '2026-01-01' }, o);
}

describe('summarizeRecords', () => {
    it('returns a zeroed summary for no records', () => {
        const s = win.summarizeRecords([]);
        expect(s.counts).toEqual({ total: 0, cupping: 0, tasting: 0 });
        expect(s.avgScore).toBeNull();
        expect(s.highest).toBeNull();
        expect(s.lowest).toBeNull();
        expect(s.lastDate).toBeNull();
        expect(s.topFlavors).toEqual([]);
    });

    it('counts cupping vs tasting separately', () => {
        const s = win.summarizeRecords([
            cupping({ id: 'c1' }), cupping({ id: 'c2' }), tasting({ id: 't1' }),
        ]);
        expect(s.counts).toEqual({ total: 3, cupping: 2, tasting: 1 });
    });

    it('averages only numeric coe_total and excludes null/non-number', () => {
        const s = win.summarizeRecords([
            cupping({ id: 'c1', coe_total: 88 }),
            cupping({ id: 'c2', coe_total: 92 }),
            tasting({ id: 't1', coe_total: 80 }),
            tasting({ id: 't2', coe_total: null }),  // excluded
        ]);
        // (88 + 92 + 80) / 3 = 86.666…
        expect(s.avgScore).toBeCloseTo(86.6667, 3);
    });

    it('avgScore is null when no record has a numeric score', () => {
        const s = win.summarizeRecords([
            cupping({ id: 'c1', coe_total: null }),
            tasting({ id: 't1' }),
        ]);
        expect(s.avgScore).toBeNull();
    });

    it('picks highest and lowest by coe_total, ignoring null scores', () => {
        const s = win.summarizeRecords([
            cupping({ id: 'c1', coe_total: 88 }),
            cupping({ id: 'c2', coe_total: 92 }),
            tasting({ id: 't1', coe_total: 80 }),
            tasting({ id: 't2', coe_total: null }),
        ]);
        expect(s.highest).toEqual({ record: expect.objectContaining({ id: 'c2' }), score: 92 });
        expect(s.lowest).toEqual({ record: expect.objectContaining({ id: 't1' }), score: 80 });
    });

    it('uses visit_date for tasting and created_at for cupping when finding the latest date', () => {
        const s = win.summarizeRecords([
            cupping({ id: 'c1', created_at: '2026-05-10' }),
            tasting({ id: 't1', visit_date: '2026-06-15', created_at: '2026-01-01' }),
        ]);
        expect(s.lastDate).toBe('2026-06-15');
    });

    it('falls back to created_at when a tasting has no visit_date', () => {
        const s = win.summarizeRecords([
            tasting({ id: 't1', created_at: '2026-07-20' }),
            cupping({ id: 'c1', created_at: '2026-03-01' }),
        ]);
        expect(s.lastDate).toBe('2026-07-20');
    });

    it('tallies only leaf-node flavors, dropping auto-selected ancestors', () => {
        const s = win.summarizeRecords([
            cupping({
                id: 'c1',
                // 選「檸檬」會連同祖先 水果類/柑橘類 一起存
                evaluations: { flavor: { flavors: [
                    'x__l1-fruit', 'x__l1-fruit__l2-citrus', 'x__l1-fruit__l2-citrus__l3-檸檬',
                ] } },
                observation: { aroma: { flavors: ['y__l1-floral', 'y__l1-floral__l2-茉莉'] } },
            }),
            tasting({
                id: 't1',
                observation: { aroma: { flavors: ['a__l1-fruit__l2-citrus__l3-檸檬'] } },
            }),
        ]);
        // 檸檬 出現 2 次（兩筆的葉節點），茉莉 1 次；水果類/柑橘類/花香類 不計
        expect(s.topFlavors).toEqual([
            { name: '檸檬', color: '#f59f00', count: 2 },
            { name: '茉莉', color: '#d6336c', count: 1 },
        ]);
    });

    it('caps topFlavors at 5 entries ordered by count', () => {
        const leaves = ['檸檬', '橘子', '葡萄柚'];  // citrus L3 leaves
        const records = [];
        // 檸檬×3, 橘子×2, 葡萄柚×1 across distinct records
        const plan = { 檸檬: 3, 橘子: 2, 葡萄柚: 1 };
        let id = 0;
        for (const [leaf, n] of Object.entries(plan)) {
            for (let i = 0; i < n; i++) {
                records.push(cupping({
                    id: 'c' + (id++),
                    evaluations: { flavor: { flavors: [`f__l1-fruit__l2-citrus__l3-${leaf}`] } },
                }));
            }
        }
        const s = win.summarizeRecords(records);
        expect(s.topFlavors.length).toBeLessThanOrEqual(5);
        expect(s.topFlavors.map(f => [f.name, f.count])).toEqual([
            ['檸檬', 3], ['橘子', 2], ['葡萄柚', 1],
        ]);
        expect(leaves).toHaveLength(3); // sanity: all leaves are valid citrus ids
    });

    it('does not throw when a flavors array contains non-string entries', () => {
        // Defends against legacy/imported rows: recordFlavorLeafIds must not
        // call .startsWith on a non-string. Should silently skip them.
        const s = win.summarizeRecords([
            cupping({
                id: 'c1',
                evaluations: { flavor: { flavors: [null, undefined, 42, 'x__l1-fruit__l2-citrus__l3-檸檬'] } },
            }),
        ]);
        expect(s.topFlavors).toEqual([{ name: '檸檬', color: '#f59f00', count: 1 }]);
    });

    it('ignores records with missing evaluations/observation without error', () => {
        const s = win.summarizeRecords([
            cupping({ id: 'c1', coe_total: 85 }),  // no evaluations/observation keys
        ]);
        expect(s.topFlavors).toEqual([]);
        expect(s.avgScore).toBe(85);
    });
});
