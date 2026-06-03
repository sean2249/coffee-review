import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// Tasting "點用品項" picker is a two-level category → item structure that
// stores a single free-text value. These tests drive the same functions the
// UI calls (renderItemCats / activateItemCat / applyItemValue) against a real
// jsdom DOM and assert the rendered selection state.
//
// We mount only the picker's DOM (category row, item row, free-text input).
// isCloudReady() is false (no SUPABASE_CONFIG) so nothing touches the network.

let win, doc;

beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp({
        bodyHtml: `
            <main id="app"></main>
            <div class="item-cat-row"></div>
            <div class="item-chip-row"></div>
            <input id="f-item_ordered">
        `,
    }));
    win.renderItemCats();
});

const cats = () => [...doc.querySelectorAll('.item-cat-chip')].map(c => c.dataset.cat);
const selCat = () => [...doc.querySelectorAll('.item-cat-chip.selected')].map(c => c.dataset.cat);
const items = () => [...doc.querySelectorAll('.item-chip')].map(c => c.dataset.item);
const selItem = () => [...doc.querySelectorAll('.item-chip.selected')].map(c => c.dataset.item);

describe('renderItemCats', () => {
    it('renders the category chips and shows no items until one is picked', () => {
        expect(cats()).toEqual(['espresso', 'milk', 'pourover', 'other']);
        expect(items()).toEqual([]);
        expect(selCat()).toEqual([]);
    });
});

describe('activateItemCat', () => {
    it('selects the category and reveals its items', () => {
        win.activateItemCat('espresso');
        expect(selCat()).toEqual(['espresso']);
        expect(items()).toEqual(['濃縮', '冰美式', '熱美式']);
    });

    it('switching category replaces the shown items (single active category)', () => {
        win.activateItemCat('espresso');
        win.activateItemCat('pourover');
        expect(selCat()).toEqual(['pourover']);
        expect(items()).toEqual(['手沖', '冰手沖']);
    });
});

describe('applyItemValue', () => {
    it('activates the owning category and highlights a grouped value', () => {
        win.applyItemValue('摩卡');
        expect(selCat()).toEqual(['milk']);
        expect(items()).toContain('摩卡');
        expect(selItem()).toEqual(['摩卡']);
    });

    it('switches category when the value belongs to another group', () => {
        win.activateItemCat('espresso');
        win.applyItemValue('冰手沖');
        expect(selCat()).toEqual(['pourover']);
        expect(selItem()).toEqual(['冰手沖']);
    });

    it('clears the category + item rows for a custom (out-of-list) value', () => {
        // User opens a category, then commits a free-text value not in any group.
        win.activateItemCat('milk');
        win.applyItemValue('氮氣冷萃');
        expect(selCat()).toEqual([]);
        expect(items()).toEqual([]);
    });
});

describe('item chip click', () => {
    it('writes the value into the input and highlights the clicked chip', () => {
        win.activateItemCat('milk');
        doc.querySelector('.item-chip[data-item="冰拿鐵"]').click();
        expect(doc.getElementById('f-item_ordered').value).toBe('冰拿鐵');
        expect(selItem()).toEqual(['冰拿鐵']);
    });
});
