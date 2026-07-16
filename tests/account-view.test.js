import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp } from './load-app.js';

let win;
beforeAll(async () => { ({ window: win } = await loadApp()); });

describe('accountMarkup', () => {
    it('shows the cloud-not-configured warning when cloud is not ready', () => {
        const html = win.accountMarkup({ cloudReady: false, user: null });
        expect(html).toContain('尚未設定雲端');
    });

    it('shows a Google sign-in button when cloud ready but logged out', () => {
        const html = win.accountMarkup({ cloudReady: true, user: null });
        expect(html).toContain('id="account-signin"');
        expect(html).toContain('使用 Google 登入');
    });

    it('shows account info and a sign-out button when logged in', () => {
        const html = win.accountMarkup({
            cloudReady: true,
            user: { email: 'a@b.com', user_metadata: { full_name: 'Sean', avatar_url: 'https://x/y.png' } },
        });
        expect(html).toContain('id="account-signout"');
        expect(html).toContain('Sean');
        expect(html).toContain('a@b.com');
        expect(html).toContain('https://x/y.png');
    });

    it('escapes user-provided fields', () => {
        const html = win.accountMarkup({
            cloudReady: true,
            user: { email: 'x', user_metadata: { full_name: '<b>hack</b>', avatar_url: '' } },
        });
        expect(html).not.toContain('<b>hack</b>');
    });
});

describe('#/me route', () => {
    it('renders viewAccount (cloud-not-ready state) at #/me', async () => {
        win.location.hash = '#/me';
        await new Promise(r => setTimeout(r, 0));
        expect(win.document.getElementById('app').innerHTML).toContain('尚未設定雲端');
    });
});
