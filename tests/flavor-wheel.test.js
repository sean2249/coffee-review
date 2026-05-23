import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// Flavor wheel tests cover both:
//   (a) decodeFlavorMeta (app.js:939) — pure, parses a persisted id back to
//       {name, color} for display.
//   (b) toggleFlavor / applyFlavorSelections (app.js:1787, 1861) — operate
//       on the wheelState Map plus the DOM. We mount a real container,
//       call renderFlavorWheel to initialise state, then drive interactions
//       and inspect the resulting selection via getSelectedFlavorIds().
//
// We re-load app.js per test so the closed-over wheelState Map starts
// empty and one test's DOM can't leak into another.

let win, doc;

beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp({
        bodyHtml: '<main id="app"></main><div id="wheel"></div>',
    }));
    win.renderFlavorWheel('wheel', () => {});
});

function ids() {
    return new Set(win.getSelectedFlavorIds('wheel'));
}

function clickTagById(id) {
    // The DOM tag carries dataset.flavorId === id. Click triggers the
    // onClick wired in drawFlavorWheel — same path the UI takes.
    const tag = doc.querySelector(`[data-flavor-id="${id}"]`);
    if (!tag) throw new Error(`tag not found: ${id}`);
    tag.click();
}

// ─────────────────────────────────────────────────────────────────────────
// decodeFlavorMeta
// ─────────────────────────────────────────────────────────────────────────

