import { describe, it, expect, beforeEach } from 'vitest';
import vm from 'node:vm';
import { loadApp } from './load-app.js';

// openShopPicker 的第二層：本地 registry 找不到時才問 Google Places。
// 這裡鎖住那條「避免重複建立」的路徑 —— Google 找到的地點若已經在清單裡
// （本地關鍵字比對漏掉），必須連結既有店家，而不是 createShop 撞 unique 後報錯。
//
// 沒有 vitest 的 fake timers：每個測試自建 JSDOM，app 的 setTimeout 活在 VM
// context 裡，攔不到。debounce 是 400ms，所以等真實時間。

const CLOUD = { url: 'https://example.supabase.co', anonKey: 'anon-key' };
const SHOPS = [
    { id: 's1', name: 'GABEE. 咖啡店', location: '台北市松山區民生東路', google_place_id: 'g1' },
    { id: 's2', name: 'NODE COFFEE', location: '台北市松山區南京東路', google_place_id: 'g2' },
];

let win, doc, dom;

function seedShops(shops) {
    const ctx = dom.getInternalVMContext();
    ctx.__seedShops = shops;
    vm.runInContext('state.shops = __seedShops; state.shopsLoaded = true; delete __seedShops;', ctx);
}

// state.shops 是 top-level const，測試只能從 VM context 讀回來。
function readShops() {
    return vm.runInContext('state.shops', dom.getInternalVMContext());
}

// 記下 Places 被呼叫幾次 / 拿到什麼 textQuery，並回傳指定的候選。
function stubPlaces(places, { onCall } = {}) {
    const calls = [];
    win.GOOGLE_CONFIG = { mapsApiKey: 'test-key' };
    win.ensureGoogleMaps = async () => ({
        maps: {
            importLibrary: async () => ({
                Place: {
                    searchByText: async ({ textQuery }) => {
                        calls.push(textQuery);
                        if (onCall) return onCall(textQuery);
                        return { places };
                    },
                },
            }),
        },
    });
    return calls;
}

// api.* 全部經過 ensureSupabase，所以 stub 這個工廠就夠了。
// listShops → from().select().order()；createShop → from().insert().select().single()
function stubSupabase({ insertResult, listRows }) {
    const state = { inserted: null, listCalls: 0 };
    win.ensureSupabase = async () => ({
        from: () => ({
            select: () => ({
                order: async () => {
                    state.listCalls += 1;
                    return { data: listRows ? listRows(state.listCalls) : [], error: null };
                },
            }),
            insert: payload => {
                state.inserted = payload;
                return { select: () => ({ single: async () => insertResult }) };
            },
        }),
    });
    return state;
}

const type = async (text, ms = 450) => {
    const search = doc.querySelector('.shop-picker-search');
    search.value = text;
    search.dispatchEvent(new win.Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, ms));
};

// createShop → refreshShopsCache 串了好幾層 await，一次 macrotask flush 不夠。
const settle = async (n = 10) => {
    for (let i = 0; i < n; i += 1) await new Promise(r => setTimeout(r, 0));
};

const googleSection = () => doc.querySelector('.shop-picker-google');
const googleItems = () => [...doc.querySelectorAll('.shop-picker-google-item')];
const googleNote = () => doc.querySelector('.shop-picker-google-note');
const localItems = () => [...doc.querySelectorAll('.shop-picker-list-item')];
const toastText = () => doc.getElementById('toastMsg')?.textContent || '';

beforeEach(async () => {
    ({ window: win, document: doc, dom } = await loadApp({ supabaseConfig: CLOUD }));
    seedShops(SHOPS);
});

describe('本地命中時不查 Google', () => {
    it('never calls the Places API and keeps the section hidden', async () => {
        const calls = stubPlaces([]);
        win.openShopPicker({});
        await type('GABEE');
        expect(calls).toEqual([]);
        expect(googleSection().hidden).toBe(true);
    });
});

