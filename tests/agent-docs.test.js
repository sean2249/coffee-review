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

describe('agent docs point by name, not by line number', () => {
    it.each(agentDocs)('%s', file => {
        const text = fs.readFileSync(path.join(root, file), 'utf8');
        const hits = text.match(/\b[\w-]+\.(?:js|ts|html|css):\d+/g) || [];
        expect(hits, `use a function or constant name instead of ${hits.join(', ')}`).toEqual([]);
    });
});
