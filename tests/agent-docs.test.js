import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 給 agent 讀的文件用函式 / 常數名稱指路，不寫行號：app.js 一改行號就全歪了，
// 而且沒人會發現（#169 的回顧裡三個 app.js:<行號> 全指錯）。

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const agentDocs = [
    'CLAUDE.md',
    'CODING_STANDARDS.md',
    ...fs.readdirSync(path.join(root, 'docs', 'agents'))
        .filter(f => f.endsWith('.md'))
        .map(f => path.join('docs', 'agents', f)),
];

// 檔名.副檔名 接 :12、:L12、#L12（含 12-20 這種範圍的開頭）。
const LINE_POINTER = /\b[\w-]+\.(?:m?js|ts|tsx|html|css|sql|jsonc?)(?::L?|#L)\d+/g;
const lineHits = text => text.match(LINE_POINTER) || [];

describe('行號指標的樣式', () => {
    it.each([
        'app.js:257', '(app.js:1290)', 'public/app.js:12', 'index.ts:8', 'styles.css:1', 'app.js:12-20',
        'app.js:L12', 'sw.js#L12', 'dev-worktree.mjs:16', '0001_init.sql:40', 'wrangler.jsonc:5', 'index.tsx:4',
    ])('抓得到 %s', s => {
        expect(lineHits(s)).toHaveLength(1);
    });

    it.each(['localhost:8787', 'node:fs', '`renderRoute` in `app.js`', 'http://localhost:8787/#/records'])('不誤抓 %s', s => {
        expect(lineHits(s)).toEqual([]);
    });
});

describe('agent docs point by name, not by line number', () => {
    it.each(agentDocs)('%s', file => {
        const hits = lineHits(fs.readFileSync(path.join(root, file), 'utf8'));
        expect(hits, `use a function or constant name instead of ${hits.join(', ')}`).toEqual([]);
    });
});
