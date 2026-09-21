import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// 存檔的編排（刪光哪些杯、編號互換、半截存檔的收斂）現在全在 Worker 的
// PUT /api/sessions/:id 裡，由 test/worker/write.test.ts 對真的 D1 驗證。
// 這裡只剩前端這一側的約定：打對的路徑與方法、position 依杯序、
// 以及 body 裡不得出現任何 user_id —— 擁有者由 Worker 從 Access 身分決定。

let win, api;

function stubApi(responses = {}) {
    const calls = [];
    win.apiFetch = (path, init = {}) => {
        calls.push({ path, method: init.method || 'GET', body: init.body });
        const key = Object.keys(responses).find(r => path.startsWith(r));
        return Promise.resolve(key ? responses[key] : null);
    };
    return calls;
}

beforeEach(async () => {
    ({ window: win } = await loadApp());
    win.setSessionUser({ id: 'u1' });
    api = win.eval('api');
});

const session = { session_date: '2026-09-20', title: '日曬比較', notes: null, code_style: 'letter', schema_version: 1 };
const cup = (id, code) => ({ id, code, shop_id: null, coe_total: null, coe_tier_id: null, evaluations: {}, observation: {} });

describe('api.saveSession', () => {
    it('PUT 整個場次與杯，一個請求', async () => {
        const calls = stubApi();
        await api.saveSession('s1', session, [cup('k1', 'A'), cup('k2', 'B')]);

        expect(calls).toHaveLength(1);
        expect(calls[0].path).toBe('/api/sessions/s1');
        expect(calls[0].method).toBe('PUT');
        expect(calls[0].body).toEqual({ session, cups: [cup('k1', 'A'), cup('k2', 'B')] });
    });

    it('杯序即 position：前端只送順序，編號由 Worker 依陣列索引寫入', async () => {
        const calls = stubApi();
        await api.saveSession('s1', session, [cup('k2', 'B'), cup('k1', 'A')]);
        expect(calls[0].body.cups.map(c => c.id)).toEqual(['k2', 'k1']);
    });

    // RLS 換成 Worker 端強制之後，這是「不信任 client」的前端側保證。
    it('body 裡沒有任何 user_id / created_at', async () => {
        const calls = stubApi();
        await api.saveSession('s1', session, [cup('k1', 'A')]);
        const json = JSON.stringify(calls[0].body);
        expect(json).not.toContain('user_id');
        expect(json).not.toContain('created_at');
    });

    it('id 會被 URL 編碼', async () => {
        const calls = stubApi();
        await api.saveSession('a/b', session, [cup('k1', 'A')]);
        expect(calls[0].path).toBe('/api/sessions/a%2Fb');
    });

    it('錯誤原樣往上丟，讓呼叫端顯示 toast', async () => {
        const boom = Object.assign(new Error('duplicate cup code: A'), { code: '23505' });
        win.apiFetch = () => Promise.reject(boom);
        await expect(api.saveSession('s1', session, [cup('k1', 'A')])).rejects.toBe(boom);
    });
});

describe('api.getSession / listRecords', () => {
    it('getSession 原樣回傳 Worker 已排好的杯', async () => {
        const calls = stubApi({
            '/api/sessions/s1': { id: 's1', cups: [{ id: 'k1', position: 0 }, { id: 'k2', position: 1 }] },
        });
        const s = await api.getSession('s1');
        expect(s.cups.map(c => c.id)).toEqual(['k1', 'k2']);
        expect(calls[0]).toMatchObject({ path: '/api/sessions/s1', method: 'GET' });
    });

    it('getSession 找不到時回 null', async () => {
        stubApi({ '/api/sessions': null });
        expect(await api.getSession('nope')).toBeNull();
    });

    it('deleteSession 用 DELETE', async () => {
        const calls = stubApi();
        await api.deleteSession('s1');
        expect(calls[0]).toMatchObject({ path: '/api/sessions/s1', method: 'DELETE' });
    });

    it('listRecords({ type: "session" }) 只是一個查詢字串', async () => {
        const calls = stubApi({ '/api/records': [{ id: 's1', _type: 'session', cups: [] }] });
        const rows = await api.listRecords({ type: 'session' });
        expect(calls[0].path).toBe('/api/records?type=session');
        expect(rows[0]._type).toBe('session');
    });
});
