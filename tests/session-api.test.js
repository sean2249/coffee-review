import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// api.saveSession / getSession / listRecords 的杯測場次部分。用假 Supabase client
// 記錄每一次呼叫，鎖住：寫入順序（場次 upsert → 刪掉表單裡已沒有的杯 → 所有杯一次 upsert）、
// user_id 由 api 層補、position 依杯序、以及新場次寫杯失敗時的清理。
const CLOUD = { url: 'https://example.supabase.co', anonKey: 'anon-key' };

let win, api;

function fakeClient(responses = {}) {
    const calls = [];
    const client = {
        from(table) {
            const call = { table, op: null, payload: null, options: null, filters: [] };
            calls.push(call);
            const b = {
                select(cols) { if (!call.op) call.op = 'select'; call.columns = cols; return b; },
                upsert(payload, options) { call.op = 'upsert'; call.payload = payload; call.options = options; return b; },
                delete() { call.op = 'delete'; return b; },
                eq(col, v) { call.filters.push(['eq', col, v]); return b; },
                in(col, v) { call.filters.push(['in', col, v]); return b; },
                not(col, op, v) { call.filters.push(['not', col, op, v]); return b; },
                order(col, opts) { call.order = [col, opts]; return b; },
                maybeSingle() { call.single = true; return b; },
                then(resolve, reject) {
                    const r = responses[`${table}:${call.op}`];
                    const out = typeof r === 'function' ? r(call) : (r || { data: null, error: null });
                    return Promise.resolve(out).then(resolve, reject);
                },
            };
            return b;
        },
    };
    return { client, calls };
}

beforeEach(async () => {
    ({ window: win } = await loadApp({ supabaseConfig: CLOUD }));
    win.setSessionUser({ id: 'u1' });
    api = win.eval('api');
});

function useClient(responses) {
    const fake = fakeClient(responses);
    win.ensureSupabase = () => Promise.resolve(fake.client);
    return fake.calls;
}

const session = { session_date: '2026-09-20', title: '日曬比較', notes: null, code_style: 'letter', schema_version: 1 };
const cup = (id, code) => ({ id, code, shop_id: null, coe_total: null, coe_tier_id: null, evaluations: {}, observation: {} });

