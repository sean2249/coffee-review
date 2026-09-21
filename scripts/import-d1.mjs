#!/usr/bin/env node
// 一次性：把 dump.json 轉成 migration/seed.sql，再交給 wrangler 灌進 D1。
//
//   node scripts/import-d1.mjs --local        # 先在本機演練
//   node scripts/import-d1.mjs --remote       # 正式
//   node scripts/import-d1.mjs --local --sql-only   # 只產 SQL，不執行
//
// 先跑 `wrangler d1 migrations apply coffee-review --local|--remote` 建好 schema。
// 產出可人工檢視的 SQL 而不是直接打 D1 API：同一份檔案先在本機套一次，確定沒問題
// 才對正式環境重放。全部 insert or replace，所以跑到一半斷掉可以直接重跑。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { JSON_ARRAY_COLS, JSON_OBJECT_COLS, TABLES, TIMESTAMP_COLS } from '../src/shared/json-columns.js';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const local = args.includes('--local');
const sqlOnly = args.includes('--sql-only');
if (remote === local) {
    console.error('請指定 --local 或 --remote（擇一）');
    process.exit(1);
}

const DUMP = args.find((a) => !a.startsWith('--')) ?? path.join('migration', 'dump.json');
const OUT = path.join('migration', 'seed.sql');
const BATCH = 50;

const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'));

const lit = (v) => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? '1' : '0';
    return `'${String(v).replace(/'/g, "''")}'`;
};

function transform(table, row) {
    const out = { ...row };
    for (const col of JSON_ARRAY_COLS[table] ?? []) {
        out[col] = JSON.stringify(Array.isArray(out[col]) ? out[col] : []);
    }
    for (const col of JSON_OBJECT_COLS[table] ?? []) {
        const v = out[col];
        out[col] = JSON.stringify(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    }
    for (const col of TIMESTAMP_COLS[table] ?? []) {
        // 正規化成 ISO-8601 UTC 帶毫秒與 Z。app.js 用 localeCompare 排序
        // created_at，Postgres 送出的 +08 偏移格式混進來就會排錯。
        if (out[col] === null || out[col] === undefined) continue;
        const at = new Date(out[col]);
        if (Number.isNaN(at.getTime())) throw new Error(`${table}.${col} 不是合法時間：${out[col]}`);
        out[col] = at.toISOString();
    }
    return out;
}

const statements = [];
for (const table of TABLES) {
    const rows = (dump.tables[table] ?? []).map((r) => transform(table, r));
    if (rows.length === 0) continue;
    // 每張表的欄位取自第一列：PostgREST 的 select=* 對同一張表永遠給同一組鍵。
    const cols = Object.keys(rows[0]);
    for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const values = chunk.map((r) => `(${cols.map((c) => lit(r[c])).join(', ')})`).join(',\n    ');
        statements.push(`insert or replace into ${table} (${cols.join(', ')}) values\n    ${values};`);
    }
    console.log(`${table}: ${rows.length}`);
}

fs.mkdirSync('migration', { recursive: true });
fs.writeFileSync(OUT, `-- 由 scripts/import-d1.mjs 產生，來源 ${DUMP}（${dump.exportedAt}）\n\n${statements.join('\n\n')}\n`);
console.log(`\n→ ${OUT}`);

if (sqlOnly) process.exit(0);

const flag = remote ? '--remote' : '--local';
execFileSync('npx', ['wrangler', 'd1', 'execute', 'coffee-review', flag, `--file=${OUT}`, '--yes'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
});
