import { badRequest } from './errors';
import type { Row, Table } from './json';
import { encodeJsonCols } from './json';

// 手寫 SQL，所以值一律走 ? 佔位符綁定，欄位名一律來自 lib/columns.ts 的常數陣列
// （永遠不會是前端字串）。舊碼有過 `(${ids.join(',')})` 這種字串拼接，不要重演。

export type Bind = string | number | null;

/** 取出白名單內、且前端有送的欄位，並把 JSON 欄位編碼成文字。 */
export function pick(table: Table, payload: unknown, cols: readonly string[]): Row {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw badRequest('body must be a JSON object');
    }
    const src = payload as Row;
    const out: Row = {};
    for (const col of cols) {
        if (col in src) out[col] = src[col];
    }
    try {
        return encodeJsonCols(table, out);
    } catch (e) {
        throw badRequest(e instanceof Error ? e.message : 'invalid payload');
    }
}

/** insert ... returning *。fixed 是 Worker 自己蓋上的欄位（id / user_id / …）。 */
export function insertStatement(db: D1Database, table: Table, values: Row): D1PreparedStatement {
    const cols = Object.keys(values);
    if (cols.length === 0) throw badRequest('nothing to insert');
    const placeholders = cols.map((_, i) => `?${i + 1}`).join(', ');
    return db
        .prepare(`insert into ${table} (${cols.join(', ')}) values (${placeholders}) returning *`)
        .bind(...(Object.values(values) as Bind[]));
}

/**
 * update ... where <scope> returning *。scope 一定包含擁有者條件——RLS 沒有了，
 * 這個 where 就是唯一的隔離。
 */
export function updateStatement(
    db: D1Database,
    table: Table,
    values: Row,
    scope: Row,
): D1PreparedStatement {
    const cols = Object.keys(values);
    if (cols.length === 0) throw badRequest('nothing to update');
    const scopeCols = Object.keys(scope);
    const set = cols.map((c, i) => `${c} = ?${i + 1}`).join(', ');
    const where = scopeCols.map((c, i) => `${c} = ?${cols.length + i + 1}`).join(' and ');
    return db
        .prepare(`update ${table} set ${set} where ${where} returning *`)
        .bind(...(Object.values(values) as Bind[]), ...(Object.values(scope) as Bind[]));
}

export const nowIso = (): string => new Date().toISOString();
