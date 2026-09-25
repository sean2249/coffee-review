import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../lib/auth';
import { requireAccess } from '../lib/auth';
import { withUser } from '../lib/users';
import { badRequest, readJson } from '../lib/errors';

// Google Places 的代理。key 從此不再進瀏覽器——遷移前它是靠 HTTP referrer 限制
// 保護的，而 referrer 是瀏覽器自願送出的標頭、可任意偽造，不是安全邊界。
//
// 這兩個端點在 requireAccess 之後，所以不是開放 proxy；但它們是唯一會真的產生
// Google 帳單的路徑，所以再加 user 維度的 rate limit。帳單的硬底線是 Google Cloud
// Console 上的每日配額上限，程式碼擋不住的最後一道在那裡。
const MAX_QUERY_LENGTH = 200;
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location';
const DETAIL_MASK = 'id,displayName,formattedAddress,location';

type GooglePlace = {
    id?: string;
    displayName?: { text?: string } | string;
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
};

const routes = new Hono<AppEnv>();
routes.use('/api/places/*', requireAccess, withUser, async (c, next) => {
    const { success } = await c.env.PLACES_LIMITER.limit({ key: c.get('userId') });
    if (!success) throw new HTTPException(429, { message: 'Google 搜尋太頻繁，請稍候再試' });
    await next();
});

routes.post('/api/places/search', async (c) => {
    const body = (await readJson(c)) as { query?: unknown };
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) throw badRequest('query is required');
    if (query.length > MAX_QUERY_LENGTH) throw badRequest('query too long');

    const res = await callGoogle(c.env.GOOGLE_MAPS_API_KEY, 'https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Goog-FieldMask': FIELD_MASK },
        body: JSON.stringify({ textQuery: query, maxResultCount: 5, languageCode: 'zh-TW' }),
    });
    const data = (await res.json()) as { places?: GooglePlace[] };
    return c.json({ places: (data.places ?? []).map(flatten) });
});

routes.get('/api/places/:placeId', async (c) => {
    const placeId = c.req.param('placeId');
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(placeId)) throw badRequest('invalid place id');

    const res = await callGoogle(
        c.env.GOOGLE_MAPS_API_KEY,
        `https://places.googleapis.com/v1/places/${placeId}?languageCode=zh-TW`,
        { headers: { 'X-Goog-FieldMask': DETAIL_MASK } },
    );
    return c.json(flatten((await res.json()) as GooglePlace));
});

async function callGoogle(apiKey: string, url: string, init: RequestInit): Promise<Response> {
    if (!apiKey) throw new HTTPException(503, { message: 'Google Places 尚未設定' });
    const res = await fetch(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), 'X-Goog-Api-Key': apiKey },
        signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
        // Google 的錯誤內容可能含 key 的線索，不要原樣轉給瀏覽器。
        console.error('places api failed', res.status, await res.text());
        throw new HTTPException(502, { message: `Google Places 回應 ${res.status}` });
    }
    return res;
}

// REST 回的 displayName 是 { text, languageCode }、location 是 { latitude, longitude }。
// 攤平成 JS SDK 的形狀（字串 + { lat, lng }），app.js 的取值路徑就一行都不用改。
function flatten(p: GooglePlace): Record<string, unknown> {
    return {
        id: p.id ?? null,
        displayName: typeof p.displayName === 'string' ? p.displayName : (p.displayName?.text ?? null),
        formattedAddress: p.formattedAddress ?? null,
        location:
            p.location && typeof p.location.latitude === 'number'
                ? { lat: p.location.latitude, lng: p.location.longitude ?? null }
                : null,
    };
}

export default routes;
