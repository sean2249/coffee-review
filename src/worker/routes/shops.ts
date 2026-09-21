import { Hono } from 'hono';
import type { AppEnv } from '../lib/auth';
import { requireAccess } from '../lib/auth';
import { withUser } from '../lib/users';
import type { Row } from '../lib/json';
import { rowToDto } from '../lib/json';
import { SHOP_CREATE_COLS, SHOP_NOTE_COLS, SHOP_UPDATE_COLS } from '../lib/columns';
import { insertStatement, nowIso, pick, updateStatement } from '../lib/sql';
import { notFound } from '../lib/errors';

const routes = new Hono<AppEnv>();
routes.use('/api/shops', requireAccess, withUser);
routes.use('/api/shops/*', requireAccess, withUser);

// 店家是共享 registry：所有登入者都讀得到，所以這兩個查詢刻意沒有 user_id 條件。
routes.get('/api/shops', async (c) => {
    const { results } = await c.env.DB.prepare('select * from shops order by name').all<Row>();
    return c.json(results);
});

routes.get('/api/shops/:id', async (c) => {
    const row = await c.env.DB.prepare('select * from shops where id = ?1').bind(c.req.param('id')).first<Row>();
    return c.json(row ?? null);
});

// 我對這家店的筆記。每人每店一筆，完全私有。
routes.get('/api/shops/:id/note', async (c) => {
    const row = await c.env.DB.prepare('select * from shop_notes where shop_id = ?1 and user_id = ?2')
        .bind(c.req.param('id'), c.get('userId'))
        .first<Row>();
    return c.json(rowToDto('shop_notes', row));
});

// 店家頁的「從這家店的沖煮記錄帶入豆款」。去重與排除當前記錄留在前端。
routes.get('/api/shops/:id/beans', async (c) => {
    const { results } = await c.env.DB.prepare(
        `select id, bean_name, bean_type, origin, blend_composition, created_at
         from cupping_records where shop_id = ?1 and user_id = ?2 order by created_at desc`,
    )
        .bind(c.req.param('id'), c.get('userId'))
        .all<Row>();
    return c.json(results);
});

// 店家是 Google Places 的投影：name / location / lat / lng 只能來自 Places API，
// 所以這裡沒有「手動輸入」的路徑，白名單也不含任何自由欄位以外的東西。
// created_by 由 Worker 蓋上，前端送的一律忽略（它只是建立者註記，不參與存取控制）。
routes.post('/api/shops', async (c) => {
    const values = pick('shops', await c.req.json(), SHOP_CREATE_COLS);
    values.id = crypto.randomUUID();
    values.created_by = c.get('userId');
    const row = await insertStatement(c.env.DB, 'shops', values).first<Row>();
    return c.json(row, 201);
});

// 沒有擁有者條件是刻意的：店家共享，任何登入者都能更新——而更新的唯一路徑是
// 「從 Google 重新同步」，寫進去的值來自 Places API 而非使用者輸入（同舊的 RLS policy）。
routes.patch('/api/shops/:id', async (c) => {
    const values = pick('shops', await c.req.json(), SHOP_UPDATE_COLS);
    values.updated_at = nowIso();
    const row = await updateStatement(c.env.DB, 'shops', values, { id: c.req.param('id') }).first<Row>();
    if (!row) throw notFound('shop');
    return c.json(row);
});

// 只有建立者刪得掉；還有記錄掛著的店家會被 FK restrict 擋下（23503）。
routes.delete('/api/shops/:id', async (c) => {
    const res = await c.env.DB.prepare('delete from shops where id = ?1 and created_by = ?2')
        .bind(c.req.param('id'), c.get('userId'))
        .run();
    if (res.meta.changes === 0) throw notFound('shop');
    return c.body(null, 204);
});

// 每人每店一筆。unique 是 (shop_id, user_id)，而 user_id 綁的是 JWT 解析出來的人，
// 所以 conflict 只可能命中自己那一列，覆寫不到別人的筆記。
routes.put('/api/shops/:id/note', async (c) => {
    const shopId = c.req.param('id');
    const userId = c.get('userId');
    const values = pick('shop_notes', await c.req.json(), SHOP_NOTE_COLS);
    const cols = Object.keys(values);
    const all = ['id', 'shop_id', 'user_id', 'updated_at', ...cols];
    const binds = [crypto.randomUUID(), shopId, userId, nowIso(), ...Object.values(values)];
    const set = ['updated_at', ...cols].map((col) => `${col} = excluded.${col}`).join(', ');
    const row = await c.env.DB.prepare(
        `insert into shop_notes (${all.join(', ')}) values (${all.map((_, i) => `?${i + 1}`).join(', ')})
         on conflict (shop_id, user_id) do update set ${set}
         returning *`,
    )
        .bind(...(binds as (string | number | null)[]))
        .first<Row>();
    return c.json(rowToDto('shop_notes', row));
});

export default routes;
