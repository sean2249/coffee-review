import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

let win;
beforeEach(async () => { ({ window: win } = await loadApp()); });

describe('currentUserId / setSessionUser', () => {
    it('returns null when logged out', () => {
        win.setSessionUser(null);
        expect(win.currentUserId()).toBe(null);
    });

    it('returns the user id when logged in', () => {
        win.setSessionUser({ id: 'user-1' });
        expect(win.currentUserId()).toBe('user-1');
    });
});

describe('isSignedIn', () => {
    it('is false when logged out', () => {
        win.setSessionUser(null);
        expect(win.isSignedIn()).toBe(false);
    });

    it('is true when logged in', () => {
        win.setSessionUser({ id: 'user-1' });
        expect(win.isSignedIn()).toBe(true);
    });
});
