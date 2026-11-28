import { test, expect } from '@playwright/test';

// 伺服器與假資料有起來：記錄列表、API 身分、預先塞的店家。
test('app 起得來，API 認得假帳號，看得到測試店家', async ({ page, request }) => {
    const me = await (await request.get('/api/me')).json();
    expect(me.email).toBe('e2e@example.test');
    const shops = await (await request.get('/api/shops')).json();
    expect(shops.map(s => s.name)).toContain('測試咖啡');
    await page.goto('/#/records');
    await expect(page.getByRole('group', { name: '記錄類型' })).toBeVisible();
});
