import { Hono } from 'hono';
import type { AppEnv } from './lib/auth';
import { requireAccess } from './lib/auth';
import { withUser } from './lib/users';
import { onError } from './lib/errors';
import placeRoutes from './routes/places';
import recordRoutes from './routes/records';
import sessionRoutes from './routes/sessions';
import shopRoutes from './routes/shops';
import suggestRoutes from './routes/suggest';

const app = new Hono<AppEnv>();
app.onError(onError);

// 刻意沒有免認證的端點（連 /api/health 都沒有）：那會是唯一能讓未認證流量
// 喚起 Worker 的入口。Access 在邊緣就擋下其餘所有請求。
app.get('/api/me', requireAccess, withUser, (c) =>
    c.json({
        auth: c.get('auth'),
        user_id: c.get('userId'),
        email: c.get('email'),
        // 前端的 isGoogleMapsReady() 改讀這個旗標，key 本身留在 Worker。
        placesEnabled: !!c.env.GOOGLE_MAPS_API_KEY,
        app: c.env.APP_NAME,
    }),
);

app.route('/', placeRoutes);
app.route('/', recordRoutes);
app.route('/', sessionRoutes);
app.route('/', shopRoutes);
app.route('/', suggestRoutes);

app.notFound((c) => c.json({ error: 'not found' }, 404));

export default app satisfies ExportedHandler<AppEnv['Bindings']>;
