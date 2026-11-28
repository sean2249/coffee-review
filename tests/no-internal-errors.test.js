import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// 錯誤訊息不能把內部程式露給使用者（例：「儲存失敗：null is not an object (evaluating
// 'document.getElementById('f-defects').value')」）。抓到的例外只進 console，畫面只說
// 哪個動作失敗、怎麼辦。

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = fs.readFileSync(path.join(here, '..', 'public', 'app.js'), 'utf8');

describe('不把內部錯誤訊息放上畫面', () => {
    it('app.js 沒有把 catch 到的 e.message / err.message 接進畫面文字', () => {
        const leaks = APP.split('\n')
            .map((line, i) => [i + 1, line])
            // 整行註解不算；行尾註解拿掉再看。
            .map(([n, line]) => [n, line.replace(/\s\/\/.*$/, '')])
            .filter(([, line]) => !/^\s*\/\//.test(line))
            // 任何變數的 .message / ?.message（比較除外），以及 String(e)。
            // app 自己的驗證訊息（problem / p）是寫給使用者看的，明列放行。
            .filter(([, line]) => /\b(?!problem\b|p\b)\w+\??\.message\b(?!\s*[!=]==)|String\((e|err|error|ex)\)/.test(line));
        expect(leaks).toEqual([]);
    });

    it('app 自己寫的 userMessage 照樣顯示；429 請使用者稍候', async () => {
        const { window: win } = await loadApp();
        const userErr = Object.assign(new Error('place not found'), { userMessage: 'Google 查無此地點' });
        expect(win.failureText('同步', userErr)).toBe('同步失敗：Google 查無此地點');
        const limited = Object.assign(new Error('Google 搜尋太頻繁，請稍候再試'), { status: 429 });
        expect(win.failureText('Google 搜尋', limited)).toBe('Google 搜尋太頻繁，請稍候再試');
        expect(win.failureText('儲存', new Error('UNIQUE constraint failed'))).toBe('儲存失敗，請再試一次');
    });

    it('showFailureToast 只顯示動作，例外內容進 console', async () => {
        const { window: win, document: doc } = await loadApp({
            bodyHtml: '<main id="app"></main><div id="toastMsg"></div>',
        });
        const logged = [];
        win.console.error = (...a) => logged.push(a);
        const err = new TypeError("null is not an object (evaluating 'document.getElementById('f-defects').value')");
        win.showFailureToast('儲存', err);
        const text = doc.getElementById('toastMsg').textContent;
        expect(text).toBe('儲存失敗，請再試一次');
        expect(text).not.toContain('null');
        expect(logged[0][0]).toBe(err);
    });
});
