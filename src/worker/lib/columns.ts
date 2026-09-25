// 每張表允許前端寫入的欄位。白名單而非黑名單：id / user_id / created_by /
// created_at / session_id / position 一律由 Worker 決定，前端送來也會被丟掉。
// 這是 RLS 消失之後「不信任 client」的第一道，trigger 與 where user_id = ? 是後兩道。
//
// 新增欄位時這裡也要加，否則會被靜靜忽略——與 README 的 schema 一起改。

export const SHOP_CREATE_COLS = [
    'name',
    'location',
    'google_place_id',
    'lat',
    'lng',
    'google_data_fetched_at',
] as const;

// google_place_id 刻意不在更新白名單裡：店家身分不可變（DB trigger 是第二道）。
export const SHOP_UPDATE_COLS = ['name', 'location', 'lat', 'lng', 'google_data_fetched_at'] as const;

export const CUPPING_COLS = [
    'shop_id',
    'title',
    'bean_name',
    'bean_type',
    'origin',
    'process',
    'blend_composition',
    'roast',
    'grind',
    'water_temp',
    'ratio',
    'method',
    'extraction_time',
    'defects',
    'defects_tags',
    'notes',
    'coe_total',
    'coe_tier_id',
    'evaluations',
    'observation',
    'tag_ids',
    'schema_version',
] as const;

export const TASTING_COLS = [
    'shop_id',
    'title',
    'visit_date',
    'item_ordered',
    'price',
    'bean_name',
    'bean_type',
    'brewing_method',
    'defects',
    'defects_tags',
    'notes',
    'coe_total',
    'coe_tier_id',
    'evaluations',
    'observation',
    'tag_ids',
    'schema_version',
] as const;

export const SESSION_COLS = ['session_date', 'title', 'notes', 'code_style', 'schema_version'] as const;

// 杯刻意沒有 tag_ids（與線上 schema 一致）。id / session_id / position 由 Worker 管。
export const CUP_COLS = [
    'code',
    'shop_id',
    'bean_name',
    'bean_type',
    'origin',
    'process',
    'blend_composition',
    'roast',
    'defects',
    'defects_tags',
    'notes',
    'coe_total',
    'coe_tier_id',
    'evaluations',
    'observation',
    'schema_version',
] as const;

export const SHOP_NOTE_COLS = [
    'intro',
    'ambience_axes',
    'facilities',
    'space_style',
    'space_materials',
    'service_ratings',
    'menu_food',
    'drink_types',
    'ambience_notes',
    'style_notes',
    'service_notes',
    'legacy_atmosphere_tags',
    'legacy_decor_tags',
    'legacy_service_tags',
    'schema_version',
] as const;

export const recordCols = (table: 'cupping_records' | 'tasting_records'): readonly string[] =>
    table === 'tasting_records' ? TASTING_COLS : CUPPING_COLS;
