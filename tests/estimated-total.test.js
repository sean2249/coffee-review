import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp } from './load-app.js';

let win;

beforeAll(async () => {
    ({ window: win } = await loadApp());
});

// computeEstimatedTotalFromRecord (app.js:927)
//
// CRITICAL invariant from CLAUDE.md: `coe_total` is user-entered, NOT the sum
// of reference scores. This function computes a *separate* estimate
// (36 + sum of 8 reference scores, missing keys default to 5) for display
// only. These tests lock the estimate's exact formula so a future edit
// can't quietly conflate it with coe_total.

const ALL_KEYS = ['flavor', 'acidity', 'sweetness', 'mouthfeel',
    'aftertaste', 'cleanness', 'balance', 'overall'];

function recordWithScores(scoresByKey) {
    const evaluations = {};
    for (const [k, score] of Object.entries(scoresByKey)) {
        evaluations[k] = { score };
    }
    return { evaluations };
}

describe('computeEstimatedTotalFromRecord', () => {
    it('returns null when evaluations are missing entirely', () => {
        expect(win.computeEstimatedTotalFromRecord({})).toBeNull();
        expect(win.computeEstimatedTotalFromRecord({ evaluations: null })).toBeNull();
    });

    it('returns null when no reference field has a numeric score', () => {
        // Empty evaluations: every field is missing, defaults to 5, but
        // `any` stays false → null. Treat as "user hasn't started scoring".
        expect(win.computeEstimatedTotalFromRecord({ evaluations: {} })).toBeNull();
    });

    it('returns null when a score is present but not a number', () => {
        // Documents the behaviour: non-numeric scores are treated as missing,
        // so a record where every "score" is a string still returns null.
        const r = recordWithScores({ flavor: '8', acidity: null });
        expect(win.computeEstimatedTotalFromRecord(r)).toBeNull();
    });

    it('treats a single numeric score as anchor and defaults the rest to 5', () => {
        // 36 + 7 + 5*7 = 78
        expect(win.computeEstimatedTotalFromRecord(recordWithScores({ flavor: 7 })))
            .toBe(78);
    });

    it('sums multiple numeric scores and 5-defaults the missing ones', () => {
        // 36 + (8 + 7) + 5*6 = 81
        const r = recordWithScores({ flavor: 8, acidity: 7 });
        expect(win.computeEstimatedTotalFromRecord(r)).toBe(81);
    });

    it('returns 76 when every reference field is the default 5', () => {
        // 36 + 5*8 = 76
        const r = recordWithScores(Object.fromEntries(ALL_KEYS.map(k => [k, 5])));
        expect(win.computeEstimatedTotalFromRecord(r)).toBe(76);
    });

    it('returns 100 when every reference field is the maximum 8', () => {
        // 36 + 8*8 = 100 — sanity check the upper bound matches CoE math
        const r = recordWithScores(Object.fromEntries(ALL_KEYS.map(k => [k, 8])));
        expect(win.computeEstimatedTotalFromRecord(r)).toBe(100);
    });

    it('returns 68 when every reference field is the minimum 4', () => {
        const r = recordWithScores(Object.fromEntries(ALL_KEYS.map(k => [k, 4])));
        expect(win.computeEstimatedTotalFromRecord(r)).toBe(68);
    });

    it('handles half-step (0.5) scores without rounding', () => {
        // 36 + 7.5 + 5*7 = 78.5
        const r = recordWithScores({ flavor: 7.5 });
        expect(win.computeEstimatedTotalFromRecord(r)).toBe(78.5);
    });

    it('ignores non-reference keys in evaluations', () => {
        // Records may carry chip selections / notes / flavors under each key —
        // only `.score` participates in the estimate.
        const r = {
            evaluations: {
                flavor: { score: 6, notes: 'bright', flavors: ['x__l1-floral'] },
                bogus:  { score: 999 },
            },
        };
        // 36 + 6 + 5*7 = 77; the `bogus` key is not in referenceFields
        expect(win.computeEstimatedTotalFromRecord(r)).toBe(77);
    });
});
