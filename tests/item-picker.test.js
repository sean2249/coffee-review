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
const input = () => doc.getElementById('f-item_ordered');
const inputHidden = () => input().classList.contains('d-none');

describe('renderItemCats', () => {
    it('renders the category chips and shows no items until one is picked', () => {
        expect(cats()).toEqual(['espresso', 'milk', 'pourover', 'coldbrew', 'other']);
        expect(items()).toEqual([]);
        expect(selCat()).toEqual([]);
    });

    it('hides the free-text input by default', () => {
        expect(inputHidden()).toBe(true);
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

    it('exposes 冰萃/冰滴 under the 冷萃 category, not 其他', () => {
        win.activateItemCat('coldbrew');
        expect(items()).toEqual(['冰萃', '冰滴']);
        win.activateItemCat('other');
        expect(items()).toEqual([]);
    });

    it('only reveals the free-text input for the 其他 category', () => {
        win.activateItemCat('espresso');
        expect(inputHidden()).toBe(true);
        win.activateItemCat('other');
        expect(inputHidden()).toBe(false);
        win.activateItemCat('pourover');
        expect(inputHidden()).toBe(true);
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

    it('treats a custom (out-of-list) value as 其他 and shows the input', () => {
        // User opens a category, then commits a free-text value not in any group.
        win.activateItemCat('milk');
        win.applyItemValue('氮氣冷萃');
        expect(selCat()).toEqual(['other']);
        expect(items()).toEqual([]);
        expect(inputHidden()).toBe(false);
    });

    it('clears the selection and hides the input for an empty value', () => {
        win.activateItemCat('milk');
        win.applyItemValue('');
        expect(selCat()).toEqual([]);
        expect(items()).toEqual([]);
        expect(inputHidden()).toBe(true);
    });
});

describe('category chip click', () => {
    it('writes the value into the input and highlights the clicked item chip', () => {
        win.activateItemCat('milk');
        doc.querySelector('.item-chip[data-item="冰拿鐵"]').click();
        expect(input().value).toBe('冰拿鐵');
        expect(selItem()).toEqual(['冰拿鐵']);
    });

    it('clears the input when switching to a different category', () => {
        doc.querySelector('.item-cat-chip[data-cat="other"]').click();
        input().value = '氮氣冷萃';
        doc.querySelector('.item-cat-chip[data-cat="pourover"]').click();
        expect(input().value).toBe('');
        expect(selItem()).toEqual([]);
    });

    it('preserves the selection when re-clicking the already-selected category', () => {
        win.activateItemCat('coldbrew');
        doc.querySelector('.item-chip[data-item="冰萃"]').click();
        // Re-click 冷萃 (already selected) — value + highlight must survive.
        doc.querySelector('.item-cat-chip[data-cat="coldbrew"]').click();
        expect(input().value).toBe('冰萃');
        expect(selItem()).toEqual(['冰萃']);
    });
});
