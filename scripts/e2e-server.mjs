// End-to-end 測試用的本機伺服器（playwright.config.js 的 webServer）。
// 每次都從空的本機 D1 開始（.wrangler/e2e-state，和 dev 用的資料分開）：套 migration
// 與 trigger、塞一家假店家，再在固定 port 啟動 wrangler dev。身分是 open 模式的假帳號。
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = path.join(root, '.wrangler', 'e2e-state');
const PORT = process.env.E2E_PORT || '8790';
const wrangler = (...args) => execFileSync('npx', ['wrangler', ...args], { cwd: root, stdio: 'inherit' });

fs.rmSync(STATE, { recursive: true, force: true });
wrangler('d1', 'migrations', 'apply', 'coffee-review', '--local', '--persist-to', STATE);
wrangler('d1', 'execute', 'coffee-review', '--local', '--persist-to', STATE, '--yes',
    '--file', 'schema/triggers.sql');
wrangler('d1', 'execute', 'coffee-review', '--local', '--persist-to', STATE, '--yes', '--command',
    "insert into shops (id, name, location, google_place_id) values ('e2e-shop', '測試咖啡', '台北市', 'e2e-place-1')");

const server = spawn('npx', ['wrangler', 'dev', '--port', PORT, '--persist-to', STATE,
    '--var', 'DEV_USER_EMAIL:e2e@example.test', '--var', 'GOOGLE_MAPS_API_KEY:'],
{ cwd: root, stdio: 'inherit' });
server.on('exit', code => process.exit(code ?? 1));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill(sig));
