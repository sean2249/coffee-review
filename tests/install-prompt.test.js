import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// iPadOS 的 Safari 預設回報桌面 Mac 的 UA，只能靠觸控點數分辨。
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';

let win;
beforeAll(async () => { ({ window: win } = await loadApp()); });

// #172：設定頁的「加入主畫面」只顯示一種狀態。
describe('installStatus', () => {
    const base = { standalone: false, installed: false, hasPrompt: false, userAgent: FIREFOX_UA, maxTouchPoints: 0 };

    it('is installed when running standalone, even if a prompt is held', () => {
        expect(win.installStatus({ ...base, standalone: true, hasPrompt: true })).toBe('installed');
    });

    it('is installed after appinstalled fired this visit', () => {
        expect(win.installStatus({ ...base, installed: true, hasPrompt: true })).toBe('installed');
    });

    it('offers the one-tap button when a beforeinstallprompt is held', () => {
        expect(win.installStatus({ ...base, hasPrompt: true })).toBe('prompt');
    });

    it('shows the iOS instructions on an iPhone', () => {
        expect(win.installStatus({ ...base, userAgent: IPHONE_UA, maxTouchPoints: 5 })).toBe('ios');
    });

    it('treats a touch-capable "Mac" as an iPad', () => {
        expect(win.installStatus({ ...base, userAgent: MAC_UA, maxTouchPoints: 5 })).toBe('ios');
    });

    it('shows nothing on desktop Mac Safari', () => {
        expect(win.installStatus({ ...base, userAgent: MAC_UA, maxTouchPoints: 0 })).toBeNull();
    });

    it('shows nothing on Firefox', () => {
        expect(win.installStatus(base)).toBeNull();
    });
});

// 整個 app：beforeinstallprompt 一律被攔下、存起來，只在設定頁變成按鈕。
describe('install prompt flow', () => {
    let w;
    let doc;
    const tick = () => new Promise(r => setTimeout(r, 0));
    const go = async hash => { w.location.hash = hash; await tick(); };
    const app = () => doc.getElementById('app');

    function fireInstallPrompt(outcome = 'accepted') {
        const evt = new w.Event('beforeinstallprompt', { cancelable: true });
        evt.prompt = () => { evt.prompted = true; return Promise.resolve(); };
        evt.userChoice = Promise.resolve({ outcome, platform: 'web' });
        w.dispatchEvent(evt);
        return evt;
    }

    beforeEach(async () => {
        ({ window: w, document: doc } = await loadApp());
        w.setSessionUser({ id: 'u1', email: 'a@example.com' });
    });

    it('swallows the browser prompt and leaves other pages untouched', async () => {
        await go('#/me');
        await go('#/stats');
        const before = app().innerHTML;
        const evt = fireInstallPrompt();
        expect(evt.defaultPrevented).toBe(true);
        expect(app().innerHTML).toBe(before);
        expect(doc.getElementById('account-install-btn')).toBeNull();
    });

    // 登入擋板和設定頁共用 .account-card；事件不可以把擋板換成設定頁。
    it('leaves the sign-in gate alone', async () => {
        w.setSessionUser(null);
        await go('#/stats');
        const before = app().innerHTML;
        expect(before).toContain('請先登入');
        fireInstallPrompt();
        expect(app().innerHTML).toBe(before);
    });

    it('shows the 安裝 button on 設定 once a prompt is held', async () => {
        fireInstallPrompt();
        await go('#/me');
        expect(doc.getElementById('account-install-btn')).not.toBeNull();
    });

    it('updates 設定 live when the prompt arrives while it is open', async () => {
        await go('#/me');
        expect(doc.getElementById('account-install-btn')).toBeNull();
        fireInstallPrompt();
        expect(doc.getElementById('account-install-btn')).not.toBeNull();
    });

    it('prompts on tap and switches to 已安裝 when accepted', async () => {
        const evt = fireInstallPrompt('accepted');
        await go('#/me');
        doc.getElementById('account-install-btn').click();
        await tick();
        expect(evt.prompted).toBe(true);
        expect(app().textContent).toContain('已安裝');
        expect(doc.getElementById('account-install-btn')).toBeNull();
    });

    it('hides the button when the user dismisses the prompt', async () => {
        fireInstallPrompt('dismissed');
        await go('#/me');
        doc.getElementById('account-install-btn').click();
        await tick();
        expect(doc.getElementById('account-install-btn')).toBeNull();
        expect(app().textContent).not.toContain('已安裝');
    });

    it('shows 已安裝 after appinstalled', async () => {
        fireInstallPrompt();
        await go('#/me');
        w.dispatchEvent(new w.Event('appinstalled'));
        expect(app().textContent).toContain('已安裝');
        expect(doc.getElementById('account-install-btn')).toBeNull();
    });
});
