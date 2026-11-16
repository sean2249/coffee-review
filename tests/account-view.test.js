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

    // #92：我的數據、沖煮計劃已是主導覽的入口，個人頁只剩帳號。
    it('no longer links to 我的數據 or 沖煮計劃', () => {
        const html = win.accountMarkup({ user: { id: 'u1', email: 'a@b.com' } });
        expect(html).not.toContain('href="#/stats"');
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
