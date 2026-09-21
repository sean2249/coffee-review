import { Hono } from 'hono';
import type { AppEnv } from '../lib/auth';
import { requireAccess } from '../lib/auth';
import { withUser } from '../lib/users';
import type { Row } from '../lib/json';
import { rowsToDto } from '../lib/json';
import { CUP_COLS, SESSION_COLS } from '../lib/columns';
import { nowIso, pick } from '../lib/sql';
import type { Bind } from '../lib/sql';
import { badRequest, notFound } from '../lib/errors';

const routes = new Hono<AppEnv>();
routes.use('/api/sessions/*', requireAccess, withUser);

// 場次 + 內嵌的杯（依 position 排好）。找不到回 200 null，對應原本的 maybeSingle()。
routes.get('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const userId = c.get('userId');
    const session = await c.env.DB.prepare('select * from cupping_sessions where id = ?1 and user_id = ?2')
        .bind(id, userId)
        .first<Row>();
    if (!session) return c.json(null);

    const cups = await c.env.DB.prepare(
        'select * from cupping_session_cups where session_id = ?1 and user_id = ?2 order by position',
    )
        .bind(id, userId)
        .all<Row>();
    return c.json({ ...session, cups: rowsToDto('cupping_session_cups', cups.results) });
});

/**
 * 新增與編輯共用。場次與杯的 id 都由前端產生，整個請求可以原封不動重送。
 *
 * 杯的寫法是「整批刪光、整批重插」，包在一個 D1 batch（= 一個隱含交易）裡。
 * SQLite 沒有 deferrable constraint，所以逐列 upsert 會在 A<->B 互換編號時撞到
 * unique(session_id, code)；刪光之後、插入之前不存在任何編號，這個問題就不存在。
 * 它同時涵蓋了舊版那個 `.not('id','in',…)` 步驟要處理的情況——上次存到一半寫進去、
 * 之後又被移除的杯。
 */
routes.put('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const userId = c.get('userId');
    const body = (await c.req.json()) as { session?: unknown; cups?: unknown };
    if (!Array.isArray(body.cups) || body.cups.length === 0) throw badRequest('cups must be a non-empty array');

    // 先驗編號再碰 DB：唯一使用者碰得到的碰撞在這裡就擋掉，錯誤碼沿用 23505，
    // 前端既有的處理不用改。大小寫敏感，與原本的 unique 一致。
    const codes = new Set<string>();
    for (const cup of body.cups as Record<string, unknown>[]) {
        const code = typeof cup.code === 'string' ? cup.code.trim() : '';
        if (!code) throw badRequest('every cup needs a code');
        if (codes.has(code)) throw badRequest(`duplicate cup code: ${code}`, '23505');
        codes.add(code);
    }

    const db = c.env.DB;
    // 這個 id 已經存在但不屬於我 -> 404。先擋掉，否則 batch 會在杯的複合 FK 上炸開，
    // 冒出來的是一個看不懂的 23503。
    const owner = await db
        .prepare('select user_id from cupping_sessions where id = ?1')
        .bind(id)
        .first<{ user_id: string }>();
    if (owner && owner.user_id !== userId) throw notFound('session');

    // 存活的杯保留原本的 created_at，不因為重存而被重設。
    const existing = await db
        .prepare('select id, created_at from cupping_session_cups where session_id = ?1 and user_id = ?2')
        .bind(id, userId)
        .all<{ id: string; created_at: string }>();
    const createdAt = new Map(existing.results.map((r) => [r.id, r.created_at]));

    const session = pick('cupping_sessions', body.session ?? {}, SESSION_COLS);
    const sessionCols = Object.keys(session);
    const sessionAll = ['id', 'user_id', ...sessionCols];
    // on conflict 分支上的 where 是上面那個預檢之外的第二道：無論如何都改不到
    // 別人的場次。insert 分支的 user_id 綁的是 JWT 解出來的人，body 裡的一律無效。
    const sessionSet = sessionCols.length
        ? sessionCols.map((col) => `${col} = excluded.${col}`).join(', ')
        : 'id = cupping_sessions.id';
    const statements: D1PreparedStatement[] = [
        db
            .prepare(
                `insert into cupping_sessions (${sessionAll.join(', ')})
                 values (${sessionAll.map((_, i) => `?${i + 1}`).join(', ')})
                 on conflict (id) do update set ${sessionSet}
                 where cupping_sessions.user_id = ?2`,
            )
            .bind(id, userId, ...(Object.values(session) as Bind[])),
        db.prepare('delete from cupping_session_cups where session_id = ?1 and user_id = ?2').bind(id, userId),
    ];

    (body.cups as Record<string, unknown>[]).forEach((cup, position) => {
        const values = pick('cupping_session_cups', cup, CUP_COLS);
        const cupId = typeof cup.id === 'string' && cup.id ? cup.id : crypto.randomUUID();
        const fixed = {
            id: cupId,
            session_id: id,
            user_id: userId,
            position,
            created_at: createdAt.get(cupId) ?? nowIso(),
            ...values,
        };
        const cols = Object.keys(fixed);
        statements.push(
            db
                .prepare(
                    `insert into cupping_session_cups (${cols.join(', ')})
                     values (${cols.map((_, i) => `?${i + 1}`).join(', ')})`,
                )
                .bind(...(Object.values(fixed) as Bind[])),
        );
    });

    await db.batch(statements);
    return c.body(null, 204);
});

routes.delete('/api/sessions/:id', async (c) => {
    // 杯的複合 FK 是 on delete cascade，場次刪了杯一起走。
    const res = await c.env.DB.prepare('delete from cupping_sessions where id = ?1 and user_id = ?2')
        .bind(c.req.param('id'), c.get('userId'))
        .run();
    if (res.meta.changes === 0) throw notFound('session');
    return c.body(null, 204);
});

export default routes;
