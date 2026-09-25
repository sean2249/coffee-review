#!/usr/bin/env node
// 遷移驗收。任何一項不過就非零退出。
//
//   node scripts/verify-migration.mjs --local
//   node scripts/verify-migration.mjs --remote
//
// 涵蓋：筆數、JSON 欄位合法性、JSON 值抽樣深度比對、user_id 孤兒、時間格式、
// 以及編號的大小寫碰撞探測（舊的 unique 區分大小寫，前端驗證不分）。
// 人工的部分見 README：開 #/records 對筆數，各開一個場次 / 有筆記的店 / 有風味輪的記錄。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { JSON_ARRAY_COLS, JSON_OBJECT_COLS, TABLES, TIMESTAMP_COLS } from '../src/shared/json-columns.js';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const local = args.includes('--local');
if (remote === local) {
    console.error('請指定 --local 或 --remote（擇一）');
    process.exit(1);
}
const flag = remote ? '--remote' : '--local';
const dump = JSON.parse(fs.readFileSync(path.join('migration', 'dump.json'), 'utf8'));

// 一個查詢一次 wrangler 呼叫。
//
// 必須走 --command 而不是 --file：--file 對 --remote 會走 /import 端點，回的是
// 「執行了幾條、讀了幾列」的摘要而不是查詢結果，每個欄位都會變成 undefined。
// 而 --command 帶空白的 SQL 在 Windows 上又不能用 shell:true（shell 會把它拆散），
// 所以直接用 node 執行 wrangler 的入口，完全不經過 shell。
const WRANGLER = path.join('node_modules', 'wrangler', 'bin', 'wrangler.js');
function query(sql) {
    const out = execFileSync(
        process.execPath,
        [WRANGLER, 'd1', 'execute', 'coffee-review', flag, '--json', `--command=${sql}`],
        { encoding: 'utf8' },
    );
    // wrangler 會在 JSON 前面印橫幅，從第一個 [ 開始解析。
    const results = JSON.parse(out.slice(out.indexOf('[')))[0].results;
    if (!Array.isArray(results)) throw new Error(`預期查詢結果，但拿到：${out.slice(0, 200)}`);
    return results;
}

let failures = 0;
const check = (name, ok, detail = '') => {
    if (ok) {
        console.log(`  ✓ ${name}`);
    } else {
        failures += 1;
        console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    }
};

console.log('1. 筆數');
for (const table of TABLES) {
    const expected = dump.counts[table] ?? 0;
    const actual = query(`select count(*) as n from ${table}`)[0].n;
    check(`${table}: ${actual}`, actual === expected, `dump 是 ${expected}`);
}

console.log('2. JSON 欄位合法性');
for (const table of TABLES) {
    const cols = [...(JSON_ARRAY_COLS[table] ?? []), ...(JSON_OBJECT_COLS[table] ?? [])];
    for (const col of cols) {
        const bad = query(`select count(*) as n from ${table} where json_valid(${col}) = 0`)[0].n;
        check(`${table}.${col}`, bad === 0, `${bad} 列不是合法 JSON`);
    }
}

console.log('3. JSON 值抽樣比對（每欄 20 列）');
for (const table of TABLES) {
    const cols = [...(JSON_ARRAY_COLS[table] ?? []), ...(JSON_OBJECT_COLS[table] ?? [])];
    if (cols.length === 0) continue;
    const source = new Map((dump.tables[table] ?? []).map((r) => [r.id, r]));
    const rows = query(`select id, ${cols.join(', ')} from ${table} order by id limit 20`);
    for (const row of rows) {
        const before = source.get(row.id);
        if (!before) {
            check(`${table}/${row.id}`, false, 'dump 裡找不到這一列');
            continue;
        }
        for (const col of cols) {
            const expected = before[col] ?? (JSON_ARRAY_COLS[table]?.includes(col) ? [] : {});
            const actual = JSON.parse(row[col]);
            check(
                `${table}.${col}/${row.id}`,
                JSON.stringify(actual) === JSON.stringify(expected),
                `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
            );
        }
    }
}

console.log('4. user_id 孤兒');
for (const table of ['cupping_records', 'tasting_records', 'cupping_sessions', 'cupping_session_cups', 'shop_notes']) {
    const n = query(
        `select count(*) as n from ${table} where user_id is not null and user_id not in (select id from users)`,
    )[0].n;
    check(table, n === 0, `${n} 列的 user_id 在 users 裡不存在`);
}

console.log('5. 時間格式（一律 ISO-8601 UTC 帶 Z）');
for (const [table, cols] of Object.entries(TIMESTAMP_COLS)) {
    for (const col of cols) {
        const n = query(`select count(*) as n from ${table} where ${col} is not null and ${col} not like '%Z'`)[0].n;
        check(`${table}.${col}`, n === 0, `${n} 列不是 Z 結尾`);
    }
}

console.log('6. 杯編號的大小寫碰撞探測');
// 舊的 unique(session_id, code) 區分大小寫，前端驗證不分。確認實際資料裡沒有
// 只差大小寫的編號，否則兩邊的認知不一致就會在下一次存檔時爆出來。
const dupes = query(
    `select count(*) as n from (
        select session_id, lower(code) from cupping_session_cups group by 1, 2 having count(*) > 1
     )`,
)[0].n;
check('沒有只差大小寫的編號', dupes === 0, `${dupes} 組碰撞`);

console.log(failures === 0 ? '\n全部通過' : `\n${failures} 項未通過`);
process.exit(failures === 0 ? 0 : 1);
