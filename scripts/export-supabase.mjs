#!/usr/bin/env node
// 一次性：把 Supabase 的 coffee schema 原封不動匯出成 migration/dump.json。
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/export-supabase.mjs
//
// 需要 service role key（不是 anon key）：RLS 會擋掉其他人的列，而 auth.users
// 根本不在 PostgREST 暴露的 schema 裡。這把 key 只活在你本機這一次 shell 裡，
// 絕不進 repo、不進 GitHub Secrets、不進 .dev.vars。遷移完成後到 Supabase 輪替它。
//
// 輸出未經轉換的原始列 + 每張表的筆數，可重跑、可 diff。轉換在 import-d1.mjs。

import fs from 'node:fs';
import path from 'node:path';
import { TABLES } from '../src/shared/json-columns.js';

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
    console.error('請設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const PAGE = 1000;
const OUT = path.join('migration', 'dump.json');

const headers = {
    apikey: KEY,
    authorization: `Bearer ${KEY}`,
    // coffee schema 不是 public，PostgREST 需要明講。
    'accept-profile': 'coffee',
};

async function fetchTable(table) {
    const rows = [];
    for (let offset = 0; ; offset += PAGE) {
        const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*&order=id`, {
            headers: { ...headers, range: `${offset}-${offset + PAGE - 1}` },
        });
        if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
        const page = await res.json();
        rows.push(...page);
        if (page.length < PAGE) return rows;
    }
}

// users 取代 auth.users。用 Auth Admin API 拿 (id, email)，沿用原本的 UUID，
// 這樣既有資料的 user_id 一列都不用改。
async function fetchUsers() {
    const out = [];
    for (let page = 1; ; page += 1) {
        const res = await fetch(`${URL_BASE}/auth/v1/admin/users?per_page=${PAGE}&page=${page}`, { headers });
        if (!res.ok) throw new Error(`auth.users: ${res.status} ${await res.text()}`);
        const body = await res.json();
        const users = body.users ?? [];
        out.push(...users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at })));
        if (users.length < PAGE) return out;
    }
}

const tables = {};
for (const table of TABLES) {
    if (table === 'users') continue;
    tables[table] = await fetchTable(table);
    console.log(`${table}: ${tables[table].length}`);
}
tables.users = await fetchUsers();
console.log(`users: ${tables.users.length}`);

const counts = Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length]));
fs.mkdirSync('migration', { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ exportedAt: new Date().toISOString(), counts, tables }, null, 2)}\n`);
console.log(`\n→ ${OUT}`);
