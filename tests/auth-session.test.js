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

describe('stampCreatedBy', () => {
    // 店家是共享 registry：user_id 對它沒有存取控制意義，只記錄建立者。
    it('adds created_by = null when logged out', () => {
        win.setSessionUser(null);
        expect(win.stampCreatedBy({ name: 'x' })).toEqual({ name: 'x', created_by: null });
    });

    it('adds the logged-in user id', () => {
        win.setSessionUser({ id: 'user-1' });
        expect(win.stampCreatedBy({ name: 'x' })).toEqual({ name: 'x', created_by: 'user-1' });
    });

    it('never writes user_id — that column is gone from shops', () => {
        win.setSessionUser({ id: 'user-1' });
        expect(win.stampCreatedBy({ name: 'x' })).not.toHaveProperty('user_id');
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
