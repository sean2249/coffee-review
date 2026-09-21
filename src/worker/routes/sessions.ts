import { Hono } from 'hono';
import type { AppEnv } from '../lib/auth';
import { requireAccess } from '../lib/auth';
import { withUser } from '../lib/users';
import type { Row } from '../lib/json';
import { rowsToDto } from '../lib/json';

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

export default routes;
