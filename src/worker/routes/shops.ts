import { Hono } from 'hono';
import type { AppEnv } from '../lib/auth';
import { requireAccess } from '../lib/auth';
import { withUser } from '../lib/users';
import type { Row } from '../lib/json';
import { rowToDto } from '../lib/json';

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

export default routes;
