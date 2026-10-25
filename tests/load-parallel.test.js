import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// #34：店家快取和頁面資料一起抓（記錄列表、單筆檢視、杯測場次檢視 / 編輯）。這裡鎖住：
// - 任何一個回應回來之前，/api/shops 和該頁的資料請求都已經發出
// - 記錄比店家先回來：卡片最後顯示正確店名，從不出現「(已刪除店家)」
// - 店家回來前就切換類型 / 輸入關鍵字：最後是新條件的結果，掛載那次晚回來也不會蓋掉它
// jsdom 沒有 fetch，照 tests/load-app.js 的慣例 stub apiFetch。

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
const TEMPLATE = '<template id="tpl-session-form">'
    + INDEX.split('<template id="tpl-session-form">')[1].split('</template>')[0]
    + '</template>';

const SHOPS = [{ id: 'shop-a', name: '甲咖啡' }, { id: 'shop-b', name: '乙咖啡' }];

let win, doc;
// 每個請求一筆：path + 手動放行的 resolve。stub 不自動回應，由測試決定先後。
let calls;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = () => doc.getElementById('app');
const paths = () => calls.map(c => c.path);
const respond = (prefix, value) => {
    const call = calls.find(c => !c.done && c.path.startsWith(prefix));
    if (!call) throw new Error(`no pending request for ${prefix}; seen: ${paths().join(', ')}`);
    call.done = true;
    call.resolve(value);
};
const cardTitles = () => [...doc.querySelectorAll('.record-card-title')].map(el => el.textContent);
const cardMeta = () => [...doc.querySelectorAll('.record-card-meta')].map(el => el.textContent.replace(/\s+/g, ' ').trim());

async function boot(bodyHtml) {
    ({ window: win, document: doc } = await loadApp(bodyHtml ? { bodyHtml } : {}));
    win.setSessionUser({ id: 'u1' });
    calls = [];
    win.apiFetch = p => new Promise(resolve => { calls.push({ path: p, resolve, done: false }); });
}

describe('任何回應回來之前兩個請求都已發出', () => {
    beforeEach(() => boot(`<main id="app"></main>${TEMPLATE}`));

    it('記錄列表', async () => {
        const pending = win.viewRecordsList(root(), {});
        await wait(0);
        expect(paths()).toEqual(['/api/shops', '/api/records?type=all']);
        respond('/api/shops', SHOPS);
        respond('/api/records', []);
        await pending;
    });

    it.each(['cupping', 'tasting'])('單筆檢視（%s）', async mode => {
        const pending = win.viewRecordDetail(root(), { mode, recordId: 'r1' });
        await wait(0);
        expect(paths()).toEqual(['/api/shops', `/api/records/${mode}/r1`]);
        respond(`/api/records/${mode}/r1`, { id: 'r1', bean_name: 'Geisha', shop_id: 'shop-a', item_ordered: 'Geisha' });
        respond('/api/shops', SHOPS);
        await pending;
        expect(root().textContent).toContain('甲咖啡');
        expect(root().textContent).not.toContain('已刪除店家');
    });

    it('杯測場次檢視', async () => {
        // viewSessionDetail 比對 location.hash 判斷是否已換頁，所以走真的路由。
        win.location.hash = '#/session/s1';
        await wait(0);
        expect(paths()).toEqual(['/api/shops', '/api/sessions/s1']);
        respond('/api/sessions/s1', {
            id: 's1', title: '週末場', session_date: '2026-06-20', stage: 'reveal',
            cups: [{ id: 'k1', code: 'A', shop_id: 'shop-a', bean_name: '肯亞', coe_total: 86, evaluations: {}, observation: {} }],
        });
        respond('/api/shops', SHOPS);
        await wait(0);
        expect(root().textContent).toContain('甲咖啡');
        expect(root().textContent).not.toContain('已刪除店家');
    });

    it('杯測場次編輯：場次先回也等店家，店家下拉選到杯的店家', async () => {
        const pending = win.viewSessionForm(root(), { sessionId: 's1' });
        await wait(0);
        expect(paths()).toEqual(['/api/shops', '/api/sessions/s1']);
        respond('/api/sessions/s1', {
            id: 's1', session_date: '2026-06-20', code_style: 'manual', stage: 'scoring',
            cups: [{ id: 'k1', code: 'A', position: 0, shop_id: 'shop-b', coe_total: null, coe_tier_id: null, evaluations: {}, observation: {} }],
        });
        await wait(0);
        // 店家還沒回來：表單不掛（按不到儲存）。
        expect(doc.getElementById('f-save')).toBeNull();
        respond('/api/shops', SHOPS);
        await pending;
        expect(doc.getElementById('f-save')).not.toBeNull();
        expect(doc.getElementById('f-shop').value).toBe('shop-b');
        expect(doc.querySelector('#f-shop-trigger .shop-picker-label').textContent).toBe('乙咖啡');
    });

    it('杯測場次編輯：等店家期間離開頁面就不掛表單', async () => {
        const pending = win.viewSessionForm(root(), { sessionId: 's1' });
        await wait(0);
        respond('/api/sessions/s1', { id: 's1', session_date: '2026-06-20', stage: 'scoring', cups: [] });
        await wait(0);
        win.eval('state.currentForm = null'); // 模擬 renderRoute 換頁
        respond('/api/shops', SHOPS);
        await expect(pending).resolves.toBeUndefined();
        expect(doc.getElementById('f-save')).toBeNull();
    });
});