describe('本地落空 → 自動查 Google', () => {
    const PLACES = [
        { id: 'g9', displayName: '興波咖啡', formattedAddress: '台北市中正區忠孝東路', location: { lat: 25.03, lng: 121.56 } },
    ];

    it('renders one row per place under the Google heading', async () => {
        stubPlaces(PLACES);
        win.openShopPicker({});
        await type('興波');
        expect(localItems().map(b => b.dataset.shopId)).toEqual(['']); // 只剩「不指定」
        expect(googleSection().hidden).toBe(false);
        expect(googleItems()).toHaveLength(1);
        expect(googleItems()[0].textContent).toContain('興波咖啡');
        expect(googleItems()[0].textContent).toContain('台北市中正區忠孝東路');
    });

    it('passes the raw query through, not the lower-cased one', async () => {
        const calls = stubPlaces(PLACES);
        win.openShopPicker({});
        await type('DoDidDone');
        expect(calls).toEqual(['DoDidDone']);
    });

    it('debounces keystrokes into a single request', async () => {
        const calls = stubPlaces(PLACES);
        win.openShopPicker({});
        await type('興', 50);
        await type('興波', 50);
        await type('興波咖', 450);
        expect(calls).toEqual(['興波咖']);
    });

    it('does not re-query while the same query is still shown', async () => {
        const calls = stubPlaces(PLACES);
        win.openShopPicker({});
        await type('興波');
        await type('興波');
        expect(calls).toHaveLength(1);
    });

    it('shows a note when Google has nothing either', async () => {
        stubPlaces([]);
        win.openShopPicker({});
        await type('zzzz');
        expect(googleItems()).toHaveLength(0);
        expect(googleNote().textContent).toContain('Google 地圖也找不到');
    });

    it('ignores a stale response when the query moved on', async () => {
        const deferred = new Map();
        stubPlaces(null, {
            onCall: q => new Promise(resolve => deferred.set(q, resolve)),
        });
        win.openShopPicker({});
        await type('aaa', 450);
        await type('bbb', 450);
        deferred.get('bbb')({ places: [{ id: 'gb', displayName: 'B 店', formattedAddress: 'b' }] });
        await settle();
        deferred.get('aaa')({ places: [{ id: 'ga', displayName: 'A 店', formattedAddress: 'a' }] });
        await settle();
        expect(googleItems()).toHaveLength(1);
        expect(googleItems()[0].textContent).toContain('B 店');
    });

    it('does not write to the DOM after the modal closed mid-flight', async () => {
        const deferred = new Map();
        stubPlaces(null, { onCall: q => new Promise(resolve => deferred.set(q, resolve)) });
        win.openShopPicker({});
        await type('aaa', 450);
        doc.querySelector('.modal-close').click();
        deferred.get('aaa')({ places: PLACES });
        await settle();
        expect(doc.querySelector('.modal-backdrop-custom')).toBeNull();
    });
});

describe('Google 結果已經在清單裡', () => {
    // 這是使用者指出的情境：本地搜尋因為拼法不同而漏掉，但 Google 找得到。
    const KNOWN = [
        { id: 'g1', displayName: 'GABEE. Coffee', formattedAddress: '台北市松山區民生東路', location: { lat: 25.06, lng: 121.55 } },
    ];

    it('marks the row 已在清單中', async () => {
        stubPlaces(KNOWN);
        win.openShopPicker({});
        await type('gabee coffee shop');
        expect(googleItems()[0].textContent).toContain('已在清單中');
    });

    it('links the existing shop instead of creating one', async () => {
        stubPlaces(KNOWN);
        const sb = stubSupabase({ insertResult: { data: null, error: { code: '23505' } } });
        let picked;
        let created = 'untouched';
        win.openShopPicker({ onPick: (id, shop) => { picked = id; created = shop; } });
        await type('gabee coffee shop');
        googleItems()[0].click();
        await settle();
        expect(picked).toBe('s1');
        expect(created).toBeNull();               // 既有店家不帶第二引數
        expect(sb.inserted).toBeNull();           // 從未嘗試新增
        expect(doc.querySelector('.modal-backdrop-custom')).toBeNull();
    });
});