describe('decodeFlavorMeta', () => {
    it('returns null for null / non-string / unparseable inputs', () => {
        expect(win.decodeFlavorMeta(null)).toBeNull();
        expect(win.decodeFlavorMeta(undefined)).toBeNull();
        expect(win.decodeFlavorMeta(123)).toBeNull();
        expect(win.decodeFlavorMeta('no-marker')).toBeNull();
    });

    it('decodes an L1-only id to the L1 name and colour', () => {
        expect(win.decodeFlavorMeta('wheel__l1-floral'))
            .toEqual({ name: '花香類', color: '#d6336c' });
    });

    it('returns null when the L1 slug is not a known flavor', () => {
        expect(win.decodeFlavorMeta('wheel__l1-unknown')).toBeNull();
    });

    it('decodes an L2 string leaf using the parent colour', () => {
        // floral.sub = ['茉莉', ...] — bare string, no further depth.
        // Colour falls back to the L1 colour.
        expect(win.decodeFlavorMeta('wheel__l1-floral__l2-茉莉'))
            .toEqual({ name: '茉莉', color: '#d6336c' });
    });

    it('decodes an L2 object node using its own colour', () => {
        // fruit.sub contains {id:'citrus', name:'柑橘類', color:'#f59f00', ...}
        expect(win.decodeFlavorMeta('wheel__l1-fruit__l2-citrus'))
            .toEqual({ name: '柑橘類', color: '#f59f00' });
    });

    it('decodes an L3 leaf under an L2 object', () => {
        // fruit > citrus > '檸檬'
        expect(win.decodeFlavorMeta('wheel__l1-fruit__l2-citrus__l3-檸檬'))
            .toEqual({ name: '檸檬', color: '#f59f00' });
    });

    it('round-trips an L2 string whose name contains "/" and spaces', () => {
        // other.sub contains '霉味 / 土味'. The slug strips '/' and whitespace,
        // so the persisted id loses them — decode must still recover the
        // display name with the slashes intact.
        const id = 'wheel__l1-other__l2-霉味土味';
        expect(win.decodeFlavorMeta(id))
            .toEqual({ name: '霉味 / 土味', color: '#868e96' });
    });

    it('returns null when an L2 slug does not match any child', () => {
        expect(win.decodeFlavorMeta('wheel__l1-floral__l2-nope')).toBeNull();
        expect(win.decodeFlavorMeta('wheel__l1-fruit__l2-nope')).toBeNull();
    });

    it('returns null when an L3 slug does not match any leaf', () => {
        expect(win.decodeFlavorMeta('wheel__l1-fruit__l2-citrus__l3-nope'))
            .toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────
// toggleFlavor — selection + cascade
// ─────────────────────────────────────────────────────────────────────────

describe('toggleFlavor', () => {
    it('selects an L1 tag on click and deselects on second click', () => {
        clickTagById('wheel__l1-floral');
        expect(ids().has('wheel__l1-floral')).toBe(true);

        clickTagById('wheel__l1-floral');
        expect(ids().has('wheel__l1-floral')).toBe(false);
    });

    it('auto-selects the L1 ancestor when an L2 child is selected', () => {
        clickTagById('wheel__l1-floral'); // expand
        clickTagById('wheel__l1-floral__l2-茉莉');
        expect(ids().has('wheel__l1-floral__l2-茉莉')).toBe(true);
        expect(ids().has('wheel__l1-floral')).toBe(true);
    });

    it('auto-selects L1 + L2 ancestors when an L3 leaf is selected', () => {
        // fruit > citrus > 檸檬 — both ancestors get auto-added.
        clickTagById('wheel__l1-fruit');
        clickTagById('wheel__l1-fruit__l2-citrus');
        clickTagById('wheel__l1-fruit__l2-citrus__l3-檸檬');

        const s = ids();
        expect(s.has('wheel__l1-fruit__l2-citrus__l3-檸檬')).toBe(true);
        expect(s.has('wheel__l1-fruit__l2-citrus')).toBe(true);
        expect(s.has('wheel__l1-fruit')).toBe(true);
    });

    it('removes all descendants when the L1 ancestor is deselected', () => {
        clickTagById('wheel__l1-fruit');
        clickTagById('wheel__l1-fruit__l2-citrus');
        clickTagById('wheel__l1-fruit__l2-citrus__l3-檸檬');
        expect(ids().size).toBe(3);

        // Deselect L1 — descendants must cascade away with it.
        clickTagById('wheel__l1-fruit');
        expect(ids().size).toBe(0);
    });

    it('removes only the L2 sub-tree when an L2 object is deselected', () => {
        clickTagById('wheel__l1-fruit');
        clickTagById('wheel__l1-fruit__l2-citrus');
        clickTagById('wheel__l1-fruit__l2-citrus__l3-檸檬');

        // Deselect citrus only — fruit stays, citrus + 檸檬 leave.
        clickTagById('wheel__l1-fruit__l2-citrus');
        const s = ids();
        expect(s.has('wheel__l1-fruit')).toBe(true);
        expect(s.has('wheel__l1-fruit__l2-citrus')).toBe(false);
        expect(s.has('wheel__l1-fruit__l2-citrus__l3-檸檬')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────
// applyFlavorSelections — persistence round-trip
// ─────────────────────────────────────────────────────────────────────────

describe('applyFlavorSelections', () => {
    it('restores a previously persisted selection and expands its ancestors', () => {
        // Simulate loading a saved record whose only stored id is the L3 leaf.
        // applyFlavorSelections must reconstruct expandedL1/expandedL2 so the
        // wheel renders the L2 + L3 rows for that branch.
        const saved = ['wheel__l1-fruit__l2-citrus__l3-檸檬'];
        win.applyFlavorSelections('wheel', saved);

        // The leaf is selected as-is — the function does NOT auto-add
        // ancestors to `selected`. That's a deliberate split from
        // toggleFlavor, which DOES add ancestors on user interaction.
        expect(ids()).toEqual(new Set(saved));

        // But the ancestors must be expanded so their rows are rendered,
        // otherwise the leaf tag would never appear in the DOM.
        expect(doc.querySelector('[data-flavor-id="wheel__l1-fruit__l2-citrus"]'))
            .not.toBeNull();
        expect(doc.querySelector('[data-flavor-id="wheel__l1-fruit__l2-citrus__l3-檸檬"]'))
            .not.toBeNull();
    });

    it('treats null/undefined as an empty selection', () => {
        win.applyFlavorSelections('wheel', null);
        expect(ids().size).toBe(0);
        win.applyFlavorSelections('wheel', undefined);
        expect(ids().size).toBe(0);
    });

    it('replaces (not merges) the previous selection', () => {
        clickTagById('wheel__l1-floral');
        expect(ids().has('wheel__l1-floral')).toBe(true);

        win.applyFlavorSelections('wheel', ['wheel__l1-spice']);
        const s = ids();
        expect(s.has('wheel__l1-floral')).toBe(false);
        expect(s.has('wheel__l1-spice')).toBe(true);
    });
});
