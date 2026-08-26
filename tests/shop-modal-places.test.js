import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// 店家是共享 registry，身分由 google_place_id 定義：name/location/lat/lng 全是
// Google Places 的投影。這裡鎖住「modal 沒有任何手動輸入欄位」與
// 「沒有 Google Maps key 就不能新增店家」。

const CLOUD = { url: 'https://example.supabase.co', anonKey: 'anon-key' };
const MODAL_TPL = `
<template id="tpl-shop-modal">
  <div class="modal-backdrop-custom">
    <div class="modal-shell">
      <header class="modal-header">
        <h3 id="shop-modal-title">新增店家</h3>
        <button type="button" class="modal-close"></button>
      </header>
      <form class="modal-body" id="shop-modal-form">
        <div class="mb-2 sm-place-row" hidden>
          <input type="search" id="sm-place-search">
          <button type="button" id="sm-place-search-btn"></button>
          <div id="sm-place-results"></div>
        </div>
        <div class="empty-state sm-place-unavailable" hidden>
          <p>需先設定 Google Maps API key 才能新增店家。</p>
        </div>
        <div class="modal-actions">
          <button type="button" data-action="cancel"></button>
          <button type="submit" id="sm-save" disabled>儲存</button>
        </div>
      </form>
    </div>
  </div>
</template>`;

let win, doc;
beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp({
        bodyHtml: `<main id="app"></main>${MODAL_TPL}`,
        supabaseConfig: CLOUD,
    }));
});

describe('shop modal template', () => {
    it('has no free-text 店名 / 位置 / 介紹 inputs left', () => {
        const html = doc.getElementById('tpl-shop-modal').innerHTML;
        expect(html).not.toContain('id="sm-name"');
        expect(html).not.toContain('id="sm-location"');
        expect(html).not.toContain('id="sm-intro"');
    });
});

describe('openShopModal without a Google Maps key', () => {
    beforeEach(() => win.openShopModal());

    it('explains that a key is required', () => {
        expect(doc.querySelector('.sm-place-unavailable').hidden).toBe(false);
    });

    it('hides the Places search row', () => {
        expect(doc.querySelector('.sm-place-row').hidden).toBe(true);
    });

    it('hides the save button — there is no way to create a shop', () => {
        expect(doc.getElementById('sm-save').hidden).toBe(true);
    });
});

describe('openShopModal with a Google Maps key', () => {
    beforeEach(() => {
        win.GOOGLE_CONFIG = { mapsApiKey: 'test-key' };
        win.openShopModal();
    });

    it('shows the Places search row', () => {
        expect(doc.querySelector('.sm-place-row').hidden).toBe(false);
    });

    it('keeps save disabled until a place is picked', () => {
        expect(doc.getElementById('sm-save').disabled).toBe(true);
    });

    it('does not reach the API when submitted with nothing picked', async () => {
        // `api` is a top-level const, so it is not reachable on window; stub the
        // client factory every api.* call funnels through instead.
        let reached = false;
        win.ensureSupabase = () => { reached = true; return Promise.resolve(null); };
        doc.getElementById('shop-modal-form')
            .dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 0));
        expect(reached).toBe(false);
    });
});
