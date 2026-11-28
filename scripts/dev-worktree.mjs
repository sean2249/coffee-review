// 一個 worktree 一套本機開發環境：.dev.vars、本機 D1、專屬 port。port 由 worktree 路徑
// 算出來（固定、各 worktree 不同），不同 origin → service worker 快取與 session 不互相污染。
//
//   npm run dev:worktree              準備好就啟動 wrangler dev
//   npm run dev:worktree -- --setup   只準備（Claude 的預覽工具接著用 .claude/launch.json 啟動）
//
// .dev.vars 與 .claude/launch.json 已存在就不動（兩者都在 .gitignore 裡）。launch.json 裡已經有
// coffee-review 設定時，沿用它交給 wrangler 的 --port，npm script 和預覽工具才會開在同一個 port。
import { execSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_NAME = 'coffee-review';

// realpath.native：同一個資料夾用不同大小寫的路徑進來，也要算出同一個 port。
// 10000–10999：避開 8787（wrangler 預設）、9229（Node inspector）這些常用 port。
const root = fs.realpathSync.native(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const derivedPort = 10000 + (createHash('sha1').update(root).digest().readUInt16BE(0) % 1000);

const wranglerArgs = p => ['wrangler', 'dev', '--port', String(p)];
const isPort = v => Number.isInteger(v) && v > 0 && v < 65536;
const launchPath = path.join(root, '.claude', 'launch.json');

// 既有的 launch.json：預覽工具實際跑的是 runtimeArgs 的 --port，等的是 port 欄位；兩個要一樣。
function portFromLaunch() {
    let config;
    try {
        config = JSON.parse(fs.readFileSync(launchPath, 'utf8'))
            .configurations?.find?.(c => c?.name === CONFIG_NAME);
    } catch (err) {
        console.error(`讀不懂 .claude/launch.json：${err.message}。修好或刪掉它再跑一次。`);
        process.exit(1);
    }
    if (!config) {
        console.warn(`.claude/launch.json 沒有「${CONFIG_NAME}」設定；沒有改它，預覽工具要自己加。`);
        return derivedPort;
    }
    const args = Array.isArray(config.runtimeArgs) ? config.runtimeArgs : [];
    const at = args.indexOf('--port');
    const argRaw = at < 0 ? undefined : args[at + 1];
    const argPort = Number(argRaw);
    const port = isPort(argPort) ? argPort : (isPort(config.port) ? config.port : derivedPort);
    if (config.port !== port || argPort !== port) {
        console.warn(`.claude/launch.json 的「${CONFIG_NAME}」：port 欄位（${config.port ?? '沒有'}）和`
            + ` runtimeArgs 的 --port（${argRaw ?? '沒有'}）要是同一個數字；這次用 ${port}。`);
    }
    return port;
}

const port = fs.existsSync(launchPath) ? portFromLaunch() : derivedPort;

const devVars = path.join(root, '.dev.vars');
if (!fs.existsSync(devVars)) {
    fs.copyFileSync(path.join(root, '.dev.vars.example'), devVars);
    console.log('建立 .dev.vars（複製自 .dev.vars.example）');
}

execSync('npm run db:migrate:local', { cwd: root, stdio: 'inherit' });

if (!fs.existsSync(launchPath)) {
    fs.mkdirSync(path.dirname(launchPath), { recursive: true });
    fs.writeFileSync(launchPath, JSON.stringify({
        version: '0.0.1',
        configurations: [{ name: CONFIG_NAME, runtimeExecutable: 'npx', runtimeArgs: wranglerArgs(port), port }],
    }, null, 2) + '\n');
    console.log('建立 .claude/launch.json');
}

console.log(`這個 worktree 的 port：${port} → http://localhost:${port}`);

// 只有 1000 個 port 可分，兩個 worktree 可能撞到同一個；先探一下。IPv4、IPv6 的 loopback
// 分開探：macOS 上萬用位址（::）綁得上，不代表別人沒佔著 127.0.0.1 或 ::1，而且只綁
// loopback 不會跳防火牆詢問。機器沒有 IPv6（EADDRNOTAVAIL 等）就只看 IPv4。
const inUse = host => new Promise(resolve => {
    const probe = net.createServer()
        .once('error', err => resolve(err.code === 'EADDRINUSE'))
        .once('listening', () => probe.close(() => resolve(false)))
        .listen(port, host);
});
const busy = await inUse('127.0.0.1') || await inUse('::1');
if (busy) {
    console.warn(`port ${port} 已被佔用：可能這個 worktree 已經在跑，或另一個 worktree 算到同一個 port。`
        + `後者請把 .claude/launch.json「${CONFIG_NAME}」的 port 欄位和 runtimeArgs 的 --port 一起改。`);
}

if (!process.argv.includes('--setup')) {
    spawn('npx', wranglerArgs(port), { cwd: root, stdio: 'inherit' })
        .on('error', err => {
            console.error(`啟動 wrangler 失敗：${err.message}`);
            process.exit(1);
        })
        .on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}
