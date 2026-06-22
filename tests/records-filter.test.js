import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// Advanced records-list filtering (app.js): hydrate from hash query, serialize
// back, multi-tier filtering, and the tasting visit_date/created_at date
// fallback. These lock the deep-link + list-narrowing behaviour so future
// changes can't silently drift them.
let win;

beforeEach(async () => {
    ({ window: win } = await loadApp());
});

describe('hydrateFilterFromQuery → syncFilterToHash', () => {
    it('parses every dimension out of the query object', () => {
        win.hydrateFilterFromQuery({
            type: 'cupping', shop: '啡藏', tier: 'recommend,godly',
            from: '2026-06-01', to: '2026-06-30',
        });
        // syncFilterToHash is the observable for the (module-private) state.
        win.syncFilterToHash();
        const hash = decodeURIComponent(win.location.hash);
        expect(hash).toBe('#/records?type=cupping&shop=啡藏&tier=recommend,godly&from=2026-06-01&to=2026-06-30');
    });

    it('defaults missing keys and ignores an invalid type', () => {
        win.hydrateFilterFromQuery({ type: 'bogus' });
        win.syncFilterToHash();
        // type 'bogus' falls back to 'all' (omitted), everything else empty.
        expect(win.location.hash).toBe('#/records');
        expect(win.advancedFilterCount()).toBe(0);
    });

    it('round-trips the empty query to a bare #/records', () => {
        win.hydrateFilterFromQuery({});
        win.syncFilterToHash();
        expect(win.location.hash).toBe('#/records');
    });
});

describe('advancedFilterCount', () => {
    it('counts each selected tier plus the date range as one', () => {
        win.hydrateFilterFromQuery({ tier: 'recommend,amazing,godly', from: '2026-06-01' });
        expect(win.advancedFilterCount()).toBe(4); // 3 tiers + 1 date
    });

    it('counts a from-only date range as one', () => {
        win.hydrateFilterFromQuery({ to: '2026-06-30' });
        expect(win.advancedFilterCount()).toBe(1);
    });
});

describe('applyAdvancedFilters — tiers', () => {
    const rows = [
        { id: 'a', _type: 'cupping', coe_tier_id: 'recommend', created_at: '2026-06-10T00:00:00Z' },
        { id: 'b', _type: 'cupping', coe_tier_id: 'common', created_at: '2026-06-10T00:00:00Z' },
        { id: 'c', _type: 'tasting', coe_tier_id: 'godly', visit_date: '2026-06-10', created_at: '2026-06-11T00:00:00Z' },
    ];

    it('keeps only rows whose tier is in a multi-select', () => {
        win.hydrateFilterFromQuery({ tier: 'recommend,godly' });
        expect(win.applyAdvancedFilters(rows).map(r => r.id)).toEqual(['a', 'c']);
    });

    it('returns all rows when no tier is selected', () => {
        win.hydrateFilterFromQuery({});
        expect(win.applyAdvancedFilters(rows)).toHaveLength(3);
    });
});

describe('recordDateStr — visit_date / created_at fallback', () => {
    it('uses created_at for cupping', () => {
        expect(win.recordDateStr({ _type: 'cupping', created_at: '2026-06-07T09:00:00Z' })).toBe('2026-06-07');
    });

    it('prefers visit_date for tasting', () => {
        expect(win.recordDateStr({ _type: 'tasting', visit_date: '2026-06-03', created_at: '2026-06-09T00:00:00Z' })).toBe('2026-06-03');
    });

    it('falls back to created_at for tasting without visit_date', () => {
        expect(win.recordDateStr({ _type: 'tasting', visit_date: null, created_at: '2026-06-09T12:00:00Z' })).toBe('2026-06-09');
    });
});

describe('applyAdvancedFilters — date range', () => {
    const rows = [
        { id: 'cup', _type: 'cupping', created_at: '2026-06-02T00:00:00Z' },
        { id: 'tasting-visit', _type: 'tasting', visit_date: '2026-06-04', created_at: '2026-06-20T00:00:00Z' },
        { id: 'tasting-fallback', _type: 'tasting', visit_date: null, created_at: '2026-06-25T00:00:00Z' },
    ];

    it('filters tasting on visit_date, not created_at', () => {
        win.hydrateFilterFromQuery({ from: '2026-06-01', to: '2026-06-05' });
        // tasting-visit (visit_date 06-04) is in range even though created_at (06-20) is not.
        expect(win.applyAdvancedFilters(rows).map(r => r.id)).toEqual(['cup', 'tasting-visit']);
    });

    it('falls back to created_at for tasting without visit_date', () => {
        win.hydrateFilterFromQuery({ from: '2026-06-21', to: '2026-06-30' });
        expect(win.applyAdvancedFilters(rows).map(r => r.id)).toEqual(['tasting-fallback']);
    });
});
