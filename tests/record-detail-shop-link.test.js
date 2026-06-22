import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp } from './load-app.js';

let win;

beforeAll(async () => {
    ({ window: win } = await loadApp());
});

// renderRecordDetail (app.js) — the shop name in the detail header is a link
// to #/shops/<id> ONLY when that shop still exists in the cache. A deleted or
// unknown shop must stay plain text so we never link to a 404 shop route, and
// a record with no shop_id must not render a shop element at all. `state` is a
// top-level const (not a window property), so we seed the cache via eval, which
// reaches the module's lexical binding.
describe('renderRecordDetail shop name link', () => {
    function setShops(shops, loaded = true) {
        win.eval(
            `state.shops = ${JSON.stringify(shops)}; state.shopsLoaded = ${loaded};`,
        );
    }

    it('links the shop name to #/shops/<id> when the shop exists', () => {
        setShops([{ id: 'shop-1', name: '果嶼茶時' }]);
        const html = win.renderRecordDetail('tasting', { id: 'r1', shop_id: 'shop-1' });
        expect(html).toContain('<a class="detail-meta-shop" href="#/shops/shop-1">');
        expect(html).toContain('果嶼茶時');
    });

    it('renders a deleted shop as plain text, never a link', () => {
        // shopsLoaded=true but the id is absent → shopName() returns the
        // "(已刪除店家)" placeholder, which must not become a link.
        setShops([]);
        const html = win.renderRecordDetail('tasting', { id: 'r1', shop_id: 'gone' });
        expect(html).not.toContain('detail-meta-shop');
        expect(html).toContain('(已刪除店家)');
    });

    it('renders no shop element when the record has no shop_id', () => {
        setShops([{ id: 'shop-1', name: '果嶼茶時' }]);
        const html = win.renderRecordDetail('tasting', { id: 'r1' });
        expect(html).not.toContain('detail-meta-shop');
        expect(html).not.toContain('bi-shop');
    });
});
