import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './load-app.js';

// 杯測場次在列表卡片、店家頁單杯卡與場次詳細頁的呈現。
let win, doc;

beforeEach(async () => {
    ({ window: win, document: doc } = await loadApp());
    win.eval(`state.shops = [{ id: 'shop-a', name: '甲烘豆' }]; state.shopsLoaded = true;`);
});

function toDom(html) {
    const el = doc.createElement('div');
    el.innerHTML = html;
    return el;
}

const session = {
    _type: 'session', id: 's1', title: '日曬比較', session_date: '2026-09-01',
    created_at: '2026-09-02T00:00:00Z',
    cups: [
        { id: 'k1', code: 'A', position: 0, shop_id: 'shop-a', bean_name: '耶加', coe_total: 84, coe_tier_id: 'like' },
        { id: 'k2', code: 'B', position: 1, shop_id: null, bean_name: '西達摩', coe_total: 87, coe_tier_id: 'recommend' },
        { id: 'k3', code: 'C', position: 2, shop_id: null, bean_name: null, coe_total: null, coe_tier_id: null },
    ],
};

describe('renderRecordCard — 杯測場次', () => {
    it('獎牌與分數取最高分那杯，連到場次，顯示杯數與最佳杯', () => {
        const card = toDom(win.renderRecordCard(session)).querySelector('.record-card');
        expect(card.getAttribute('href')).toBe('#/session/s1');
        expect(card.querySelector('.record-card-medal-text').textContent).toBe('金');
        expect(card.querySelector('.record-card-medal-score').textContent).toBe('87.0');
        expect(card.querySelector('.record-card-type-badge').textContent).toBe('杯測');
        expect(card.querySelector('.record-card-type-badge').classList.contains('type-session')).toBe(true);
        expect(card.querySelector('.record-card-title').textContent).toBe('日曬比較');
        const meta = card.querySelector('.record-card-meta').textContent;
        expect(meta).toContain('3 杯');
        expect(meta).toContain('B · 西達摩');
        expect(meta).toContain('2026');
    });

    it('全部未評分：分數「—」、獎牌「?」、沒有最佳杯', () => {
        const unscored = { ...session, title: null, cups: [session.cups[2]] };
        const card = toDom(win.renderRecordCard(unscored)).querySelector('.record-card');
        expect(card.querySelector('.record-card-medal-score').textContent).toBe('—');
        expect(card.querySelector('.record-card-medal-text').textContent).toBe('?');
        expect(card.querySelector('.record-card-title').textContent).toBe('(未命名杯測)');
        expect(card.querySelector('.bi-trophy')).toBeNull();
    });

    it('場次名稱會被 escape', () => {
        const html = win.renderRecordCard({ ...session, title: '<img src=x onerror=alert(1)>' });
        expect(html).not.toContain('<img');
    });
});

describe('renderRecordCard — 店家頁的單杯', () => {
    it('連回所屬場次，標示場次名與編號', () => {
        const [cupRow] = win.flattenSessionCups([session]);
        const card = toDom(win.renderRecordCard(cupRow)).querySelector('.record-card');
        expect(card.getAttribute('href')).toBe('#/session/s1');
        expect(card.querySelector('.record-card-type-badge').textContent).toBe('杯測');
        expect(card.querySelector('.record-card-title').textContent).toBe('耶加');
        expect(card.querySelector('.record-card-medal-score').textContent).toBe('84.0');
        const meta = card.querySelector('.record-card-meta').textContent;
        expect(meta).toContain('甲烘豆');
        expect(meta).toContain('日曬比較 · A');
    });
});

describe('renderRecordCard — 舊類型改名', () => {
    it('cupping 的徽章顯示「沖煮」', () => {
        const card = toDom(win.renderRecordCard({ _type: 'cupping', id: 'c1', created_at: '2026-01-01' }));
        expect(card.querySelector('.record-card-type-badge').textContent).toBe('沖煮');
        expect(card.querySelector('.record-card-title').textContent).toBe('(未命名沖煮)');
    });
});

describe('renderSessionDetail', () => {
    it('標題、日期、杯數、編輯連結與排名', () => {
        const el = toDom(win.renderSessionDetail(session));
        expect(el.querySelector('.detail-title').textContent).toBe('日曬比較');
        expect(el.querySelector('.detail-meta').textContent).toContain('3 杯');
        expect(el.querySelector('a[href="#/session/s1/edit"]')).not.toBeNull();
        const ranking = [...el.querySelectorAll('.cup-ranking-row')].map(r =>
            [r.querySelector('.cup-ranking-rank').textContent, r.querySelector('.cup-code-badge').textContent]);
        expect(ranking).toEqual([['1', 'B'], ['2', 'A'], ['—', 'C']]);
        // 詳細頁的排名只是顯示，不是按鈕
        expect(el.querySelector('button.cup-ranking-row')).toBeNull();
    });

    it('每杯一段：豆源店家連結、未評分、tier 缺漏時依分數補', () => {
        const s = {
            ...session,
            cups: [
                { id: 'k1', code: 'A', shop_id: 'shop-a', bean_name: '耶加', coe_total: 90, coe_tier_id: null },
                { id: 'k2', code: 'B', shop_id: 'gone', bean_name: null, coe_total: null, coe_tier_id: null },
            ],
        };
        const el = toDom(win.renderSessionDetail(s));
        const heads = [...el.querySelectorAll('.session-cup-head')];
        expect(heads).toHaveLength(2);
        expect(heads[0].textContent).toContain('90.0');
        expect(heads[0].textContent).toContain(win.tierFromScore(90).badgeName);
        expect(heads[0].querySelector('.session-cup-score').getAttribute('style')).toContain('color');
        expect(heads[1].textContent).toContain('未評分');
        expect(heads[1].textContent).toContain('(未填豆名)');
        expect(el.querySelector('a.detail-meta-shop[href="#/shops/shop-a"]')).not.toBeNull();
        // 已刪除的店家不給連結
        expect(el.textContent).toContain('(已刪除店家)');
        expect(el.querySelector('a[href="#/shops/gone"]')).toBeNull();
    });

    it('場次名稱、筆記與杯編號都會被 escape', () => {
        const html = win.renderSessionDetail({
            ...session,
            title: '<b>x</b>',
            notes: '<script>1</script>',
            cups: [{ id: 'k1', code: '<i>A</i>', coe_total: null }],
        });
        expect(html).not.toContain('<b>x</b>');
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<i>A</i>');
    });
});