describe('Google 結果是新地點', () => {
    const NEW = [
        { id: 'g9', displayName: '興波咖啡', formattedAddress: '台北市中正區忠孝東路', location: { lat: 25.03, lng: 121.56 } },
    ];
    const SAVED = { id: 's9', name: '興波咖啡', location: '台北市中正區忠孝東路', google_place_id: 'g9' };

    it('creates the shop and reports it as newly created', async () => {
        stubPlaces(NEW);
        const sb = stubSupabase({
            insertResult: { data: SAVED, error: null },
            listRows: () => [...SHOPS, SAVED],
        });
        let picked, created;
        win.openShopPicker({ onPick: (id, shop) => { picked = id; created = shop; } });
        await type('興波');
        googleItems()[0].click();
        await settle();

        expect(sb.inserted).toMatchObject({
            name: '興波咖啡',
            location: '台北市中正區忠孝東路',
            google_place_id: 'g9',
            lat: 25.03,
            lng: 121.56,
        });
        // google_data_fetched_at 是條款要求的快取時間戳，created_by 由 api 層蓋。
        expect(typeof sb.inserted.google_data_fetched_at).toBe('string');
        expect(Object.keys(sb.inserted).sort()).toEqual([
            'created_by', 'google_data_fetched_at', 'google_place_id', 'lat', 'lng', 'location', 'name',
        ]);
        expect(picked).toBe('s9');
        expect(created).toEqual(SAVED);
        expect(readShops()).toContainEqual(SAVED);   // 快取已刷新
        expect(toastText()).toContain('已新增店家');
    });

    it('accepts a LatLng-style location whose lat/lng are functions', async () => {
        stubPlaces([{
            id: 'g9',
            displayName: '興波咖啡',
            formattedAddress: '台北市中正區忠孝東路',
            location: { lat: () => 25.03, lng: () => 121.56 },
        }]);
        const sb = stubSupabase({ insertResult: { data: SAVED, error: null }, listRows: () => [SAVED] });
        win.openShopPicker({});
        await type('興波');
        googleItems()[0].click();
        await settle();
        expect(sb.inserted).toMatchObject({ lat: 25.03, lng: 121.56 });
    });
});

describe('createShop 撞到 23505', () => {
    const NEW = [
        { id: 'g9', displayName: '興波咖啡', formattedAddress: '台北市中正區忠孝東路', location: { lat: 25.03, lng: 121.56 } },
    ];
    const CONFLICT = { id: 's7', name: '興波咖啡 Simple Kaffa', location: '台北市中正區忠孝東路', google_place_id: 'g9' };

    it('re-reads the cache and links the conflicting shop', async () => {
        stubPlaces(NEW);
        stubSupabase({
            insertResult: { data: null, error: { code: '23505' } },
            listRows: () => [...SHOPS, CONFLICT],
        });
        let picked, created;
        win.openShopPicker({ onPick: (id, shop) => { picked = id; created = shop; } });
        await type('興波');
        googleItems()[0].click();
        await settle();
        expect(picked).toBe('s7');
        expect(created).toBeNull();
        expect(toastText()).not.toContain('失敗');
        expect(doc.querySelector('.modal-backdrop-custom')).toBeNull();
    });

    it('falls back to an error toast when the conflicting row is unreachable', async () => {
        stubPlaces(NEW);
        stubSupabase({
            insertResult: { data: null, error: { code: '23505' } },
            listRows: () => [...SHOPS],
        });
        let picked = 'untouched';
        win.openShopPicker({ onPick: id => { picked = id; } });
        await type('興波');
        googleItems()[0].click();
        await settle();
        expect(picked).toBe('untouched');
        expect(toastText()).toContain('新增店家失敗');
        expect(googleItems()[0].disabled).toBe(false);   // 可以再試一次
        expect(googleItems()[0].textContent).toContain('台北市中正區忠孝東路');
    });
});

describe('沒有 Google Maps key', () => {
    it('keeps local search working and explains the missing key', async () => {
        let called = false;
        win.ensureGoogleMaps = async () => { called = true; return null; };
        win.openShopPicker({});
        await type('GABEE');
        expect(localItems().map(b => b.dataset.shopId)).toEqual(['', 's1']);

        await type('zzzz');
        expect(called).toBe(false);
        expect(googleNote().textContent).toContain('API key');
    });
});

describe('店名只能來自 Google', () => {
    it('offers no free-text name/location input anywhere in the picker', async () => {
        stubPlaces([{ id: 'g9', displayName: '興波咖啡', formattedAddress: '台北市中正區忠孝東路' }]);
        win.openShopPicker({});
        await type('興波');
        const inputs = [...doc.querySelectorAll('.modal-backdrop-custom input')];
        expect(inputs).toHaveLength(1);
        expect(inputs[0].type).toBe('search');
    });
});

describe('舊的 openShopModal 已完全退場', () => {
    it('leaves no orphaned markup or entry point behind', async () => {
        const fs = await import('node:fs');
        const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
        expect(html).not.toContain('tpl-shop-modal');
        expect(html).not.toContain('id="f-shop-new"');
        expect(win.openShopModal).toBeUndefined();
    });
});
