import { Hono } from 'hono';
import type { AppEnv } from '../lib/auth';
import { requireAccess } from '../lib/auth';
import { withUser } from '../lib/users';
import { badRequest } from '../lib/errors';
import type { Row, Table } from '../lib/json';
import { rowToDto, rowsToDto } from '../lib/json';
import { recordCols } from '../lib/columns';
import { insertStatement, pick, updateStatement } from '../lib/sql';
import { notFound } from '../lib/errors';

export type RecordTable = Extract<Table, 'cupping_records' | 'tasting_records'>;

export const recordTable = (type: string): RecordTable => {
    if (type === 'tasting') return 'tasting_records';
    if (type === 'cupping') return 'cupping_records';
    throw badRequest(`unknown record type: ${type}`);
};

const routes = new Hono<AppEnv>();
routes.use('/api/records', requireAccess, withUser);
routes.use('/api/records/*', requireAccess, withUser);

// 取代前端三個平行查詢 + 前端合併。欄位投影必須與舊的 PostgREST select 逐字相同：
// 列表卡片只認這些鍵，而 evaluations / observation 體積大，只有店家頁的常見風味
// 需要，所以維持 withEvaluations 旗標。
routes.get('/api/records', async (c) => {
    const type = c.req.query('type') ?? 'all';
    if (!['all', 'cupping', 'tasting', 'session'].includes(type)) {
        throw badRequest(`unknown record type: ${type}`);
    }
    const withEvaluations = c.req.query('withEvaluations') === '1';
    const userId = c.get('userId');
    const db = c.env.DB;

    const flavour = withEvaluations ? ', evaluations, observation' : '';
    const base = `id, shop_id, coe_total, coe_tier_id, created_at${flavour}`;
    const tasks: Promise<Row[]>[] = [];

    if (type === 'all' || type === 'cupping') {
        tasks.push(
            db
                .prepare(
                    `select ${base}, bean_name, origin from cupping_records
                     where user_id = ?1 order by created_at desc`,
                )
                .bind(userId)
                .all<Row>()
                .then((r) => tag(rowsToDto('cupping_records', r.results), 'cupping')),
        );
    }
    if (type === 'all' || type === 'tasting') {
        tasks.push(
            db
                .prepare(
                    `select ${base}, visit_date, item_ordered, bean_name from tasting_records
                     where user_id = ?1 order by created_at desc`,
                )
                .bind(userId)
                .all<Row>()
                .then((r) => tag(rowsToDto('tasting_records', r.results), 'tasting')),
        );
    }
    if (type === 'all' || type === 'session') {
        tasks.push(listSessionsWithCups(db, userId, flavour));
    }

    const merged = (await Promise.all(tasks)).flat();
    // 與舊版相同的排序：字串比較，所以 created_at 的格式必須一致（見 migration 註解）。
    merged.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
    return c.json(merged);
});

routes.get('/api/records/:type/:id', async (c) => {
    const table = recordTable(c.req.param('type'));
    const row = await c.env.DB.prepare(`select * from ${table} where id = ?1 and user_id = ?2`)
        .bind(c.req.param('id'), c.get('userId'))
        .first<Row>();
    // 找不到回 200 null，對應原本的 .maybeSingle()：前端已經處理 null，
    // 不必為了 404 在 app.js 多一層狀態碼判斷。
    return c.json(rowToDto(table, row));
});

// 杯測場次沒有自己的店家 / 分數：卡片、篩選、店家頁都靠內嵌的杯摘要。
async function listSessionsWithCups(db: D1Database, userId: string, flavour: string): Promise<Row[]> {
    const sessions = await db
        .prepare(
            `select id, title, session_date, created_at from cupping_sessions
             where user_id = ?1 order by created_at desc`,
        )
        .bind(userId)
        .all<Row>();
    if (sessions.results.length === 0) return [];

    const cups = await db
        .prepare(
            `select session_id, id, code, position, shop_id, bean_name, coe_total, coe_tier_id${flavour}
             from cupping_session_cups where user_id = ?1 order by position`,
        )
        .bind(userId)
        .all<Row>();

    const bySession = new Map<string, Row[]>();
    for (const raw of cups.results) {
        const { session_id: sessionId, ...cup } = raw;
        const list = bySession.get(String(sessionId));
        if (list) list.push(rowToDto('cupping_session_cups', cup) as Row);
        else bySession.set(String(sessionId), [rowToDto('cupping_session_cups', cup) as Row]);
    }
    return sessions.results.map((s) => ({
        ...s,
        cups: bySession.get(String(s.id)) ?? [],
        _type: 'session',
    }));
}

// id / user_id / created_at 由 Worker 蓋上。前端不再送 user_id（stampUserId 已刪），
// 但就算送了也會被白名單濾掉。
routes.post('/api/records/:type', async (c) => {
    const table = recordTable(c.req.param('type'));
    const values = pick(table, await c.req.json(), recordCols(table));
    values.id = crypto.randomUUID();
    values.user_id = c.get('userId');
    const row = await insertStatement(c.env.DB, table, values).first<Row>();
    return c.json(rowToDto(table, row), 201);
});

routes.patch('/api/records/:type/:id', async (c) => {
    const table = recordTable(c.req.param('type'));
    const values = pick(table, await c.req.json(), recordCols(table));
    const row = await updateStatement(c.env.DB, table, values, {
        id: c.req.param('id'),
        user_id: c.get('userId'),
    }).first<Row>();
    if (!row) throw notFound('record');
    return c.json(rowToDto(table, row));
});

routes.delete('/api/records/:type/:id', async (c) => {
    const table = recordTable(c.req.param('type'));
    const res = await c.env.DB.prepare(`delete from ${table} where id = ?1 and user_id = ?2`)
        .bind(c.req.param('id'), c.get('userId'))
        .run();
    if (res.meta.changes === 0) throw notFound('record');
    return c.body(null, 204);
});

function tag(rows: Row[], type: string): Row[] {
    return rows.map((r) => ({ ...r, _type: type }));
}

export default routes;
