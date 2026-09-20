import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp } from './load-app.js';

let win;

beforeAll(async () => {
    ({ window: win } = await loadApp());
});

// newModePickerOptions (app.js) — single source of truth for the record-type
// option links, shared by the #/new page and the shop modal. 杯測場次沒有場次
// 層級的店家，所以只有 #/new（沒帶 shop）才有第三個選項。
// These tests lock the generated href values so a future record-type change
// (or a tweak to the ?shop= suffix) can't silently drift the two call sites.
describe('newModePickerOptions', () => {
    function hrefs(html) {
        return [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
    }

    it('links straight to the forms when no shop is given', () => {
        const html = win.newModePickerOptions();
        expect(hrefs(html)).toEqual(['#/new/cupping', '#/new/tasting', '#/new/session']);
    });

    it('carries the shop id into both forms via ?shop= and omits 杯測', () => {
        const html = win.newModePickerOptions('shop-123');
        expect(hrefs(html)).toEqual([
            '#/new/cupping?shop=shop-123',
            '#/new/tasting?shop=shop-123',
        ]);
    });

    it('url-encodes the shop id', () => {
        const html = win.newModePickerOptions('a b/c');
        expect(hrefs(html)).toEqual([
            '#/new/cupping?shop=a%20b%2Fc',
            '#/new/tasting?shop=a%20b%2Fc',
        ]);
    });
});
