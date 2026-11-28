// End-to-end 共用：#173 定案的色盤（作者 2026-11-28 調亮、調淡後的值；期望值直接照規格寫，
// 不從 CSS 讀回來），
// 以及用 API 塞假資料的小工具。
export const PALETTE = {
    F: { bg: '#dcdcdf', fg: '#374151', tint: '#f0f0f2', ink: '#374151' },
    D: { bg: '#626a71', fg: '#ffffff', tint: '#e4edf5', ink: '#626a71' },
    C: { bg: '#4c7454', fg: '#ffffff', tint: '#dbf3de', ink: '#4c7454' },
    B: { bg: '#476d8e', fg: '#ffffff', tint: '#d7effa', ink: '#476d8e' },
    A: { bg: '#6e608b', fg: '#ffffff', tint: '#eee6fa', ink: '#6e608b' },
    S: { bg: '#885e43', fg: '#ffffff', tint: '#fae4d3', ink: '#885e43' },
    SS: { bg: '#905752', fg: '#ffffff', tint: '#f9e1dd', ink: '#905752' },
};

export function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

export const KEYS = ['aroma', 'flavor', 'aftertaste', 'acidity', 'sweetness', 'mouthfeel', 'balance', 'cleanness'];

// 新制沖煮紀錄：8 項全 0，風味補到指定分數（80 + Σ）。
export async function createCupping(request, beanName, score) {
    const evaluations = Object.fromEntries(KEYS.map(k => [k, { score: 0, notes: '' }]));
    evaluations.flavor.score = score - 80;
    const res = await request.post('/api/records/cupping', {
        data: {
            bean_name: beanName,
            bean_type: 'single',
            coe_total: score,
            coe_tier_id: null,
            evaluations,
            observation: {},
            schema_version: 4,
        },
    });
    if (!res.ok()) throw new Error(`create cupping ${res.status()}: ${await res.text()}`);
    return (await res.json()).id;
}

export async function style(locator, prop) {
    return locator.evaluate((el, p) => getComputedStyle(el)[p], prop);
}

export async function noHorizontalScroll(page) {
    return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}
