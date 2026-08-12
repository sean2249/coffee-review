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

describe('stampUserId', () => {
    it('adds user_id = null when logged out', () => {
        win.setSessionUser(null);
        expect(win.stampUserId({ bean_name: 'x' })).toEqual({ bean_name: 'x', user_id: null });
    });

    it('adds the logged-in user id', () => {
        win.setSessionUser({ id: 'user-1' });
        expect(win.stampUserId({ bean_name: 'x' })).toEqual({ bean_name: 'x', user_id: 'user-1' });
    });

    it('does not mutate the input payload', () => {
        win.setSessionUser({ id: 'user-1' });
        const p = { a: 1 };
        win.stampUserId(p);
        expect(p).toEqual({ a: 1 });
    });
});