describe('api.saveSession', () => {
    it('先 upsert 場次，刪掉不在表單裡的杯，再一次 upsert 所有杯（補 user_id / session_id / position）', async () => {
        const calls = useClient();
        await api.saveSession('s1', session, [cup('k1', 'A'), cup('k2', 'B')], { isNew: true });

        expect(calls.map(c => `${c.table}:${c.op}`)).toEqual([
            'cupping_sessions:upsert',
            'cupping_session_cups:delete',
            'cupping_session_cups:upsert',
        ]);
        const [s, d, c] = calls;
        // 以伺服器現況比對：這個場次裡 id 不在表單清單的杯都刪
        expect(d.filters).toEqual([['eq', 'session_id', 's1'], ['not', 'id', 'in', '(k1,k2)']]);
        expect(s.options).toEqual({ onConflict: 'id' });
        expect(s.payload).toEqual({ ...session, id: 's1', user_id: 'u1' });
        expect(s.payload).not.toHaveProperty('created_at');

        expect(c.options).toEqual({ onConflict: 'id' });
        expect(c.payload.map(r => [r.id, r.code, r.session_id, r.user_id, r.position])).toEqual([
            ['k1', 'A', 's1', 'u1', 0],
            ['k2', 'B', 's1', 'u1', 1],
        ]);
        // 每杯 key 集合一致，upsert 才不會把缺的欄位補成 null
        const keys = c.payload.map(r => Object.keys(r).sort().join(','));
        expect(new Set(keys).size).toBe(1);
    });

    it('編輯：只留表單裡的杯（刪除限定在這個場次）', async () => {
        const calls = useClient();
        await api.saveSession('s1', session, [cup('k2', 'A')]);
        expect(calls[1].filters).toEqual([['eq', 'session_id', 's1'], ['not', 'id', 'in', '(k2)']]);
        expect(calls[2].payload.map(r => [r.id, r.position])).toEqual([['k2', 0]]);
    });

    it('刪杯失敗就停下，不 upsert 杯', async () => {
        const boom = { message: 'rls' };
        const calls = useClient({ 'cupping_session_cups:delete': { data: null, error: boom } });
        await expect(api.saveSession('s1', session, [cup('k1', 'A')])).rejects.toBe(boom);
        expect(calls.map(c => `${c.table}:${c.op}`)).toEqual([
            'cupping_sessions:upsert',
            'cupping_session_cups:delete',
        ]);
    });

    it('新場次寫杯失敗：刪掉剛建的場次（cascade 清杯）並把原錯誤丟出', async () => {
        const boom = { message: 'duplicate key' };
        const calls = useClient({ 'cupping_session_cups:upsert': { data: null, error: boom } });
        await expect(api.saveSession('s1', session, [cup('k1', 'A')], { isNew: true })).rejects.toBe(boom);
        expect(calls.map(c => `${c.table}:${c.op}`)).toEqual([
            'cupping_sessions:upsert',
            'cupping_session_cups:delete',
            'cupping_session_cups:upsert',
            'cupping_sessions:delete',
        ]);
        expect(calls[3].filters).toEqual([['eq', 'id', 's1']]);
    });

    it('編輯時寫杯失敗：不刪場次', async () => {
        const boom = { message: 'network' };
        const calls = useClient({ 'cupping_session_cups:upsert': { data: null, error: boom } });
        await expect(api.saveSession('s1', session, [cup('k1', 'A')])).rejects.toBe(boom);
        expect(calls.some(c => c.table === 'cupping_sessions' && c.op === 'delete')).toBe(false);
    });

    it('場次 upsert 失敗就停下，不碰杯', async () => {
        const boom = { message: 'rls' };
        const calls = useClient({ 'cupping_sessions:upsert': { data: null, error: boom } });
        await expect(api.saveSession('s1', session, [cup('k1', 'A')], { isNew: true })).rejects.toBe(boom);
        expect(calls).toHaveLength(1);
    });
});

describe('api.getSession / listRecords', () => {
    it('getSession 內嵌杯並依 position 排序', async () => {
        const calls = useClient({
            'cupping_sessions:select': {
                data: { id: 's1', cups: [{ id: 'k2', position: 1 }, { id: 'k1', position: 0 }] },
                error: null,
            },
        });
        const s = await api.getSession('s1');
        expect(s.cups.map(c => c.id)).toEqual(['k1', 'k2']);
        expect(calls[0].columns).toContain('cups:cupping_session_cups(*)');
        expect(calls[0].single).toBe(true);
    });

    it('getSession 找不到時回 null', async () => {
        useClient({ 'cupping_sessions:select': { data: null, error: null } });
        expect(await api.getSession('nope')).toBeNull();
    });

    it('listRecords({ type: "session" }) 標記 _type 並排好內嵌的杯', async () => {
        const calls = useClient({
            'cupping_sessions:select': {
                data: [{ id: 's1', created_at: '2026-09-01', cups: [{ code: 'B', position: 1 }, { code: 'A', position: 0 }] }],
                error: null,
            },
        });
        const rows = await api.listRecords({ type: 'session' });
        expect(calls.map(c => c.table)).toEqual(['cupping_sessions']);
        expect(rows).toHaveLength(1);
        expect(rows[0]._type).toBe('session');
        expect(rows[0].cups.map(c => c.code)).toEqual(['A', 'B']);
    });

    it('listRecords({ type: "all" }) 也會查杯測場次', async () => {
        const calls = useClient({
            'cupping_records:select': { data: [], error: null },
            'tasting_records:select': { data: [], error: null },
            'cupping_sessions:select': { data: [], error: null },
        });
        await api.listRecords({ type: 'all' });
        expect(calls.map(c => c.table).sort()).toEqual(['cupping_records', 'cupping_sessions', 'tasting_records']);
    });
});
