import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// api.listRecords 的欄位選擇 + 店家頁的常見風味。summarizeRecords 讀的是
// r.evaluations / r.observation，listRecords 若沒 select 這兩欄，店家頁的風味
// chips 在正式環境永遠是空的（純函式測試抓不到，因為它直接餵完整的列）。
// 假 client 仿 PostgREST：只回 select 裡點名的欄位。
const CLOUD = { url: 'https://example.supabase.co', anonKey: 'anon-key' };

let win, api;

function fakeClient(rowsByTable = {}) {
    const calls = [];
    const client = {
        from(table) {
            const call = { table, columns: null, filters: [] };
            calls.push(call);
            const b = {
                select(cols) { call.columns = cols; return b; },
                eq(col, v) { call.filters.push(['eq', col, v]); return b; },
                order() { return b; },
                maybeSingle() { call.single = true; return b; },
                then(resolve, reject) {
                    const cols = call.columns === '*' ? null : call.columns.split(',').map(s => s.trim());
                    const project = row => (cols ? Object.fromEntries(cols.map(c => [c, row[c]])) : row);
                    const rows = (rowsByTable[table] || [])
                        .filter(row => call.filters.every(([, col, v]) => row[col] === v))
                        .map(project);
                    const data = call.single ? (rows[0] ?? null) : rows;
                    return Promise.resolve({ data, error: null }).then(resolve, reject);
                },
            };
            return b;
        },
    };
    return { client, calls };
}

function useClient(rowsByTable) {
    const fake = fakeClient(rowsByTable);
    win.ensureSupabase = () => Promise.resolve(fake.client);
    return fake.calls;
}

const columnsOf = call => call.columns.split(',').map(s => s.trim());
const recordSelects = calls => calls.filter(c => c.table === 'cupping_records' || c.table === 'tasting_records');

beforeEach(async () => {
    ({ window: win } = await loadApp({ supabaseConfig: CLOUD }));
    win.setSessionUser({ id: 'u1' });
    api = win.eval('api');
});

describe('api.listRecords 欄位', () => {
    it('預設不拉 evaluations / observation（記錄列表、店家列表用不到）', async () => {
        const calls = useClient();
        await api.listRecords({ type: 'all' });
        const selects = recordSelects(calls);
        expect(selects.map(c => c.table).sort()).toEqual(['cupping_records', 'tasting_records']);
        for (const c of selects) {
            expect(columnsOf(c)).not.toContain('evaluations');
            expect(columnsOf(c)).not.toContain('observation');
        }
    });

    it('withEvaluations：杯測、品鑑都多拉 evaluations / observation', async () => {
        const calls = useClient();
        await api.listRecords({ type: 'all', withEvaluations: true });
        const selects = recordSelects(calls);
        expect(selects).toHaveLength(2);
        for (const c of selects) {
            expect(columnsOf(c)).toEqual(expect.arrayContaining(['evaluations', 'observation']));
        }
    });
});

describe('viewShopDetail 常見風味', () => {
    it('從記錄的 evaluations / observation 算出風味 chips（別家店的不算）', async () => {
        const lemon = 'x__l1-fruit__l2-citrus__l3-檸檬';
        const jasmine = 'y__l1-floral__l2-茉莉';
        const calls = useClient({
            shops: [{ id: 's1', name: '測試咖啡' }],
            cupping_records: [
                { id: 'c1', shop_id: 's1', coe_total: 88, created_at: '2026-09-01',
                    evaluations: { flavor: { score: 6, flavors: ['x__l1-fruit', 'x__l1-fruit__l2-citrus', lemon] } },
                    observation: { aroma: { flavors: ['y__l1-floral', jasmine] } } },
                { id: 'c2', shop_id: 'other', coe_total: 85, created_at: '2026-09-02',
                    evaluations: { flavor: { flavors: [jasmine] } } },
            ],
            tasting_records: [
                { id: 't1', shop_id: 's1', coe_total: 84, created_at: '2026-09-03',
                    observation: { aroma: { flavors: [lemon] } } },
            ],
        });

        const root = win.document.getElementById('app');
        await win.viewShopDetail(root, 's1');

        expect(recordSelects(calls)).toHaveLength(2);
        const chips = [...root.querySelectorAll('.shop-summary-flavors .detail-flavor-chip')]
            .map(el => el.textContent);
        expect(chips).toEqual(['檸檬 ×2', '茉莉 ×1']);
    });
});
