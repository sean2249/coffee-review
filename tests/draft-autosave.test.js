import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadApp } from './load-app.js';

// setupDraftAutosave：還原列的按鈕在 <form> 裡面，點擊會冒泡到表單層的 click
// 自動儲存。鎖住「按了還原、沒再改就離開」草稿仍留著，改一下又改回來也不會被清掉。

const here = path.dirname(fileURLToPath(import.meta.url));
const INDEX = fs.readFileSync(path.join(here, '..', 'public', 'index.html'), 'utf8');
const FORM_MARKUP = INDEX.split('<template id="tpl-form">')[1].split('</template>')[0];

const DRAFT_NOTES = '草稿裡的筆記';

let win, doc;

// 照 viewForm 的順序掛表單（它本身會被 renderAccessGate 擋掉，進不來）。
async function mountForm(mode) {
    let dom;
    ({ dom, window: win, document: doc } = await loadApp({
        // 掛在 #app 外面：app.js 的首次 renderRoute 會清掉 #app 的內容。
        bodyHtml: `<main id="app"></main>${FORM_MARKUP}`,
    }));
    win.localStorage.clear();
    vm.runInContext(`state.currentForm = { mode: '${mode}', recordId: null }`, dom.getInternalVMContext());
    win.setFormMode(mode);
    win.initCoeWidget();
    win.initEvaluationAccordion();
}

// 在乾淨表單上多一段筆記 = 一份和 baseline 不同的草稿。
function seedDraft(mode) {
    const key = win.draftKey(mode, null);
    win.writeDraft(key, mode, { ...win.buildFormPayload(mode), notes: DRAFT_NOTES });
    return key;
}

const bannerButton = which => doc.querySelector(`.draft-banner [data-draft="${which}"]`);
const waitForDebounce = () => new Promise(resolve => setTimeout(resolve, 350));

describe.each(['cupping', 'tasting'])('setupDraftAutosave（%s）', mode => {
    beforeEach(() => mountForm(mode));

    it('按還原後沒再改就離開 → 草稿仍在', async () => {
        const key = seedDraft(mode);
        win.setupDraftAutosave(mode, null);

        bannerButton('restore').click();
        expect(doc.getElementById('f-notes').value).toBe(DRAFT_NOTES);
        await waitForDebounce();

        expect(win.readDraft(key)?.payload.notes).toBe(DRAFT_NOTES);
    });

    it('還原後改一下又改回來 → 草稿仍在', async () => {
        const key = seedDraft(mode);
        win.setupDraftAutosave(mode, null);
        bannerButton('restore').click();

        const notes = doc.getElementById('f-notes');
        notes.value = DRAFT_NOTES + 'x';
        notes.dispatchEvent(new win.Event('input', { bubbles: true }));
        notes.value = DRAFT_NOTES;
        notes.dispatchEvent(new win.Event('input', { bubbles: true }));
        await waitForDebounce();

        expect(win.readDraft(key)?.payload.notes).toBe(DRAFT_NOTES);
    });

    it('按刪除草稿 → 草稿清掉、表單維持空白', async () => {
        const key = seedDraft(mode);
        win.setupDraftAutosave(mode, null);

        bannerButton('discard').click();
        await waitForDebounce();

        expect(doc.getElementById('f-notes').value).toBe('');
        expect(win.localStorage.getItem(key)).toBeNull();
    });
});
