import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// apiFetch 是前端唯一的網路出口。這裡鎖住兩件在正式環境才會出現、但出錯就很難查的事：
// 需要重新登入時的自動重載只能做一次，以及 Access 的 302 必須偵測得到。

let win;
beforeEach(async () => {
    ({ window: win } = await loadApp());
    win.sessionStorage.clear();
});

// jsdom 沒有 fetch；app.js 呼叫的是全域的那個，所以直接掛上去。
function stubFetch(response) {
    const calls = [];
    win.fetch = (path, init) => {
        calls.push({ path, init });
        return Promise.resolve(response);
    };
    return calls;
}

const jsonResponse = (status, payload, extra = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    type: 'basic',
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(payload),
    ...extra,
});

describe('shouldReloadForAuth', () => {
    it('第一次准、第二次擋（否則 Worker 持續 401 時會無限重載）', () => {
        expect(win.shouldReloadForAuth()).toBe(true);
        expect(win.shouldReloadForAuth()).toBe(false);
        expect(win.shouldReloadForAuth()).toBe(false);
    });

    it('拿到身分後清掉記號，下一次真的過期還能自動重載', () => {
        expect(win.shouldReloadForAuth()).toBe(true);
        win.clearAuthReloadMark();
        expect(win.shouldReloadForAuth()).toBe(true);
    });

    it('sessionStorage 不可用時一律不重載，寧可讓使用者自己按', () => {
        win.eval(`Object.defineProperty(window, 'sessionStorage', {
            configurable: true,
            get() { throw new Error('blocked'); },
        })`);
        expect(win.shouldReloadForAuth()).toBe(false);
    });
});

describe('apiFetch 的認證分支', () => {
    for (const status of [401, 403]) {
        it(`${status} 丟出 session_expired，而且只重載一次`, async () => {
            stubFetch(jsonResponse(status, { error: 'nope' }));
            let reloads = 0;
            win.shouldReloadForAuth = () => {
                reloads += 1;
                return reloads === 1;
            };
            await expect(win.apiFetch('/api/me')).rejects.toThrow('session_expired');
            await expect(win.apiFetch('/api/me')).rejects.toThrow('session_expired');
            expect(reloads).toBe(2);   // 每次都問，但只有第一次會拿到 true
        });
    }

    // Access 的 302 是跨來源的：預設的 redirect: 'follow' 會讓 fetch 跟過去，然後
    // 因為沒有 CORS 標頭而 reject 成 TypeError，根本偵測不到。manual 才看得見。
    it('送出 redirect: manual，並把 opaqueredirect 當成需要重新登入', async () => {
        const calls = stubFetch({ type: 'opaqueredirect', status: 0, ok: false, headers: { get: () => null } });
        win.shouldReloadForAuth = () => false;
        await expect(win.apiFetch('/api/records')).rejects.toThrow('session_expired');
        expect(calls[0].init.redirect).toBe('manual');
        expect(calls[0].init.credentials).toBe('same-origin');
    });
});

describe('apiFetch 的回應處理', () => {
    it('204 回 null', async () => {
        stubFetch({ status: 204, ok: true, type: 'basic', headers: { get: () => null } });
        expect(await win.apiFetch('/api/records/cupping/r1', { method: 'DELETE' })).toBeNull();
    });

    it('錯誤帶上 Worker 轉譯的 SQLSTATE 與狀態碼', async () => {
        stubFetch(jsonResponse(409, { error: 'shop exists', code: '23505' }));
        await win.apiFetch('/api/shops', { method: 'POST', body: {} }).then(
            () => { throw new Error('should have rejected'); },
            (e) => {
                expect(e.message).toBe('shop exists');
                expect(e.code).toBe('23505');
                expect(e.status).toBe(409);
            },
        );
    });

    it('回應不是 JSON 時退回 statusText，不會再丟一個解析錯誤', async () => {
        stubFetch({
            status: 500,
            ok: false,
            type: 'basic',
            statusText: 'Internal Server Error',
            headers: { get: () => 'text/plain' },
            json: () => Promise.reject(new SyntaxError('boom')),
        });
        await expect(win.apiFetch('/api/records')).rejects.toThrow('Internal Server Error');
    });

    it('只有帶 body 時才送 content-type', async () => {
        const calls = stubFetch(jsonResponse(200, []));
        await win.apiFetch('/api/shops');
        await win.apiFetch('/api/shops', { method: 'POST', body: { name: 'x' } });
        expect(calls[0].init.headers['content-type']).toBeUndefined();
        expect(calls[0].init.body).toBeUndefined();
        expect(calls[1].init.headers['content-type']).toBe('application/json');
        expect(calls[1].init.body).toBe('{"name":"x"}');
    });
});
