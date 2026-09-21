import { env, SELF } from 'cloudflare:test';

// vitest.config.ts 的 DEV_USER_EMAIL；requireAccess 的 open 分支會解析成這個人。
export const OWNER_EMAIL = 'owner@example.com';
export const OWNER_ID = 'user-owner';
export const OTHER_ID = 'user-other';

// pool 不會在每個 test 之間重置 D1，所以每個 test 自己清乾淨。順序照 FK 相依。
// users 固定用同一組 id，resolveUserId 的 isolate 快取才不會指到已刪除的列。
export async function resetDb(): Promise<void> {
    await env.DB.batch([
        env.DB.prepare('delete from cupping_session_cups'),
        env.DB.prepare('delete from cupping_sessions'),
        env.DB.prepare('delete from shop_notes'),
        env.DB.prepare('delete from cupping_records'),
        env.DB.prepare('delete from tasting_records'),
        env.DB.prepare('delete from shops'),
        env.DB.prepare('delete from users'),
        env.DB.prepare('insert into users (id, email) values (?1, ?2)').bind(OWNER_ID, OWNER_EMAIL),
        env.DB.prepare('insert into users (id, email) values (?1, ?2)').bind(OTHER_ID, 'other@example.com'),
    ]);
}

export async function seedShop(id: string, name = '店', placeId = `place-${id}`): Promise<void> {
    await env.DB.prepare('insert into shops (id, name, google_place_id, created_by) values (?1, ?2, ?3, ?4)')
        .bind(id, name, placeId, OWNER_ID)
        .run();
}

type RecordSeed = {
    id: string;
    userId?: string;
    shopId?: string | null;
    createdAt?: string;
    extra?: Record<string, string | number | null>;
};

export async function seedRecord(
    table: 'cupping_records' | 'tasting_records',
    { id, userId = OWNER_ID, shopId = null, createdAt = '2026-01-01T00:00:00.000Z', extra = {} }: RecordSeed,
): Promise<void> {
    const cols = ['id', 'user_id', 'shop_id', 'created_at', ...Object.keys(extra)];
    const vals = [id, userId, shopId, createdAt, ...Object.values(extra)];
    await env.DB.prepare(
        `insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => `?${i + 1}`).join(', ')})`,
    )
        .bind(...vals)
        .run();
}

export async function seedSession(id: string, userId = OWNER_ID, createdAt = '2026-01-02T00:00:00.000Z'): Promise<void> {
    await env.DB.prepare('insert into cupping_sessions (id, user_id, created_at, title) values (?1, ?2, ?3, ?4)')
        .bind(id, userId, createdAt, `場次 ${id}`)
        .run();
}

export async function seedCup(
    id: string,
    sessionId: string,
    code: string,
    position: number,
    userId = OWNER_ID,
    extra: Record<string, string | number | null> = {},
): Promise<void> {
    const cols = ['id', 'session_id', 'user_id', 'code', 'position', ...Object.keys(extra)];
    const vals = [id, sessionId, userId, code, position, ...Object.values(extra)];
    await env.DB.prepare(
        `insert into cupping_session_cups (${cols.join(', ')}) values (${cols.map((_, i) => `?${i + 1}`).join(', ')})`,
    )
        .bind(...vals)
        .run();
}

export function api(path: string, init?: RequestInit): Promise<Response> {
    return SELF.fetch(`http://app.test${path}`, init);
}

export async function getJson<T>(path: string): Promise<T> {
    const res = await api(path);
    if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
}
