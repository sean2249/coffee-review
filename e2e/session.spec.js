import { test, expect } from '@playwright/test';
import { PALETTE, rgb, KEYS, style, noHorizontalScroll } from './helpers.js';

// #183：杯測每一杯也是 8 項調整分。走一遍真的流程：① 設定 → ② 評分（含一杯沒評完）→ ③ 揭曉
// → 場次頁的排名與徽章；舊杯（改版前評的）評分唯讀、存檔不改寫、按「重新評分」才改用新制。

const row = (page, key) => page.locator(`.adjust-item[data-adjust-key="${key}"]`);
async function press(page, key, action, times = 1) {
    for (let i = 0; i < times; i++) await row(page, key).locator(`[data-adjust="${action}"]`).click();
}
async function judgeAll(page) {
    for (const k of KEYS) await press(page, k, 'zero');
}

test('建立場次 → 評兩杯、留一杯未評分 → 揭曉 → 排名與徽章', async ({ page }, info) => {
    await page.goto('/#/new/session');
    await expect(page.locator('#session-stage-name')).toHaveText('① 設定');
    await page.locator('#f-cup-count').selectOption('3');
    await page.locator('#cup-code-random').click();
    await page.locator('#f-save').click();

    await expect(page.locator('#session-stage-name')).toHaveText('② 評分');
    await expect(page.locator('#medalRow')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('預估總分');
    const tabs = page.locator('#cup-tabbar [data-cup-index]');
    await expect(tabs).toHaveCount(3);

    // 第 1 杯：85（C）
    await judgeAll(page);
    await press(page, 'flavor', 'plus', 10);
    await expect(page.locator('#scoreBar')).toContainText('85.0');
    // 第 2 杯：90（A，光暈）
    await tabs.nth(1).click();
    await expect(page.locator('#scoreBar')).toContainText('未評分 · 0/8');
    await judgeAll(page);
    await press(page, 'flavor', 'plus', 20);
    await expect(page.locator('#scoreBar')).toContainText('90.0');
    // 第 3 杯：只判斷一項 → 未評分
    await tabs.nth(2).click();
    await press(page, 'aroma', 'plus');
    await expect(page.locator('#scoreBar')).toContainText('未評分 · 1/8');
    if (info.project.name === 'mobile') expect(await noHorizontalScroll(page)).toBe(true);

    await page.locator('#f-save').click();
    await expect(page.locator('#session-stage-name')).toHaveText('③ 揭曉');
    const heads = page.locator('#reveal-cup-cards .reveal-cup-head');
    await expect(heads).toHaveCount(3);
    await expect(heads.nth(0).locator('.reveal-cup-medal')).toHaveText('A 90.0');
    await expect(heads.nth(1).locator('.reveal-cup-medal')).toHaveText('C 85.0');
    await expect(heads.nth(2).locator('.reveal-cup-medal')).toHaveText('未評分');
    const top = heads.nth(0).locator('.reveal-cup-medal');
    expect(await style(top, 'backgroundColor')).toBe(rgb(PALETTE.A.bg));
    expect(await style(top, 'boxShadow')).toContain(rgb(PALETTE.A.bg)); // A 以上：揭曉有光暈
    const second = heads.nth(1).locator('.reveal-cup-medal');
    expect(await style(second, 'backgroundColor')).toBe(rgb(PALETTE.C.bg));
    expect(await style(second, 'boxShadow')).toBe('none');

    await page.locator('#f-save').click();
    await expect(page).toHaveURL(/#\/session\/[^/]+$/);
    const ranking = page.locator('.cup-ranking-row');
    await expect(ranking).toHaveCount(3);
    const firstScore = ranking.nth(0).locator('.cup-ranking-score');
    await expect(firstScore).toHaveText('90.0');
    expect(await style(firstScore, 'backgroundColor')).toBe(rgb(PALETTE.A.bg));
    await expect(ranking.nth(2).locator('.cup-ranking-rank')).toHaveText('—');
    await expect(page.locator('.session-cup .detail-adjust-row').first()).toBeVisible();
});

test('舊杯：評分唯讀、改備註存檔不改寫評分；重新評分後改用新制', async ({ page, request }) => {
    const id = `e2e-legacy-${test.info().project.name}`;
    const legacyCup = {
        id: `${id}-a`, code: 'A', shop_id: null, bean_name: '舊杯', bean_type: 'single', origin: null,
        process: null, blend_composition: null, roast: null, defects: null, defects_tags: [], notes: null,
        coe_total: 84, coe_tier_id: 'like', schema_version: 1,
        evaluations: { flavor: { score: 7, notes: '' } }, observation: {},
    };
    const put = await request.put(`/api/sessions/${id}`, {
        data: {
            session: { session_date: '2026-11-01', title: '舊場次', notes: null, code_style: 'manual', stage: 'reveal', schema_version: 1 },
            cups: [legacyCup],
        },
    });
    expect(put.ok()).toBe(true);

    await page.goto(`/#/session/${id}/edit`);
    await page.locator('#reveal-cup-cards .reveal-cup-head').first().click();
    await page.locator('#cup-score-toggle').click();
    await expect(page.locator('#adjustLegacy')).toContainText('保留原分數 84.0');
    await expect(row(page, 'flavor').locator('.adjust-value')).toHaveText('2.0');
    await expect(row(page, 'flavor').locator('[data-adjust="plus"]')).toBeDisabled();
    await expect(page.locator('#scoreBar')).toContainText('84.0');
    expect(await style(page.locator('#scoreBar'), 'backgroundColor')).toBe(rgb(PALETTE.C.bg)); // 84 = C

    await page.locator('#f-notes-body').evaluate(el => { el.hidden = false; });
    await page.locator('#f-notes').fill('只改備註');
    await page.locator('#f-save').click();
    await expect(page).toHaveURL(new RegExp(`#/session/${id}$`));
    let saved = await (await request.get(`/api/sessions/${id}`)).json();
    expect(saved.cups[0].notes).toBe('只改備註');
    expect(saved.cups[0].coe_total).toBe(84);
    expect(saved.cups[0].schema_version).toBe(1);
    expect(saved.cups[0].evaluations.flavor.score).toBe(7);

    await page.goto(`/#/session/${id}/edit`);
    await page.locator('#reveal-cup-cards .reveal-cup-head').first().click();
    await page.locator('#cup-score-toggle').click();
    await page.locator('#f-adjust-reset').click();
    await expect(page.locator('#adjustLegacy')).toBeHidden();
    await expect(page.locator('#scoreBar')).toContainText('未評分 · 0/8');
    await judgeAll(page);
    await press(page, 'flavor', 'plus', 2);
    await page.locator('#f-save').click();
    await expect(page).toHaveURL(new RegExp(`#/session/${id}$`));
    saved = await (await request.get(`/api/sessions/${id}`)).json();
    expect(saved.cups[0].coe_total).toBe(81);
    expect(saved.cups[0].schema_version).toBe(2);
    expect(saved.cups[0].coe_tier_id).toBe('d');
});
