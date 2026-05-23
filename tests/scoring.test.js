import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp } from './load-app.js';

let win;

beforeAll(async () => {
    ({ window: win } = await loadApp());
});

// totalScoreTiers (app.js:25) — half-open ranges keyed by min/max in 0.5 steps:
//   trash      74    – 76.5
//   commercial 77    – 79.5
//   common     80    – 82.5   <-- silent fallback for out-of-range input
//   like       83    – 85.5
//   recommend  86    – 88.5
//   amazing    89    – 91.5
//   godly      92    – 96
describe('tierFromScore', () => {
    it('returns trash at the low boundary (74)', () => {
        expect(win.tierFromScore(74).id).toBe('trash');
    });

    it('returns trash at the half-step upper edge (76.5)', () => {
        expect(win.tierFromScore(76.5).id).toBe('trash');
    });

    it('jumps to commercial at 77', () => {
        expect(win.tierFromScore(77).id).toBe('commercial');
    });

    it('returns godly at the bottom of the top tier (92)', () => {
        expect(win.tierFromScore(92).id).toBe('godly');
    });

    it('returns godly at the maximum allowed score (96)', () => {
        expect(win.tierFromScore(96).id).toBe('godly');
    });

    // The 0.5 step leaves gaps like (76.5, 77) and (79.5, 80). Document the
    // current behaviour: any score that falls in a gap silently maps to
    // common. A future tightening (e.g. snap-to-nearest-half) should update
    // these expectations deliberately rather than by accident.
    it('falls back to common for a score inside a gap (76.6)', () => {
        expect(win.tierFromScore(76.6).id).toBe('common');
    });

    it('falls back to common for out-of-range low scores (73)', () => {
        expect(win.tierFromScore(73).id).toBe('common');
    });

    it('falls back to common for out-of-range high scores (96.5)', () => {
        expect(win.tierFromScore(96.5).id).toBe('common');
    });

    it('falls back to common for NaN input', () => {
        expect(win.tierFromScore(NaN).id).toBe('common');
    });
});

describe('tierById', () => {
    it('returns the matching tier', () => {
        expect(win.tierById('godly').medal).toBe('神');
        expect(win.tierById('trash').medal).toBe('劣');
    });

    it('falls back to common for an unknown id', () => {
        expect(win.tierById('not-a-tier').id).toBe('common');
    });

    it('falls back to common for null / undefined', () => {
        expect(win.tierById(null).id).toBe('common');
        expect(win.tierById(undefined).id).toBe('common');
    });
});

describe('scoresInTier', () => {
    it('walks the trash tier in 0.5 increments inclusive of both ends', () => {
        const trash = win.tierById('trash');
        expect(win.scoresInTier(trash)).toEqual([74, 74.5, 75, 75.5, 76, 76.5]);
    });

    it('walks the godly tier (92 — 96) without drifting past the upper bound', () => {
        const godly = win.tierById('godly');
        expect(win.scoresInTier(godly)).toEqual([
            92, 92.5, 93, 93.5, 94, 94.5, 95, 95.5, 96,
        ]);
    });

    it('rounds floating-point accumulation so values stay on .0/.5', () => {
        // 74 + 0.5*n in JS produces drift like 75.00000000000001 around n=2.
        // The implementation guards against this with Math.round(s*10)/10.
        const trash = win.tierById('trash');
        for (const s of win.scoresInTier(trash)) {
            expect(Number((s * 2).toFixed(0)) / 2).toBe(s);
        }
    });
});
