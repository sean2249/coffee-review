// D1 沒有陣列與 jsonb，那些欄位在 SQLite 裡是存 JSON 文字的 text。編解碼只發生
// 在這裡：Worker 回給前端的形狀與 PostgREST 完全相同（陣列就是陣列、物件就是
// 物件），所以 app.js 讀 record.defects_tags / note.facilities 完全不用改。
//
// 遷移腳本 import 同一份清單，不要另外複製一份。

export type Table =
    | 'shops'
    | 'cupping_records'
    | 'tasting_records'
    | 'cupping_sessions'
    | 'cupping_session_cups'
    | 'shop_notes'
    | 'tags'
    | 'users';

const RECORD_ARRAYS = ['defects_tags', 'tag_ids'];
const RECORD_OBJECTS = ['evaluations', 'observation'];

export const JSON_ARRAY_COLS: Partial<Record<Table, readonly string[]>> = {
    cupping_records: RECORD_ARRAYS,
    tasting_records: RECORD_ARRAYS,
    // 杯刻意沒有 tag_ids（與線上 schema 一致）。
    cupping_session_cups: ['defects_tags'],
    shop_notes: [
        'facilities',
        'space_materials',
        'menu_food',
        'drink_types',
        'legacy_atmosphere_tags',
        'legacy_decor_tags',
        'legacy_service_tags',
    ],
};

export const JSON_OBJECT_COLS: Partial<Record<Table, readonly string[]>> = {
    cupping_records: RECORD_OBJECTS,
    tasting_records: RECORD_OBJECTS,
    cupping_session_cups: RECORD_OBJECTS,
    shop_notes: ['ambience_axes', 'service_ratings'],
};

export type Row = Record<string, unknown>;

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