describe('記錄列表：記錄與店家的先後', () => {
    beforeEach(() => boot());

    const CUPPING = [{ id: 'c1', _type: 'cupping', bean_name: 'Geisha', shop_id: 'shop-a', created_at: '2026-06-10T00:00:00Z' }];
    const TASTING = [{ id: 't1', _type: 'tasting', item_ordered: '拿鐵', shop_id: 'shop-b', created_at: '2026-06-09T00:00:00Z' }];

    it('記錄先回、店家後回：卡片最後顯示正確店名，從不出現「(已刪除店家)」', async () => {
        const pending = win.viewRecordsList(root(), {});
        await wait(0);
        respond('/api/records', CUPPING);
        await wait(0);
        expect(root().textContent).not.toContain('已刪除店家');
        respond('/api/shops', SHOPS);
        await pending;
        expect(cardTitles()).toEqual(['Geisha']);
        expect(cardMeta()[0]).toContain('甲咖啡');
        expect(root().textContent).not.toContain('已刪除店家');
    });

    it('店家回來前切換類型：最後是新類型的結果，掛載那次晚回來也不會蓋掉', async () => {
        const mounted = win.viewRecordsList(root(), {});
        await wait(0);
        doc.querySelector('.filter-chip[data-filter-type="tasting"]').click();
        await wait(0);
        expect(paths()).toEqual(['/api/shops', '/api/records?type=all', '/api/records?type=tasting']);

        respond('/api/records?type=tasting', TASTING);
        await wait(0);
        expect(root().textContent).not.toContain('已刪除店家');
        respond('/api/shops', SHOPS);
        await wait(0);
        expect(cardTitles()).toEqual(['拿鐵']);
        expect(cardMeta()[0]).toContain('乙咖啡');

        // 掛載那次（type=all）最後才回來：被丟掉，畫面不變。
        respond('/api/records?type=all', [...CUPPING, ...TASTING]);
        await mounted;
        expect(cardTitles()).toEqual(['拿鐵']);
        expect(root().textContent).not.toContain('已刪除店家');
    });

    it('店家回來前輸入店家關鍵字：等店家到了才篩，店家關鍵字有生效', async () => {
        const mounted = win.viewRecordsList(root(), {});
        await wait(0);
        const q = doc.getElementById('filter-q');
        q.value = '乙咖';
        q.dispatchEvent(new win.Event('input', { bubbles: true }));
        await wait(250);
        expect(paths()).toEqual(['/api/shops', '/api/records?type=all', '/api/records?type=all&withSearch=1']);

        respond('/api/records?type=all&withSearch=1', [...CUPPING, ...TASTING]);
        await wait(0);
        respond('/api/shops', SHOPS);
        await wait(0);
        expect(cardTitles()).toEqual(['拿鐵']);
        expect(doc.querySelector('.record-card-hit').textContent).toContain('店家');

        respond('/api/records?type=all', [...CUPPING, ...TASTING]);
        await mounted;
        expect(cardTitles()).toEqual(['拿鐵']);
    });

    it('第一次載入店家就失敗：照樣顯示記錄，店名留空', async () => {
        const pending = win.viewRecordsList(root(), {});
        await wait(0);
        const shops = calls.find(c => c.path === '/api/shops');
        shops.done = true;
        const warn = win.console.warn;
        win.console.warn = () => {};
        // 重新包一層：讓 /api/shops 改成 reject（refreshShopsCache 會吞掉）。
        shops.resolve(Promise.reject(new Error('boom')));
        respond('/api/records', CUPPING);
        await pending;
        win.console.warn = warn;
        expect(cardTitles()).toEqual(['Geisha']);
        expect(cardMeta()[0]).not.toContain('甲咖啡');
        expect(root().textContent).not.toContain('已刪除店家');
    });
});
