import { test, expect } from '@playwright/test';
import { PALETTE, rgb, KEYS, createCupping, style, noHorizontalScroll } from './helpers.js';

// #173 寶物稀有度：每個顯示等級的地方，在真的瀏覽器裡算出來的顏色都照 brief 的色盤。
// 分界各取兩端（79.5 / 80、95），中間每級一筆。
const SEEDS = [
    [79.5, 'F'], [80, 'D'], [84, 'C'], [87, 'B'], [90, 'A'], [93, 'S'], [95, 'SS'],
];
const ids = {};
let seeded = false;

test.beforeEach(async ({ request }) => {
    if (seeded) return;
    for (const [score] of SEEDS) ids[score] = await createCupping(request, `E2E-${score}`, score);
    seeded = true;
});

test('列表獎牌：字母與純色底，依分數歸級（含邊界）', async ({ page }) => {
    await page.goto('/#/records');
    for (const [score, medal] of SEEDS) {
        const card = page.locator('.record-card', { hasText: `E2E-${score}` }).first();
        const badge = card.locator('.record-card-medal');
        await expect(badge.locator('.record-card-medal-text')).toHaveText(medal);
        expect(await style(badge, 'backgroundColor'), `${score} → ${medal}`).toBe(rgb(PALETTE[medal].bg));
        expect(await style(badge, 'color')).toBe(rgb(PALETTE[medal].fg));
    }
});

test('詳情頁：淡底＋色字的「字母 中文」標籤，沒有光暈（A 以上也是）', async ({ page }) => {
    for (const [score, medal] of [[84, 'C'], [90, 'A'], [79.5, 'F']]) {
        await page.goto(`/#/cupping/${ids[score]}`);
        const tag = page.locator('.coe-card .tier-badge');
        await expect(tag).toHaveText(new RegExp(`^${medal}`));
        expect(await style(tag, 'backgroundColor'), `${score} tint`).toBe(rgb(PALETTE[medal].tint));
        expect(await style(tag, 'color'), `${score} ink`).toBe(rgb(PALETTE[medal].ink));
        expect(await style(tag, 'boxShadow'), `${score} glow`).toBe('none');
    }
});

test('篩選：未選取是白底＋色框，選取後變純色', async ({ page }) => {
    await page.goto('/#/records');
    await page.getByRole('button', { name: '進階篩選' }).click();
    const chip = page.locator('.filter-tier-row .filter-chip[data-tier-id="b"]');
    await expect(chip).toContainText('B 稀有');
    expect(await style(chip, 'borderTopColor')).toBe(rgb(PALETTE.B.bg));
    expect(await style(chip, 'color')).toBe(rgb(PALETTE.B.ink));
    expect(await style(chip, 'backgroundColor')).toBe(rgb('#ffffff'));
    await chip.click();
    await expect(chip).toHaveClass(/selected/);
    // .filter-chip 有 0.12s 的轉場：等顏色停下來再比
    await expect.poll(() => style(chip, 'backgroundColor')).toBe(rgb(PALETTE.B.bg));
    await expect.poll(() => style(chip, 'color')).toBe(rgb(PALETTE.B.fg));
});

test('統計：分數分布的長條與徽章用各級純色', async ({ page }) => {
    await page.goto('/#/stats');
    const medals = page.locator('.stats-dist-medal');
    await expect(medals).toHaveCount(7);
    const order = ['F', 'D', 'C', 'B', 'A', 'S', 'SS'];
    for (let i = 0; i < 7; i++) {
        await expect(medals.nth(i)).toHaveText(order[i]);
        expect(await style(medals.nth(i), 'backgroundColor')).toBe(rgb(PALETTE[order[i]].bg));
    }
});

test.describe('沖煮表單', () => {
    const row = (page, key) => page.locator(`.adjust-item[data-adjust-key="${key}"]`);
    const press = async (page, key, action, times = 1) => {
        for (let i = 0; i < times; i++) await row(page, key).locator(`[data-adjust="${action}"]`).click();
    };

    // 作者 2026-11-28：等級色只在圓點；膠囊沒有外框，數字維持中性。
    test('8 項調整分：圓點用等級色（−1 F … 2 S，+2.5 起 SS），膠囊無框、數字中性', async ({ page }) => {
        await page.goto('/#/new/cupping');
        const dot = row(page, 'flavor').locator('.adjust-dot');
        expect(await style(dot, 'backgroundColor')).toBe('rgba(0, 0, 0, 0)');
        const steps = [['minus', -1, 'F'], ['plus', 0, 'D'], ['plus', 0.5, 'C'], ['plus', 1, 'B'],
            ['plus', 1.5, 'A'], ['plus', 2, 'S'], ['plus', 2.5, 'SS'], ['plus', 3, 'SS']];
        const stepper = row(page, 'flavor').locator('.adjust-stepper');
        const valueBtn = row(page, 'flavor').locator('.adjust-value');
        for (const [action, value, medal] of steps) {
            await press(page, 'flavor', action);
            expect(await style(dot, 'backgroundColor'), `${value} dot`).toBe(rgb(PALETTE[medal].bg));
            expect(await style(stepper, 'borderTopWidth'), `${value} border`).toBe('0px');
            expect(await style(valueBtn, 'color'), `${value} text`).toBe(rgb('#111418'));
        }
    });

    test('分數列：判斷完照等級上色，A 以上也沒有光暈', async ({ page }) => {
        await page.goto('/#/new/cupping');
        const bar = page.locator('#scoreBar');
        await expect(bar).toContainText('未評分 · 0/8');
        for (const k of KEYS) await press(page, k, 'zero');
        await expect(bar).toContainText('80.0');
        expect(await style(bar, 'backgroundColor')).toBe(rgb(PALETTE.D.bg));
        expect(await style(bar, 'boxShadow')).not.toContain(rgb(PALETTE.D.bg));
        await press(page, 'flavor', 'plus', 18); // +9 → 89 A
        await expect(bar).toContainText('89.0');
        expect(await style(bar, 'backgroundColor')).toBe(rgb(PALETTE.A.bg));
        expect(await style(bar, 'boxShadow')).not.toContain(rgb(PALETTE.A.bg));
    });
});

test('手機 320px：列表、詳情、表單都沒有橫向捲動', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', '只在手機寬度檢查');
    for (const hash of ['#/records', `#/cupping/${ids[90]}`, '#/new/cupping', '#/stats']) {
        await page.goto(`/${hash}`);
        await page.waitForLoadState('networkidle');
        expect(await noHorizontalScroll(page), hash).toBe(true);
    }
});
