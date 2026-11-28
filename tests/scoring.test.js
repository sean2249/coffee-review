import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp } from './load-app.js';

let win;
const tiers = () => win.eval('totalScoreTiers');

beforeAll(async () => {
    ({ window: win } = await loadApp());
});

// 寶物稀有度（#173）：80 = D 普通（8 項全 0），每 3 分一級；最低、最高兩級沒有邊界。
describe('totalScoreTiers', () => {
    it('七級：字母、名稱、說明照 #173 定案', () => {
        expect(tiers().map(t => [t.medal, t.badgeName, t.description])).toEqual([
            ['F', '破損', '有明顯缺點'],
            ['D', '普通', '可接受的日常一杯'],
            ['C', '優良', '比日常好一點'],
            ['B', '稀有', '值得記住'],
            ['A', '史詩', '會想再喝'],
            ['S', '傳說', '專程也要喝'],
            ['SS', '神話', '念念不忘'],
        ]);
    });

    // 作者 2026-11-28：不用光暈，等級資料也不帶這個欄位。
    it('沒有光暈欄位', () => {
        expect(tiers().some(t => 'glow' in t)).toBe(false);
    });
});

describe('tierFromScore', () => {
    it.each([
        [72, 'F'], [79.5, 'F'],
        [80, 'D'], [82.5, 'D'],
        [83, 'C'], [85.5, 'C'],
        [86, 'B'], [88.5, 'B'],
        [89, 'A'], [91.5, 'A'],
        [92, 'S'], [94.5, 'S'],
        [95, 'SS'], [100, 'SS'],
    ])('%s → %s', (score, medal) => {
        expect(win.tierFromScore(score).medal).toBe(medal);
    });

    it('低於 72、高於 100 也歸最低 / 最高級', () => {
        expect(win.tierFromScore(60).medal).toBe('F');
        expect(win.tierFromScore(130).medal).toBe('SS');
    });

    it('不是數字 → null（沒有分數就沒有等級）', () => {
        expect(win.tierFromScore(NaN)).toBeNull();
        expect(win.tierFromScore(undefined)).toBeNull();
    });
});

// 舊紀錄存的 coe_tier_id 是舊等級（例如 84 存成 'like' 銀牌）；顯示一律依分數重新歸級。
describe('scoreTier', () => {
    it('依 coe_total 歸級，不看存下來的 coe_tier_id', () => {
        expect(win.scoreTier({ coe_total: 84, coe_tier_id: 'like' }).medal).toBe('C');
        expect(win.scoreTier({ coe_total: 80, coe_tier_id: 'common' }).medal).toBe('D');
    });

    it('沒有分數 → null', () => {
        expect(win.scoreTier({ coe_total: null, coe_tier_id: 'like' })).toBeNull();
        expect(win.scoreTier({})).toBeNull();
    });
});

// 8 項調整分的顏色用等級（#173，作者 2026-11-28）：−1 F … 2 S，+2.5 起 SS。
describe('adjustmentTier', () => {
    it.each([
        [-1, 'F'], [0, 'D'], [0.5, 'C'], [1, 'B'], [1.5, 'A'], [2, 'S'], [2.5, 'SS'], [3, 'SS'], [6, 'SS'],
    ])('%s → %s', (value, medal) => {
        expect(win.adjustmentTier(value).medal).toBe(medal);
    });

    it('未判斷 → null', () => {
        expect(win.adjustmentTier(null)).toBeNull();
    });
});
