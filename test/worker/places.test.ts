import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../src/worker/index';
import type { Env } from '../../src/worker/env';
import { resetDb } from './helpers';

// 直接呼叫 worker.fetch（而不是 SELF.fetch），這樣 stub 的 global fetch 就和
// Worker 在同一個 isolate 裡，攔得到它打給 Google 的那一次。
const call = (path: string, init?: RequestInit, overrides: Partial<Env> = {}) =>
    worker.fetch(
        new Request(`http://app.test${path}`, init),
        { ...env, ...overrides } as Env,
        {} as ExecutionContext,
    );

const post = (path: string, body: unknown, overrides?: Partial<Env>) =>
    call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, overrides);

beforeEach(resetDb);
afterEach(() => vi.unstubAllGlobals());

function stubGoogle(payload: unknown, status = 200): ReturnType<typeof vi.fn> {
    const spy = vi.fn(async () => new Response(JSON.stringify(payload), { status }));
    vi.stubGlobal('fetch', spy);
    return spy;
}

describe('POST /api/places/search', () => {
    it('攤平 displayName 與 location，並帶上 key 與 field mask', async () => {
        const spy = stubGoogle({
            places: [
                {
                    id: 'place-1',
                    displayName: { text: '某某咖啡', languageCode: 'zh-TW' },
                    formattedAddress: '台北市…',
                    location: { latitude: 25.03, longitude: 121.5 },
                },
            ],
        });

        const res = await post('/api/places/search', { query: '某某咖啡' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            places: [
                {
                    id: 'place-1',
                    displayName: '某某咖啡',
                    formattedAddress: '台北市…',
                    location: { lat: 25.03, lng: 121.5 },
                },
            ],
        });

        const [url, init] = spy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
        const headers = init.headers as Record<string, string>;
        expect(headers['X-Goog-Api-Key']).toBe('test-places-key');
        expect(headers['X-Goog-FieldMask']).toContain('places.location');
        expect(JSON.parse(init.body as string)).toMatchObject({ textQuery: '某某咖啡', maxResultCount: 5 });
    });

    it('空的 query 是 400，且完全沒打 Google', async () => {
        const spy = stubGoogle({});
        expect((await post('/api/places/search', { query: '   ' })).status).toBe(400);
        expect(spy).not.toHaveBeenCalled();
    });

    it('過長的 query 是 400', async () => {
        stubGoogle({});
        expect((await post('/api/places/search', { query: 'x'.repeat(201) })).status).toBe(400);
    });

    it('Google 出錯時回 502，錯誤內容不轉給瀏覽器', async () => {
        stubGoogle({ error: { message: 'API key not valid: AIzaSyFAKE' } }, 403);
        const res = await post('/api/places/search', { query: '咖啡' });
        expect(res.status).toBe(502);
        expect(JSON.stringify(await res.json())).not.toContain('AIzaSy');
    });

    it('沒設定 key 時回 503', async () => {
        const spy = stubGoogle({});
        const res = await post('/api/places/search', { query: '咖啡' }, { GOOGLE_MAPS_API_KEY: '' });
        expect(res.status).toBe(503);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('GET /api/places/:placeId', () => {
    it('回單一地點，形狀與搜尋一致', async () => {
        const spy = stubGoogle({
            id: 'place-1',
            displayName: { text: '某某咖啡' },
            formattedAddress: '台北市…',
            location: { latitude: 25.03, longitude: 121.5 },
        });

        const res = await call('/api/places/place-1');
        expect(await res.json()).toEqual({
            id: 'place-1',
            displayName: '某某咖啡',
            formattedAddress: '台北市…',
            location: { lat: 25.03, lng: 121.5 },
        });
        expect((spy.mock.calls[0] as [string])[0]).toContain('/v1/places/place-1');
    });

    it('沒有 location 的地點不會炸開', async () => {
        stubGoogle({ id: 'place-1', displayName: { text: '某店' } });
        const body = (await (await call('/api/places/place-1')).json()) as Record<string, unknown>;
        expect(body.location).toBeNull();
        expect(body.formattedAddress).toBeNull();
    });

    it('奇怪的 place id 擋在打 Google 之前', async () => {
        const spy = stubGoogle({});
        expect((await call('/api/places/..%2Fsecret')).status).toBe(400);
        expect(spy).not.toHaveBeenCalled();
    });
});
