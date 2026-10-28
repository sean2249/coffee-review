import { Hono } from 'hono';
import type { AppEnv } from '../lib/auth';
import { requireAccess } from '../lib/auth';
import { withUser } from '../lib/users';
import type { Row } from '../lib/json';
import { rowToDto, rowsToDto } from '../lib/json';
import { BREW_PLAN_COLS } from '../lib/columns';
import { insertStatement, nowIso, pick, updateStatement } from '../lib/sql';
import { badRequest, notFound, readJson } from '../lib/errors';

const routes = new Hono<AppEnv>();
// Hono 的 `/api/brew-plans/*` 也匹配 `/api/brew-plans` 本身；只寫一個 use。
routes.use('/api/brew-plans/*', requireAccess, withUser);

routes.get('/api/brew-plans', async (c) => {
    const { results } = await c.env.DB.prepare(
        'select * from brew_plans where user_id = ?1 order by updated_at desc',
    )
        .bind(c.get('userId'))
        .all<Row>();
    return c.json(rowsToDto('brew_plans', results));
});

// 找不到（含別人的）回 200 null，與其他 fetch-by-id 端點一致。
routes.get('/api/brew-plans/:id', async (c) => {
    const row = await c.env.DB.prepare('select * from brew_plans where id = ?1 and user_id = ?2')
        .bind(c.req.param('id'), c.get('userId'))
        .first<Row>();
    return c.json(rowToDto('brew_plans', row));
});

routes.post('/api/brew-plans', async (c) => {
    const body = normalizePlan(await readJson(c), { partial: false });
    const values = pick('brew_plans', body, BREW_PLAN_COLS);
    values.id = crypto.randomUUID();
    values.user_id = c.get('userId');
    const row = await insertStatement(c.env.DB, 'brew_plans', values).first<Row>();
    return c.json(rowToDto('brew_plans', row), 201);
});

routes.patch('/api/brew-plans/:id', async (c) => {
    const body = normalizePlan(await readJson(c), { partial: true });
    const values = pick('brew_plans', body, BREW_PLAN_COLS);
    // 先檢查再蓋 updated_at，否則「什麼都沒送」會變成一次只改時間的更新。
    if (Object.keys(values).length === 0) throw badRequest('nothing to update');
    values.updated_at = nowIso();
    const row = await updateStatement(c.env.DB, 'brew_plans', values, {
        id: c.req.param('id'),
        user_id: c.get('userId'),
    }).first<Row>();
    if (!row) throw notFound('brew plan');
    return c.json(rowToDto('brew_plans', row));
});

routes.delete('/api/brew-plans/:id', async (c) => {
    const res = await c.env.DB.prepare('delete from brew_plans where id = ?1 and user_id = ?2')
        .bind(c.req.param('id'), c.get('userId'))
        .run();
    if (res.meta.changes === 0) throw notFound('brew plan');
    return c.body(null, 204);
});

/**
 * 驗證並正規化前端送來的計劃。規則都在這裡，不在 CHECK（docs/adr/0001）。
 * 必須在 pick() 之前做：pick 會把 steps JSON.stringify，之後就看不到形狀。
 * partial（PATCH）時沒送的欄位不檢查；有送就照同樣的規則。
 */
function normalizePlan(payload: unknown, { partial }: { partial: boolean }): Row {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw badRequest('body must be a JSON object');
    }
    const out: Row = { ...(payload as Row) };
    if (!partial) {
        for (const key of ['name', 'dose_g', 'water_temp', 'steps']) {
            if (!(key in out)) throw badRequest(`${key} is required`);
        }
    }
    if ('name' in out) {
        if (typeof out.name !== 'string' || out.name.trim() === '') throw badRequest('name is required');
        const name = out.name.trim();
        if (textLength(name) > 40) throw badRequest('name must be at most 40 characters');
        out.name = name;
    }
    if ('description' in out) out.description = optionalText(out.description, 'description', 500);
    if ('dripper' in out) out.dripper = optionalText(out.dripper, 'dripper');
    if ('grind' in out) out.grind = optionalText(out.grind, 'grind');
    if ('dose_g' in out && (!inRange(out.dose_g, 0, 100) || out.dose_g === 0)) {
        throw badRequest('dose_g must be a number in (0, 100]');
    }
    if ('water_temp' in out && !inRange(out.water_temp, 0, 100)) {
        throw badRequest('water_temp must be a number in [0, 100]');
    }
    if ('steps' in out) out.steps = normalizeSteps(out.steps);
    return out;
}

function normalizeSteps(value: unknown): Row[] {
    if (!Array.isArray(value) || value.length === 0) throw badRequest('steps must be a non-empty array');
    if (value.length > 30) throw badRequest('steps must have at most 30 items');
    const steps = value.map((raw: unknown, i) => normalizeStep(raw, i));

    // 第一步一定是注水，所以至少有一注，悶蒸也只會在 steps[0]。
    // 每一步存自己的秒數與本次水量（docs/adr/0003），沒有順序要比；總水量照舊 ≤ 2000。
    if (steps[0].type !== 'pour') throw badRequest('steps[0] must be a pour');
    let total = 0;
    steps.forEach((step, i) => {
        if (step.type !== 'pour') return;
        if (step.bloom && i !== 0) throw badRequest('only the first pour can be a bloom');
        total += step.water_g as number;
    });
    if (total > 2000) throw badRequest('total water_g must be at most 2000');
    return steps;
}

// 只留該型別的鍵，其他（含另一型別的鍵）丟掉；選填鍵只在有值時寫。
function normalizeStep(raw: unknown, i: number): Row {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw badRequest(`steps[${i}] must be an object`);
    const step = raw as Row;
    const note = optionalText(step.note, `steps[${i}].note`, 100);
    const noteKey = note === null ? {} : { note };
    if (step.type !== 'pour' && step.type !== 'wait') throw badRequest(`steps[${i}].type must be 'pour' or 'wait'`);
    if (!isSeconds(step.seconds)) throw badRequest(`steps[${i}].seconds must be an integer in [1, 600]`);
    if (step.type === 'wait') return { type: 'wait', seconds: step.seconds, ...noteKey };
    if (!inRange(step.water_g, 0, 2000) || step.water_g === 0) throw badRequest(`steps[${i}].water_g must be in (0, 2000]`);
    if (step.bloom !== undefined && typeof step.bloom !== 'boolean') throw badRequest(`steps[${i}].bloom must be a boolean`);
    const temp = step.water_temp ?? null;
    if (temp !== null && !inRange(temp, 0, 100)) throw badRequest(`steps[${i}].water_temp must be in [0, 100]`);
    return {
        type: 'pour',
        seconds: step.seconds,
        water_g: step.water_g,
        ...(step.bloom === true ? { bloom: true } : {}),
        ...(temp === null ? {} : { water_temp: temp }),
        ...noteKey,
    };
}

// 選填文字：trim，空字串存 null。
function optionalText(value: unknown, field: string, max?: number): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') throw badRequest(`${field} must be a string`);
    const trimmed = value.trim();
    if (max !== undefined && textLength(trimmed) > max) throw badRequest(`${field} must be at most ${max} characters`);
    return trimmed === '' ? null : trimmed;
}

// 字數用 code point 算，與 SQLite length() 一致：emoji 不會被 UTF-16 算成兩個字。
const textLength = (s: string): number => [...s].length;

const isSeconds = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 600;

const inRange = (v: unknown, min: number, max: number): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export default routes;
