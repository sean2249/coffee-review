import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// 欄位投影本身搬進 Worker 了（見 test/worker/read.test.ts），這裡只剩兩件事：
// api.listRecords 有沒有把旗標翻成對的查詢字串，以及店家頁拿到合併後的陣列之後
// 算不算得出常見風味 —— summarizeRecords 讀的是 r.evaluations / r.observation，
// 少了那兩欄，正式環境的風味 chips 會永遠是空的（純函式測試抓不到，因為它直接
// 餵完整的列）。場次同理：店家頁把每一杯當一筆記錄。

let win, api;

// path -> 回應。未列出的路徑會讓測試失敗，免得漏掉的請求靜靜回 undefined。
function stubApi(routes) {
    const seen = [];
    win.apiFetch = (path) => {
        seen.push(path);
        const key = Object.keys(routes).find(r => path.startsWith(r));
        if (!key) throw new Error(`unexpected apiFetch: ${path}`);
        return Promise.resolve(routes[key]);
    };
    return seen;
}

beforeEach(async () => {
    ({ window: win } = await loadApp());
    win.setSessionUser({ id: 'u1' });
    api = win.eval('api');
});

describe('api.listRecords 查詢字串', () => {
    it('預設不要求 evaluations / observation（記錄列表、店家列表用不到）', async () => {
        const seen = stubApi({ '/api/records': [] });
        await api.listRecords({ type: 'all' });
        expect(seen).toEqual(['/api/records?type=all']);
    });

    it('withEvaluations 會帶上旗標', async () => {
        const seen = stubApi({ '/api/records': [] });
        await api.listRecords({ type: 'session', withEvaluations: true });
        expect(seen).toEqual(['/api/records?type=session&withEvaluations=1']);
    });

    it('原樣回傳 Worker 合併好的陣列', async () => {
        const rows = [{ id: 'a', _type: 'tasting' }, { id: 'b', _type: 'cupping' }];
        stubApi({ '/api/records': rows });
        expect(await api.listRecords()).toEqual(rows);
    });
});

describe('viewShopDetail 常見風味', () => {
    it('從記錄與場次杯的 evaluations / observation 算出風味 chips（別家店的不算）', async () => {
        const lemon = 'x__l1-fruit__l2-citrus__l3-檸檬';
        const jasmine = 'y__l1-floral__l2-茉莉';

        const seen = stubApi({
            '/api/shops/s1/note': null,
            '/api/shops/s1': { id: 's1', name: '測試咖啡' },
            '/api/shops': [{ id: 's1', name: '測試咖啡' }],
            '/api/records': [
                {
                    id: 't1', _type: 'tasting', shop_id: 's1', coe_total: 84, created_at: '2026-09-03',
                    observation: { aroma: { flavors: [lemon] } },
                },
                {
                    id: 'sess1', _type: 'session', title: '日曬比較', session_date: '2026-09-04',
                    created_at: '2026-09-04',
                    cups: [
                        // 同一場裡兩杯掛在不同店家：只有 s1 那杯該進統計
                        {
                            id: 'cup1', code: 'A', position: 0, shop_id: 's1', coe_total: 86,
                            evaluations: { flavor: { flavors: [lemon] } },
                        },
                        {
                            id: 'cup2', code: 'B', position: 1, shop_id: 'other', coe_total: 90,
                            evaluations: { flavor: { flavors: [jasmine] } },
                        },
                    ],
                },
                {
                    id: 'c1', _type: 'cupping', shop_id: 's1', coe_total: 88, created_at: '2026-09-01',
                    evaluations: { flavor: { score: 6, flavors: ['x__l1-fruit', 'x__l1-fruit__l2-citrus', lemon] } },
                    observation: { aroma: { flavors: ['y__l1-floral', jasmine] } },
                },
                {
                    id: 'c2', _type: 'cupping', shop_id: 'other', coe_total: 85, created_at: '2026-09-02',
                    evaluations: { flavor: { flavors: [jasmine] } },
                },
            ],
        });

        const root = win.document.getElementById('app');
        await win.viewShopDetail(root, 's1');

        // 店家頁一定要帶旗標拉風味欄位，否則 chips 永遠是空的。
        expect(seen.some(p => p.startsWith('/api/records') && p.includes('withEvaluations=1'))).toBe(true);
        const chips = [...root.querySelectorAll('.shop-summary-flavors .detail-flavor-chip')]
            .map(el => el.textContent);
        // 檸檬：c1 + t1 + 場次的 cup1；茉莉：只有 c1（c2 / cup2 是別家店）
        expect(chips).toEqual(['檸檬 ×3', '茉莉 ×1']);
    });
});
