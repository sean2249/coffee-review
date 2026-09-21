import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './auth';

// Supabase 的 RLS 換成「Worker 在每個 query 上寫 and user_id = ?」之後，
// 這裡是 auth.uid() 的唯一對應物：Access JWT 的 email -> users.id。
// 既有資料的 user_id 是 Supabase 的 UUID，遷移腳本會把同一組 UUID 灌進 users，
// 所以這個查詢對舊資料也對得上。
//
// 快取只活在單一 isolate 裡；email -> id 一旦建立就不會變，所以不需要失效機制。
const cache = new Map<string, string>();

export async function resolveUserId(db: D1Database, email: string): Promise<string> {
    const key = email.toLowerCase();
    const hit = cache.get(key);
    if (hit) return hit;

    const found = await db.prepare('select id from users where email = ?1').bind(email).first<{ id: string }>();
    if (found) {
        cache.set(key, found.id);
        return found.id;
    }

    // 第一次登入。on conflict do nothing + 重新 select，讓並行的第一個請求也收斂。
    const id = crypto.randomUUID();
    await db
        .prepare('insert into users (id, email) values (?1, ?2) on conflict (email) do nothing')
        .bind(id, email)
        .run();
    const row = await db.prepare('select id from users where email = ?1').bind(email).first<{ id: string }>();
    const resolved = row?.id ?? id;
    cache.set(key, resolved);
    return resolved;
}

/** requireAccess 之後接這個：把 c.get('email') 換成 c.get('userId')。 */
export const withUser: MiddlewareHandler<AppEnv> = async (c, next) => {
    c.set('userId', await resolveUserId(c.env.DB, c.get('email')));
    await next();
};
