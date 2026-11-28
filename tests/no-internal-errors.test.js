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
            .filter(([, line]) => /\b(e|err|error)\.message\s*\|\||String\((e|err|error)\)/.test(line));
        expect(leaks).toEqual([]);
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
