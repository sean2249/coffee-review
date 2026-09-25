import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// 「從 Google 重新同步」是店家客觀資訊的唯一更新路徑。按了就同步：沒有確認
// dialog、沒有候選清單（挑錯家等於把店偷換掉），成功不通知、失敗才 toast。

const SHOP = {
    id: 'shop-1',
    name: '舊店名',
    location: '舊地址',
    google_place_id: 'place_A',
};

let win, doc, updates, toasts;

// 只需支撐 api.updateShop 打出去的那一個 PATCH。
function stubApi(onUpdate) {
    return (path, init = {}) => {
        if (init.method === 'PATCH') {
            onUpdate(init.body);
            return Promise.resolve({ ...SHOP, ...init.body });
        }
        return Promise.reject(new Error(`unexpected apiFetch: ${path}`));
    };
}

beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp());
    updates = [];
    toasts = [];
    win.setSessionUser({ id: 'user-1' });
    win.apiFetch = stubApi(p => updates.push(p));
    win.showToast = (msg, ms, isError) => toasts.push({ msg, isError: !!isError });
    win.showErrorToast = msg => toasts.push({ msg, isError: true });
    win.refreshShopsCache = () => Promise.resolve();
    win.renderRoute = () => {};
    // Worker 回的形狀：displayName 是字串、location 是 { lat, lng } 純數字。
    win.isGoogleMapsReady = () => true;
    win.placesDetails = () => Promise.resolve({
        id: 'place_A',
        displayName: '新店名',
        formattedAddress: '新地址',
        location: { lat: 25.05, lng: 121.56 },
    });
});

describe('resyncShopFromGoogle', () => {
    it('writes the fields Google returned', async () => {
        await win.resyncShopFromGoogle(SHOP, null);
        expect(updates).toHaveLength(1);
        expect(updates[0].name).toBe('新店名');
        expect(updates[0].location).toBe('新地址');
        expect(updates[0].lat).toBe(25.05);
        expect(updates[0].lng).toBe(121.56);
        expect(updates[0].google_data_fetched_at).toBeTruthy();
    });

    it('never sends google_place_id — 店家身分不可變', async () => {
        await win.resyncShopFromGoogle(SHOP, null);
        expect(updates[0]).not.toHaveProperty('google_place_id');
    });

    it('opens no dialog — 按了就同步', async () => {
        await win.resyncShopFromGoogle(SHOP, null);
        expect(doc.querySelector('.modal-backdrop-custom')).toBe(null);
    });

    it('stays silent on success', async () => {
        await win.resyncShopFromGoogle(SHOP, null);
        expect(toasts).toEqual([]);
    });

    it('falls back to the current values when Google returns blanks', async () => {
        win.placesDetails = () => Promise.resolve({ id: 'place_A', location: null });
        await win.resyncShopFromGoogle(SHOP, null);
        expect(updates[0].name).toBe('舊店名');
        expect(updates[0].location).toBe('舊地址');
    });
});

describe('resyncShopFromGoogle — 失敗時', () => {
    it('toasts when Google Maps cannot load', async () => {
        win.placesDetails = () => Promise.reject(new Error('Google Places 回應 502'));
        await win.resyncShopFromGoogle(SHOP, null);
        expect(updates).toHaveLength(0);
        expect(toasts[0].isError).toBe(true);
        expect(toasts[0].msg).toContain('同步失敗');
    });

    it('toasts when the shop has no Google place bound', async () => {
        await win.resyncShopFromGoogle({ ...SHOP, google_place_id: null }, null);
        expect(updates).toHaveLength(0);
        expect(toasts[0].isError).toBe(true);
    });

    it('restores the button so the user can retry', async () => {
        win.placesDetails = () => Promise.reject(new Error('Google Places 回應 502'));
        const btn = doc.createElement('button');
        btn.innerHTML = '<i class="bi bi-arrow-repeat"></i>從 Google 重新同步';
        const before = btn.innerHTML;
        await win.resyncShopFromGoogle(SHOP, btn);
        expect(btn.disabled).toBe(false);
        expect(btn.innerHTML).toBe(before);
    });

    it('shows a busy state on the button while it works', async () => {
        let seen = null;
        const btn = doc.createElement('button');
        btn.innerHTML = 'orig';
        win.placesDetails = () => { seen = { disabled: btn.disabled, html: btn.innerHTML }; return Promise.reject(new Error('boom')); };
        await win.resyncShopFromGoogle(SHOP, btn);
        expect(seen.disabled).toBe(true);
        expect(seen.html).toContain('同步中');
    });
});
