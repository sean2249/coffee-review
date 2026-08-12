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

    it('drops a non-http(s) avatar scheme and falls back to the placeholder', () => {
        const html = win.accountMarkup({
            cloudReady: true,
            user: { email: 'x', user_metadata: { full_name: 'Sean', avatar_url: 'data:image/png;base64,AAAA' } },
        });
        expect(html).not.toContain('data:image/png');
        expect(html).not.toContain('<img');
        expect(html).toContain('account-avatar-placeholder');
    });
});

describe('safeHttpUrl', () => {
    it('keeps http and https URLs', () => {
        expect(win.safeHttpUrl('https://x/y.png')).toBe('https://x/y.png');
        expect(win.safeHttpUrl('http://x/y.png')).toBe('http://x/y.png');
    });

    it('rejects non-http(s) schemes and malformed input', () => {
        expect(win.safeHttpUrl('data:image/png;base64,AAAA')).toBe('');
        expect(win.safeHttpUrl('javascript:alert(1)')).toBe('');
        expect(win.safeHttpUrl('not a url')).toBe('');
        expect(win.safeHttpUrl('')).toBe('');
    });
});

describe('#/me route', () => {
    it('renders viewAccount (cloud-not-ready state) at #/me', async () => {
        win.location.hash = '#/me';
        await new Promise(r => setTimeout(r, 0));
        expect(win.document.getElementById('app').innerHTML).toContain('尚未設定雲端');
    });
});
