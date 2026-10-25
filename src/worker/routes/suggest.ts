import { Hono } from 'hono';
import type { AppEnv } from '../lib/auth';
import { requireAccess } from '../lib/auth';
import { withUser } from '../lib/users';

const routes = new Hono<AppEnv>();
// Hono 的 `/api/suggest/*` 也匹配 `/api/suggest` 本身；不要再加第二個 use，
// 否則 requireAccess / withUser 會跑兩次。
routes.use('/api/suggest/*', requireAccess, withUser);

// 表單 datalist 的既有值：多張表 union 後去頭尾空白、不分大小寫去重，依使用次數
// 由多到少排序（同次數依值）。每一段都帶 user_id = ?1，只看自己的資料。
// trim(null) <> '' 是 null，所以 null 自然被排除。
const ranked = (sources: Array<[table: string, column: string]>) =>
    `select value from (
        ${sources
            .map(([table, column]) =>
                `select trim(${column}) as value from ${table} where user_id = ?1 and trim(${column}) <> ''`)
            .join(' union all ')}
     ) group by value collate nocase
     order by count(*) desc, value collate nocase`;

const LISTS: Record<string, Array<[string, string]>> = {
    origins: [['cupping_records', 'origin'], ['cupping_session_cups', 'origin']],
    processes: [['cupping_records', 'process'], ['cupping_session_cups', 'process']],
    methods: [['cupping_records', 'method']],
    beans: [
        ['cupping_records', 'bean_name'],
        ['tasting_records', 'bean_name'],
        ['cupping_session_cups', 'bean_name'],
    ],
    items: [['tasting_records', 'item_ordered']],
};

routes.get('/api/suggest', async (c) => {
    const userId = c.get('userId');
    const keys = Object.keys(LISTS);
    const results = await c.env.DB.batch<{ value: string }>(
        keys.map((k) => c.env.DB.prepare(ranked(LISTS[k])).bind(userId)),
    );
    return c.json(Object.fromEntries(keys.map((k, i) => [k, results[i].results.map((r) => r.value)])));
});

export default routes;
