// D1 沒有陣列與 jsonb：這些欄位在 SQLite 裡是存 JSON 文字的 text。
//
// Worker（src/worker/lib/json.ts）依這份清單在讀寫時轉換 JSON 文字。

const RECORD_ARRAYS = ['defects_tags', 'tag_ids'];
const RECORD_OBJECTS = ['evaluations', 'observation'];

export const JSON_ARRAY_COLS = {
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

export const JSON_OBJECT_COLS = {
    cupping_records: RECORD_OBJECTS,
    tasting_records: RECORD_OBJECTS,
    cupping_session_cups: RECORD_OBJECTS,
    shop_notes: ['ambience_axes', 'service_ratings'],
};

// timestamptz -> text 的欄位。遷移時一律正規化成 ISO-8601 UTC 帶毫秒與 Z：
// app.js 用 localeCompare 排序 created_at，格式一混就排錯。
export const TIMESTAMP_COLS = {
    users: ['created_at'],
    shops: ['created_at', 'updated_at', 'google_data_fetched_at'],
    cupping_records: ['created_at'],
    tasting_records: ['created_at'],
    cupping_sessions: ['created_at'],
    cupping_session_cups: ['created_at'],
    shop_notes: ['created_at', 'updated_at'],
    tags: ['created_at'],
};

// 匯出與寫入的順序：FK 相依。
export const TABLES = [
    'users',
    'shops',
    'tags',
    'cupping_records',
    'tasting_records',
    'cupping_sessions',
    'cupping_session_cups',
    'shop_notes',
];
