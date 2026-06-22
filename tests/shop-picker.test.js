import { describe, it, expect, beforeEach } from 'vitest';
import vm from 'node:vm';
import { loadApp } from './load-app.js';

// openShopPicker (app.js) is the searchable modal shared by the record form's
// 豆源 field and the records-list 店家 filter. These tests drive it against a
// real jsdom DOM and lock its contract: focusable <button> options (keyboard
// access), the name/location search predicate, allowEmpty vs required mode,
// the onPick callback + close behaviors, and focus restoration to the opener.
//
// state.shops is a top-level `const` (lexical, not a global property), so we
// seed it by evaluating in the same VM context the app script runs in.

let win, doc, dom;

const SHOPS = [
    { id: 's1', name: 'GABEE. 咖啡店', location: '台北市松山區民生東路', google_place_id: 'g1' },
    { id: 's2', name: 'NODE COFFEE', location: '台北市松山區南京東路', google_place_id: 'g2' },
    { id: 's3', name: '自家烘焙', location: '', google_place_id: null },
];

function seedShops(shops) {
    const ctx = dom.getInternalVMContext();
    vm.runInContext(`state.shops = ${JSON.stringify(shops)}; state.shopsLoaded = true;`, ctx);
}

beforeEach(async () => {
    ({ window: win, document: doc, dom } = await loadApp());
    seedShops(SHOPS);
});

const items = () => [...doc.querySelectorAll('.shop-picker-list-item')];
const labels = () => items().map(b => b.textContent.trim());
const ids = () => items().map(b => b.dataset.shopId);
const backdrop = () => doc.querySelector('.modal-backdrop-custom');
const search = () => doc.querySelector('.shop-picker-search');

function typeSearch(value) {
    const el = search();
    el.value = value;
    el.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
}

describe('openShopPicker — rendering', () => {
    it('renders one focusable <button> per shop plus the clear row when allowEmpty', () => {
        win.openShopPicker({ emptyLabel: '全部店家' });
        const els = items();
        expect(els.every(el => el.tagName === 'BUTTON')).toBe(true);
        expect(labels()[0]).toBe('全部店家');
        expect(ids()).toEqual(['', 's1', 's2', 's3']);
    });

    it('omits the clear row when allowEmpty is false (required mode)', () => {
        win.openShopPicker({ allowEmpty: false });
        expect(ids()).toEqual(['s1', 's2', 's3']);
    });

    it('marks the current selection as selected', () => {
        win.openShopPicker({ currentId: 's2', allowEmpty: false });
        const sel = items().filter(b => b.classList.contains('selected')).map(b => b.dataset.shopId);
        expect(sel).toEqual(['s2']);
    });

    it('shows the geo-alt pin only for shops with a google_place_id', () => {
        win.openShopPicker({ allowEmpty: false });
        const hasPin = items().map(b => !!b.querySelector('.bi-geo-alt-fill'));
        expect(hasPin).toEqual([true, true, false]);
    });
});

describe('openShopPicker — search', () => {
    it('filters by shop name', () => {
        win.openShopPicker({ allowEmpty: false });
        typeSearch('node');
        expect(ids()).toEqual(['s2']);
    });

    it('filters by location (a field not shown in the list label of name-only matches)', () => {
        win.openShopPicker({ allowEmpty: false });
        typeSearch('松山');
        expect(ids()).toEqual(['s1', 's2']);
    });

    it('keeps the clear row visible while filtering when allowEmpty', () => {
        win.openShopPicker({ emptyLabel: '全部店家' });
        typeSearch('gabee');
        expect(ids()).toEqual(['', 's1']);
    });

    it('renders a no-match hint (and no option buttons) when nothing matches', () => {
        win.openShopPicker({ allowEmpty: false });
        typeSearch('zzz');
        expect(items()).toEqual([]);
        expect(doc.querySelector('.shop-picker-empty').textContent).toContain('找不到');
    });
});

describe('openShopPicker — selection & close', () => {
    it('clicking an option calls onPick with its id and closes the modal', () => {
        let picked = 'UNSET';
        win.openShopPicker({ allowEmpty: false, onPick: id => { picked = id; } });
        items().find(b => b.dataset.shopId === 's2').click();
        expect(picked).toBe('s2');
        expect(backdrop()).toBeNull();
    });

    it('clicking the clear row calls onPick with an empty string', () => {
        let picked = 'UNSET';
        win.openShopPicker({ emptyLabel: '全部店家', onPick: id => { picked = id; } });
        items().find(b => b.dataset.shopId === '').click();
        expect(picked).toBe('');
    });

    it('Escape closes the modal without calling onPick', () => {
        let called = false;
        win.openShopPicker({ allowEmpty: false, onPick: () => { called = true; } });
        doc.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape' }));
        expect(backdrop()).toBeNull();
        expect(called).toBe(false);
    });
});

describe('openShopPicker — focus management', () => {
    it('restores focus to the opener element when the modal closes', () => {
        const opener = doc.createElement('button');
        doc.body.appendChild(opener);
        opener.focus();
        win.openShopPicker({ allowEmpty: false });
        // search input takes focus while the dialog is open
        expect(doc.activeElement).toBe(search());
        doc.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape' }));
        expect(doc.activeElement).toBe(opener);
    });
});
