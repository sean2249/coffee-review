// 一個 worktree 一套本機開發環境：.dev.vars、本機 D1、專屬 port。port 由 worktree 路徑
// 算出來（固定、各 worktree 不同），不同 origin → service worker 快取與 session 不互相污染。
//
//   npm run dev:worktree              準備好就啟動 wrangler dev
//   npm run dev:worktree -- --setup   只準備（Claude 的預覽工具接著用 .claude/launch.json 啟動）
//
// .dev.vars 與 .claude/launch.json 已存在就不動（兩者都在 .gitignore 裡）。
import { execSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// realpath.native：同一個資料夾用不同大小寫的路徑進來，也要算出同一個 port。
const root = fs.realpathSync.native(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const port = 8800 + (createHash('sha1').update(root).digest().readUInt16BE(0) % 200);

const devVars = path.join(root, '.dev.vars');
if (!fs.existsSync(devVars)) {
    fs.copyFileSync(path.join(root, '.dev.vars.example'), devVars);
    console.log('建立 .dev.vars（複製自 .dev.vars.example）');
}

execSync('npm run db:migrate:local', { cwd: root, stdio: 'inherit' });

const launch = path.join(root, '.claude', 'launch.json');
if (!fs.existsSync(launch)) {
    fs.mkdirSync(path.dirname(launch), { recursive: true });
    fs.writeFileSync(launch, JSON.stringify({
        version: '0.0.1',
        configurations: [{
            name: 'coffee-review',
            runtimeExecutable: 'npx',
            runtimeArgs: ['wrangler', 'dev', '--port', String(port)],
            port,
        }],
    }, null, 2) + '\n');
    console.log('建立 .claude/launch.json');
}

console.log(`這個 worktree 的 port：${port} → http://localhost:${port}`);

if (!process.argv.includes('--setup')) {
    spawn('npx', ['wrangler', 'dev', '--port', String(port)], { cwd: root, stdio: 'inherit' })
        .on('exit', code => process.exit(code ?? 0));
}
