import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp } from './load-app.js';

let win;
beforeAll(async () => { ({ window: win } = await loadApp()); });

// Cloudflare Access 的 application token 只帶 email：沒有姓名也沒有頭像，
// 所以個人頁只剩 email + 登出。
describe('accountMarkup', () => {
    it('shows a reload button when the identity has not arrived', () => {
        const html = win.accountMarkup({ user: null });
        expect(html).toContain('id="account-signin"');
        expect(html).toContain('重新載入');
    });

    it('shows the email and a sign-out button when signed in', () => {
        const html = win.accountMarkup({ user: { id: 'u1', email: 'a@b.com' } });
        expect(html).toContain('id="account-signout"');
        expect(html).toContain('a@b.com');
    });

    // #172 / #164：數據併入設定，從設定頁的清單點進去；沖煮計劃仍是主導覽入口。
    it('links to 我的數據 but not 沖煮計劃', () => {
        const html = win.accountMarkup({ user: { id: 'u1', email: 'a@b.com' } });
        expect(html).toMatch(/<a[^>]*href="#\/stats"[^>]*>[\s\S]*?我的數據/);
        expect(html).not.toContain('href="#/plans"');
    });

    it('escapes the email', () => {
        const html = win.accountMarkup({ user: { id: 'u1', email: '<b>hack</b>' } });
        expect(html).not.toContain('<b>hack</b>');
    });
});

describe('#/me route', () => {
    it('renders viewAccount at #/me without gating', async () => {
        win.location.hash = '#/me';
        await new Promise(r => setTimeout(r, 0));
        const html = win.document.getElementById('app').innerHTML;
        expect(html).toContain('account-card');
        expect(html).not.toContain('請先登入');
    });
});

// #172：個人 → 設定，加上「加入主畫面」區塊（只在已登入時出現）。
describe('accountMarkup — 設定 / 加入主畫面', () => {
    const user = { id: 'u1', email: 'a@b.com' };

    it('titles the page 設定', () => {
        expect(win.accountMarkup({ user })).toContain('設定');
        expect(win.accountMarkup({ user: null })).toContain('設定');
        expect(win.accountMarkup({ user: null })).not.toContain('個人');
    });

    it('shows 已安裝 and no install button when installed', () => {
        const html = win.accountMarkup({ user, install: 'installed' });
        expect(html).toContain('已安裝');
        expect(html).not.toContain('id="account-install-btn"');
    });

    it('shows a 安裝 button when the browser can prompt', () => {
        const html = win.accountMarkup({ user, install: 'prompt' });
        expect(html).toMatch(/<button[^>]*type="button"[^>]*id="account-install-btn"[^>]*>[\s\S]*安裝/);
    });

    it('explains 分享 → 加入主畫面 on iOS', () => {
        const html = win.accountMarkup({ user, install: 'ios' });
        expect(html).toContain('分享');
        expect(html).toContain('加入主畫面');
        expect(html).not.toContain('id="account-install-btn"');
    });

    it('has no install section when there is nothing to offer', () => {
        const html = win.accountMarkup({ user, install: null });
        expect(html).not.toContain('加入主畫面');
        expect(html).not.toContain('已安裝');
    });
});
