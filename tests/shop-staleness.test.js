import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// coffee.shops 是 Google Places 的投影，內容依條款最多快取 30 天。
// 店家頁載入時若過期就補抓一次；這條路徑同時驗證 place_id 是否仍有效。

const CLOUD = { url: 'https://example.supabase.co', anonKey: 'anon-key' };
const DAY = 24 * 60 * 60 * 1000;
const SHOP = { id: 'shop-1', name: '舊店名', location: '舊地址', google_place_id: 'place_A' };

const ago = ms => new Date(Date.now() - ms).toISOString();

let win, updates, toasts, warns;

function fakeClient(onUpdate) {
    return { from: () => ({ update(payload) {
        onUpdate(payload);
        return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { ...SHOP, ...payload }, error: null }) }) }) };
    } }) };
}

function fakeGoogle(place) {
    return { maps: { importLibrary: () => Promise.resolve({
        Place: class { constructor() { Object.assign(this, place); } fetchFields() { return Promise.resolve(); } },
    }) } };
}

const FRESH_PLACE = {
    id: 'place_A', displayName: '新店名', formattedAddress: '新地址',
    location: { lat: () => 25.05, lng: () => 121.56 },
};

beforeEach(async () => {
    ({ window: win } = await loadApp({ supabaseConfig: CLOUD }));
    updates = []; toasts = []; warns = [];
    win.setSessionUser({ id: 'user-1' });
    win.GOOGLE_CONFIG = { mapsApiKey: 'k' };
    win.ensureSupabase = () => Promise.resolve(fakeClient(p => updates.push(p)));
    win.showErrorToast = msg => toasts.push(msg);
    win.refreshShopsCache = () => Promise.resolve();
    win.renderRoute = () => {};
    win.console.warn = (...a) => warns.push(a.join(' '));
    win.ensureGoogleMaps = () => Promise.resolve(fakeGoogle(FRESH_PLACE));
});

describe('isShopDataStale', () => {
    it('treats a never-fetched shop as stale', () => {
        expect(win.isShopDataStale({ ...SHOP, google_data_fetched_at: null })).toBe(true);
    });

    it('is fresh inside the 30-day window', () => {
        expect(win.isShopDataStale({ ...SHOP, google_data_fetched_at: ago(29 * DAY) })).toBe(false);
    });

    it('is stale past 30 days', () => {
        expect(win.isShopDataStale({ ...SHOP, google_data_fetched_at: ago(31 * DAY) })).toBe(true);
    });

    it('treats an unparseable timestamp as stale rather than trusting it', () => {
        expect(win.isShopDataStale({ ...SHOP, google_data_fetched_at: 'not-a-date' })).toBe(true);
    });

    // 條款是「最多快取 30 天」—— 滿 30 天的當下就不該再用。
    it('is stale exactly at the 30-day boundary', () => {
        const now = Date.now();
        const shop = { ...SHOP, google_data_fetched_at: new Date(now - 30 * DAY).toISOString() };
        expect(win.isShopDataStale(shop, now)).toBe(true);
    });

    it('is still fresh one second before the boundary', () => {
        const now = Date.now();
        const shop = { ...SHOP, google_data_fetched_at: new Date(now - 30 * DAY + 1000).toISOString() };
        expect(win.isShopDataStale(shop, now)).toBe(false);
    });

    // 時間戳由瀏覽器寫入，時鐘可能不準。落在未來時 now - at 恆為負 ——
    // 若當成 fresh，這一列會永遠不再刷新（卡死）。
    it('treats a far-future timestamp as stale instead of pinning the row fresh forever', () => {
        const now = Date.now();
        const shop = { ...SHOP, google_data_fetched_at: new Date(now + 365 * DAY).toISOString() };
        expect(win.isShopDataStale(shop, now)).toBe(true);
    });

    it('tolerates small clock skew so a fresh write is not immediately refetched', () => {
        const now = Date.now();
        const shop = { ...SHOP, google_data_fetched_at: new Date(now + 2 * 60 * 1000).toISOString() };
        expect(win.isShopDataStale(shop, now)).toBe(false);
    });

    it('never reports a shop with no place id as stale — there is nothing to refresh', () => {
        expect(win.isShopDataStale({ ...SHOP, google_place_id: null, google_data_fetched_at: null })).toBe(false);
    });
});

describe('refreshShopIfStale', () => {
    it('does nothing while the cache is fresh', async () => {
        const shop = { ...SHOP, google_data_fetched_at: ago(1 * DAY) };
        const out = await win.refreshShopIfStale(shop);
        expect(updates).toHaveLength(0);
        expect(out).toBe(shop);
    });

    it('refetches and returns the updated shop once stale', async () => {
        const out = await win.refreshShopIfStale({ ...SHOP, google_data_fetched_at: ago(60 * DAY) });
        expect(updates).toHaveLength(1);
        expect(out.name).toBe('新店名');
        expect(out.location).toBe('新地址');
    });

    it('skips when Google Maps is not configured', async () => {
        delete win.GOOGLE_CONFIG;
        await win.refreshShopIfStale({ ...SHOP, google_data_fetched_at: ago(60 * DAY) });
        expect(updates).toHaveLength(0);
    });

    it('stays silent and falls back to cached data on failure', async () => {
        win.ensureGoogleMaps = () => Promise.resolve(null);
        const shop = { ...SHOP, google_data_fetched_at: ago(60 * DAY) };
        const out = await win.refreshShopIfStale(shop);
        expect(out).toBe(shop);        // 畫面照樣渲染，不因 Google 掛掉而擋住
        expect(toasts).toEqual([]);    // 使用者沒要求的自動行為，不該噴錯
        expect(warns.length).toBeGreaterThan(0);
    });
});

describe('place_id 退役', () => {
    // DB trigger 凍結 google_place_id，所以偵測到換 id 只能回報，不能自動改寫。
    beforeEach(() => {
        win.ensureGoogleMaps = () => Promise.resolve(fakeGoogle({ ...FRESH_PLACE, id: 'place_B' }));
    });

    it('never writes when Google returns a different place id', async () => {
        await win.refreshShopIfStale({ ...SHOP, google_data_fetched_at: ago(60 * DAY) });
        expect(updates).toHaveLength(0);
    });

    it('tells the user when they triggered it by hand', async () => {
        await win.resyncShopFromGoogle(SHOP, null);
        expect(updates).toHaveLength(0);
        expect(toasts[0]).toContain('已被取代');
    });
});
