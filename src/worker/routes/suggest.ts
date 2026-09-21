import { Hono } from 'hono';
import type { AppEnv } from '../lib/auth';
import { requireAccess } from '../lib/auth';
import { withUser } from '../lib/users';

const routes = new Hono<AppEnv>();
routes.use('/api/suggest/*', requireAccess, withUser);

// 表單 datalist 的既有值。原本是前端拉 2000 列再自己去重（還附了一則「資料長大
// 就改用 DISTINCT view」的註解）；改寫成 SQL 之後那個顧慮就不存在了。
const distinct = (table: string, column: string) =>
    `select distinct trim(${column}) as value from ${table}
     where user_id = ?1 and ${column} is not null and trim(${column}) <> ''
     order by value`;

routes.get('/api/suggest/origins', async (c) => {
    const { results } = await c.env.DB.prepare(distinct('cupping_records', 'origin'))
        .bind(c.get('userId'))
        .all<{ value: string }>();
    return c.json({ items: results.map((r) => r.value) });
});

routes.get('/api/suggest/items', async (c) => {
    const { results } = await c.env.DB.prepare(distinct('tasting_records', 'item_ordered'))
        .bind(c.get('userId'))
        .all<{ value: string }>();
    return c.json({ items: results.map((r) => r.value) });
});

export default routes;
