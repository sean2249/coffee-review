// 陣列與 jsonb 欄位的編解碼。欄位清單在 src/shared/json-columns.js，與一次性
// 遷移腳本共用。編解碼只發生在這裡：Worker 回給前端的形狀與 PostgREST 完全相同
//（陣列就是陣列、物件就是物件），所以 app.js 讀 record.defects_tags /
// note.facilities 完全不用改。
import { JSON_ARRAY_COLS as ARRAYS, JSON_OBJECT_COLS as OBJECTS } from '../../shared/json-columns.js';

export type Table =
    | 'shops'
    | 'cupping_records'
    | 'tasting_records'
    | 'cupping_sessions'
    | 'cupping_session_cups'
    | 'shop_notes'
    | 'tags'
    | 'users';

export type Row = Record<string, unknown>;

type ColMap = Partial<Record<Table, readonly string[]>>;
export const JSON_ARRAY_COLS: ColMap = ARRAYS;
export const JSON_OBJECT_COLS: ColMap = OBJECTS;

/** D1 的一列 -> 給前端的物件。讀取端永不 throw：壞掉的值退回空陣列 / 空物件。 */
export function rowToDto<T extends Row>(table: Table, row: T | null): T | null {
    if (!row) return null;
    const out: Row = { ...row };
    for (const col of JSON_ARRAY_COLS[table] ?? []) {
        if (col in out) out[col] = parseOr(out[col], []);
    }
    for (const col of JSON_OBJECT_COLS[table] ?? []) {
        if (col in out) out[col] = parseOr(out[col], {});
    }
    return out as T;
}

export function rowsToDto<T extends Row>(table: Table, rows: T[]): T[] {
    return rows.map((r) => rowToDto(table, r) as T);
}

/** 前端送來的 payload -> 可寫進 D1 的值。型別不對就是 400，不要悄悄接受。 */
export function encodeJsonCols(table: Table, payload: Row): Row {
    const out: Row = { ...payload };
    for (const col of JSON_ARRAY_COLS[table] ?? []) {
        if (!(col in out)) continue;
        const v = out[col];
        if (v === null || v === undefined) out[col] = '[]';
        else if (Array.isArray(v)) out[col] = JSON.stringify(v);
        else throw new TypeError(`${col} must be an array`);
    }
    for (const col of JSON_OBJECT_COLS[table] ?? []) {
        if (!(col in out)) continue;
        const v = out[col];
        if (v === null || v === undefined) out[col] = '{}';
        else if (typeof v === 'object' && !Array.isArray(v)) out[col] = JSON.stringify(v);
        else throw new TypeError(`${col} must be an object`);
    }
    return out;
}

function parseOr(value: unknown, fallback: unknown): unknown {
    if (typeof value !== 'string') return value ?? fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}
