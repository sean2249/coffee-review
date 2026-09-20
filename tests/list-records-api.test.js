import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// api.listRecords 的欄位選擇 + 店家頁的常見風味。summarizeRecords 讀的是
// r.evaluations / r.observation，listRecords 若沒 select 這兩欄，店家頁的風味
// chips 在正式環境永遠是空的（純函式測試抓不到，因為它直接餵完整的列）。
// 場次同理：店家頁把每一杯當一筆記錄，所以內嵌的 cups 也要拉這兩欄。
// 假 client 仿 PostgREST：只回 select 裡點名的欄位，內嵌表也照 select 投影。
const CLOUD = { url: 'https://example.supabase.co', anonKey: 'anon-key' };

let win, api;

// 只切最上層逗號：內嵌的 cups:table(a, b, c) 整段要留著交給下一層。
function splitCols(cols) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of cols) {
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
        else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

const EMBED_RE = /^(\w+):(\w+)\((.*)\)$/;

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
                    const cols = call.columns === '*' ? null : splitCols(call.columns);
                    const project = row => (cols ? Object.fromEntries(cols.map(c => {
                        const embed = EMBED_RE.exec(c);
                        if (!embed) return [c, row[c]];
                        const [, alias, childTable, childCols] = embed;
                        const keys = splitCols(childCols);
                        const children = (rowsByTable[childTable] || [])
                            .filter(child => child.session_id === row.id)
                            .map(child => Object.fromEntries(keys.map(k => [k, child[k]])));
                        return [alias, children];
                    })) : row);
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

// 三個查詢的欄位：杯測 / 品鑑是最上層欄位，場次的風味欄位在內嵌的 cups 裡。
function selectedColumns(calls) {
    const byTable = {};
    for (const c of calls) {
        if (c.table === 'cupping_records' || c.table === 'tasting_records') {
            byTable[c.table] = splitCols(c.columns);
        } else if (c.table === 'cupping_sessions') {
            const embed = splitCols(c.columns).map(col => EMBED_RE.exec(col)).find(Boolean);
            byTable.cups = embed ? splitCols(embed[3]) : [];
        }
    }
    return byTable;
}

beforeEach(async () => {
    ({ window: win } = await loadApp({ supabaseConfig: CLOUD }));
    win.setSessionUser({ id: 'u1' });
    api = win.eval('api');
});

describe('api.listRecords 欄位', () => {
    it('預設不拉 evaluations / observation（記錄列表、店家列表用不到）', async () => {
        const calls = useClient();
        await api.listRecords({ type: 'all' });
        const cols = selectedColumns(calls);
        expect(Object.keys(cols).sort()).toEqual(['cupping_records', 'cups', 'tasting_records']);
        for (const list of Object.values(cols)) {
            expect(list).not.toContain('evaluations');
            expect(list).not.toContain('observation');
        }
    });

    it('withEvaluations：杯測、品鑑、場次的杯都多拉 evaluations / observation', async () => {
        const calls = useClient();
        await api.listRecords({ type: 'all', withEvaluations: true });
        const cols = selectedColumns(calls);
        expect(Object.keys(cols).sort()).toEqual(['cupping_records', 'cups', 'tasting_records']);
        for (const list of Object.values(cols)) {
            expect(list).toEqual(expect.arrayContaining(['evaluations', 'observation']));
        }
    });
});

describe('viewShopDetail 常見風味', () => {
    it('從記錄與場次杯的 evaluations / observation 算出風味 chips（別家店的不算）', async () => {
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
            cupping_sessions: [
                { id: 'sess1', title: '日曬比較', session_date: '2026-09-04', created_at: '2026-09-04' },
            ],
            cupping_session_cups: [
                // 同一場裡兩杯掛在不同店家：只有 s1 那杯該進統計
                { id: 'cup1', session_id: 'sess1', code: 'A', position: 0, shop_id: 's1', coe_total: 86,
                    evaluations: { flavor: { flavors: [lemon] } } },
                { id: 'cup2', session_id: 'sess1', code: 'B', position: 1, shop_id: 'other', coe_total: 90,
                    evaluations: { flavor: { flavors: [jasmine] } } },
            ],
        });

        const root = win.document.getElementById('app');
        await win.viewShopDetail(root, 's1');

        expect(Object.keys(selectedColumns(calls)).sort()).toEqual(['cupping_records', 'cups', 'tasting_records']);
        const chips = [...root.querySelectorAll('.shop-summary-flavors .detail-flavor-chip')]
            .map(el => el.textContent);
        // 檸檬：c1 + t1 + 場次的 cup1；茉莉：只有 c1（c2 / cup2 是別家店）
        expect(chips).toEqual(['檸檬 ×3', '茉莉 ×1']);
    });
});
