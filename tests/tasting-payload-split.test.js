import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// v5：品鑑記錄 = 「這次喝的那一杯」。店家體驗欄位已搬到 coffee.shop_notes，
// 這裡鎖住它們不會偷偷回到 tasting payload（回歸會讓 PostgREST 直接拒絕寫入）。

const SHOP_EXPERIENCE_COLUMNS = [
    'ambience_axes', 'facilities', 'space_style', 'space_materials',
    'service_ratings', 'menu_food', 'drink_types',
    'atmosphere_notes', 'decor_notes', 'service_notes',
    'atmosphere_tags', 'decor_tags', 'service_tags',
];

let win, doc;
beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp());
    // buildFormPayload reads the mounted #tpl-form DOM; mount the minimal set of
    // ids the tasting branch touches.
    doc.body.insertAdjacentHTML('beforeend', `
        <input id="f-shop" value="shop-1">
        <textarea id="f-defects"></textarea>
        <textarea id="f-notes"></textarea>
        <input id="f-visit_date" value="2026-08-01">
        <input id="f-price" value="180">
        <input id="f-item_ordered" value="冰滴">
        <input id="f-tasting-bean" value="聖馬丁莊園">
    `);
});

describe('buildFormPayload("tasting")', () => {
    it('carries no shop-experience columns', () => {
        const p = win.buildFormPayload('tasting');
        for (const col of SHOP_EXPERIENCE_COLUMNS) {
            expect(p, `column ${col}`).not.toHaveProperty(col);
        }
    });

    it('still carries the per-cup fields', () => {
        const p = win.buildFormPayload('tasting');
        expect(p.shop_id).toBe('shop-1');
        expect(p.visit_date).toBe('2026-08-01');
        expect(p.price).toBe(180);
        expect(p.item_ordered).toBe('冰滴');
        expect(p.bean_name).toBe('聖馬丁莊園');
    });

    it('bumps schema_version to 5', () => {
        expect(win.buildFormPayload('tasting').schema_version).toBe(5);
    });
});

describe('renderShopNoteLinkCard', () => {
    it('points the tasting detail page at the shop it belongs to', () => {
        const html = win.renderShopNoteLinkCard({ shop_id: 'shop-1' });
        expect(html).toContain('href="#/shops/shop-1"');
    });

    it('renders nothing when the record has no shop', () => {
        expect(win.renderShopNoteLinkCard({ shop_id: null })).toBe('');
    });
});
