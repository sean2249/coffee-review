// ═══ PROTOTYPE — 拋棄式，不要合進 main ══════════════════════════════════════
// sean2249/coffee-review#146 沖煮計劃表 ②，第 2 輪：作者選了 C（時間軸），這一輪只做 C。
// 路由 #/proto-plans/<screen>?variant=C1|C2，用底部浮動列（或 ← →）切換：
//   C1 等距：步驟一列一列等距排  C2 時間比例：步驟之間的間距跟秒數成比例
// 第 1 輪的 A / B 在 commit 5d068e1。
// 資料全在記憶體（重新整理就回到樣本），沒有 API、D1、migration；只在 localhost 開。
// screen：me | list | plan/<id>（內建 → 唯讀詳細；我的 → 編輯）| new | copy/<id>
/* global window, document, location, console, escapeHtml, parseHash, renderRoute, viewNotFound, confirmDialog, showToast */
(function () {
    'use strict';

    const VARIANTS = { C1: '等距', C2: '時間比例' };
    const SCREENS = [
        ['me', '個人'], ['list', '清單'], ['plan/mine-daily', '編輯'],
        ['new', '新增'], ['plan/builtin-hoffmann-2', '內建詳細'],
    ];
    const MAX_STEPS = 30;
    const METHODS = ['V60', 'Kalita Wave 185', 'Origami', '聰明濾杯', 'Chemex'];
    const GRINDS = ['細', '中細', '中', '中粗', '粗'];
    const TEMPS = [88, 90, 92, 94, 96, 100];
    const DOSE_STEP = 0.5;

    // ─── 樣本資料（內建取自 #143 的表格；⚠ 欄位是 AI 暫定值）─────────────
    // 「預計完成」欄位拿掉了：總時間 = 最後一步的時間，所以 4:6 補一個收尾的等待
    const pour = (at, to, extra = {}) => ({ type: 'pour', at_seconds: at, to_g: to, ...extra });
    const wait = (until, note) => ({ type: 'wait', until_seconds: until, ...(note ? { note } : {}) });

    const BUILTIN = [
        {
            id: 'builtin-46', builtin: true, name: '粕谷哲 4:6', tags: ['V60', '分段'],
            method: 'V60', grind: '粗', dose_g: 20, temp_c: 92,
            description: '前 40%（兩注）調甜度與酸度，後 60%（三注）調濃度。',
            steps: [pour(0, 60), pour(45, 120), pour(90, 180), pour(135, 240), pour(180, 300), wait(210, '移開濾杯')],
        },
        {
            id: 'builtin-hoffmann-2', builtin: true, name: 'James Hoffmann Ultimate V60（2 杯）', tags: ['V60', '2 杯'],
            method: 'V60', grind: '中細', dose_g: 30, temp_c: 100,
            description: '悶蒸後分兩段注水，每段 30 秒內注完；最後攪拌、旋轉讓粉床平整。',
            steps: [
                pour(0, 60, { bloom: true }),
                wait(45, '輕搖，讓粉全部浸濕'),
                pour(45, 300, { note: '1:15 前注完' }),
                pour(75, 500, { note: '1:45 前注完' }),
                wait(210, '湯匙順、逆時針各輕攪一下，再輕轉濾杯，等待滴完'),
            ],
        },
        {
            id: 'builtin-hoffmann-1', builtin: true, name: 'James Hoffmann 1 杯 V60', tags: ['V60', '1 杯'],
            method: 'V60', grind: '中細', dose_g: 15, temp_c: 94,
            description: '1 杯量；悶蒸後分 4 次小注。',
            steps: [
                pour(0, 50, { bloom: true }), wait(45, '輕搖'),
                pour(45, 100), pour(70, 150), pour(90, 200), pour(110, 250),
                wait(180, '輕轉濾杯，等待滴完'),
            ],
        },
        {
            id: 'builtin-rao', builtin: true, name: 'Scott Rao V60', tags: ['V60'],
            method: 'V60', grind: '中細', dose_g: 20, temp_c: null,
            description: '悶蒸後用力旋轉；第二段等滴落約 70% 才注；最後旋轉讓粉床平整。',
            steps: [
                pour(0, 60, { bloom: true }), wait(40, '用力旋轉濾杯'),
                pour(40, 200), wait(90, '等到滴落約 70%'),
                pour(90, 330), wait(255, '輕轉濾杯，等待滴完'),
            ],
        },
    ];

    // 「我的計劃」樣本（假資料），updated_at 新到舊
    const mine = [
        {
            id: 'mine-daily', name: '日常 15 g', tags: ['日常', 'V60'], method: 'V60', grind: '中細',
            dose_g: 15, temp_c: 93, updated_at: '2026-10-26', description: '平日早上，一杯剛好。',
            steps: [pour(0, 45, { bloom: true }), wait(35, '輕搖'), pour(35, 150), pour(75, 250, { temp_c: 90 }), wait(165, '等待滴完')],
        },
        {
            id: 'mine-46', name: '4:6 改・淺焙', tags: ['淺焙', 'V60'], method: 'V60', grind: '中粗',
            dose_g: 20, temp_c: 94, updated_at: '2026-10-20',
            description: '照 4:6，後三注水溫降一點。',
            steps: [pour(0, 60, { bloom: true }), pour(45, 120), pour(90, 180, { temp_c: 90 }),
                pour(135, 240, { temp_c: 90 }), pour(180, 300, { temp_c: 90, note: '注完輕轉' }), wait(215, '移開濾杯')],
        },
        {
            id: 'mine-ice', name: '冰手沖 Kalita', tags: ['冰咖啡'], method: 'Kalita Wave 185', grind: '中細',
            dose_g: 20, temp_c: 94, updated_at: '2026-10-11',
            description: '下壺先放冰塊 120 g；熱水只注 160 g。',
            steps: [pour(0, 40, { bloom: true }), pour(35, 100), pour(70, 160), wait(150, '攪拌讓冰融')],
        },
    ];

    // ─── 共用計算 ─────────────────────────────────────────────────────────────
    const r1 = n => Math.round(n * 10) / 10;
    const fmtG = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));
    function fmtTime(s) {
        if (s == null || s === '' || Number.isNaN(s)) return '';
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    function fmtDur(s) { return s < 60 ? `${s} 秒` : fmtTime(s); }
    function parseTime(str) {
        const t = String(str ?? '').trim();
        if (!t) return null;
        const m = /^(\d+):([0-5]\d)$/.exec(t);
        if (m) return Number(m[1]) * 60 + Number(m[2]);
        return /^\d+$/.test(t) ? Number(t) : NaN;
    }
    function num(str) {
        const t = String(str ?? '').trim();
        if (!t) return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : NaN;
    }
    const valid = x => x != null && !Number.isNaN(x);
    function ratioText(total, dose) {
        if (!total || !valid(dose) || dose <= 0) return '—';
        return `1:${fmtG(r1(total / dose))}`;
    }
    const tempLabel = t => (t === 100 ? '沸騰' : `${t}°`);

    // 一個計劃（存的形狀）→ 畫圖 / 唯讀用的列：{ type, t, inc, cum, bloom, temp_c, note, dur }
    function planRows(p) {
        let prevCum = 0;
        let prevT = 0;
        return p.steps.map(s => {
            const t = s.type === 'pour' ? s.at_seconds : s.until_seconds;
            const row = { type: s.type, t, bloom: !!s.bloom, temp_c: s.temp_c, note: s.note, gap: t - prevT };
            if (s.type === 'pour') {
                row.inc = r1(s.to_g - prevCum);
                row.cum = s.to_g;
                prevCum = s.to_g;
            } else {
                row.dur = t - prevT;
            }
            prevT = t;
            return row;
        });
    }
    function summarize(rows, dose) {
        const pours = rows.filter(r => r.type === 'pour' && r.cum != null);
        const total = pours.length ? pours[pours.length - 1].cum : 0;
        const times = rows.map(r => r.t).filter(valid);
        return {
            total,
            ratio: ratioText(total, dose),
            pours: rows.filter(r => r.type === 'pour').length,
            end: times.length ? Math.max(...times) : 0,
            maxInc: Math.max(1, ...pours.map(r => r.inc).filter(x => x > 0)),
        };
    }
    function allPlans() { return [...mine, ...BUILTIN]; }
    function findPlan(id) { return allPlans().find(p => p.id === id) || null; }

    // ─── 編輯器狀態：注水量一律以「本次」輸入，存檔時才換成累計 ─────────────
    let ed = null;
    let edKey = null;

    function planToEditor(p, { copy } = {}) {
        const rows = p ? planRows(p) : null;
        return {
            srcId: copy ? null : (p?.id ?? null),
            errors: [], tagDraft: '',
            name: p ? (copy ? `${p.name}（複製）` : p.name) : '',
            description: p?.description ?? '',
            tags: [...(p?.tags ?? [])],
            method: p?.method ?? '', methodOther: !!p?.method && !METHODS.includes(p.method),
            grind: p?.grind ?? '',
            dose: p?.dose_g != null ? String(p.dose_g) : '',
            temp: p?.temp_c != null ? String(p.temp_c) : '',
            steps: (p ? p.steps : [pour(0, '', { bloom: true })]).map((s, i) => ({
                type: s.type,
                time: fmtTime(s.type === 'pour' ? s.at_seconds : s.until_seconds),
                val: s.type === 'pour' && rows ? fmtG(rows[i].inc) : '',
                bloom: !!s.bloom,
                temp: s.temp_c != null ? String(s.temp_c) : '',
                note: s.note ?? '',
                open: false,
            })),
        };
    }

    // 編輯中的列（同 planRows 的形狀）＋每注的 bad
    function editorRows() {
        let prevCum = 0;
        let prevT = 0;
        return ed.steps.map(s => {
            const t = parseTime(s.time);
            const row = { type: s.type, t: valid(t) ? t : null, bloom: s.bloom, gap: valid(t) ? Math.max(0, t - prevT) : 0 };
            if (s.type === 'pour') {
                const x = num(s.val);
                if (valid(x)) {
                    row.inc = x;
                    row.cum = r1(prevCum + x);
                    row.bad = x <= 0;
                    prevCum = row.cum;
                } else {
                    row.inc = null;
                    row.cum = null;
                    row.bad = Number.isNaN(x);
                }
            } else if (valid(t)) {
                row.dur = t - prevT;
            }
            if (valid(t)) prevT = t;
            return row;
        });
    }

    function validate() {
        const errs = [];
        const rows = editorRows();
        if (!ed.name.trim()) errs.push('名稱必填');
        const dose = num(ed.dose);
        if (!valid(dose) || dose <= 0 || dose > 100) errs.push('粉量要大於 0、最多 100 g');
        if (!ed.steps.length || ed.steps[0].type !== 'pour') errs.push('第一步要是注水');
        let prevT = -1;
        ed.steps.forEach((s, i) => {
            const t = parseTime(s.time);
            if (!valid(t)) errs.push(`第 ${i + 1} 步時間不合法`);
            else if (t < prevT) errs.push(`第 ${i + 1} 步時間比前一步早`);
            else prevT = t;
            if (s.type === 'pour') {
                if (rows[i].inc == null) errs.push(`第 ${i + 1} 步水量必填`);
                else if (rows[i].bad) errs.push(`第 ${i + 1} 步水量要大於 0`);
            }
        });
        return errs;
    }

    function save() {
        ed.errors = validate();
        if (ed.errors.length) return false;
        const rows = editorRows();
        const note = s => (s.note.trim() ? { note: s.note.trim() } : {});
        const plan = {
            id: ed.srcId || `mine-${Date.now()}`,
            name: ed.name.trim(), description: ed.description.trim(), tags: [...ed.tags],
            method: ed.method.trim(), grind: ed.grind,
            dose_g: num(ed.dose), temp_c: valid(num(ed.temp)) ? num(ed.temp) : null,
            updated_at: new Date().toISOString().slice(0, 10),
            // 存檔一律換成累計（本次的前綴和）
            steps: ed.steps.map((s, i) => (s.type === 'pour'
                ? {
                    type: 'pour', at_seconds: rows[i].t, to_g: rows[i].cum,
                    ...(s.bloom ? { bloom: true } : {}),
                    ...(valid(num(s.temp)) ? { temp_c: num(s.temp) } : {}),
                    ...note(s),
                }
                : { type: 'wait', until_seconds: rows[i].t, ...note(s) })),
        };
        const i = mine.findIndex(p => p.id === plan.id);
        if (i >= 0) mine.splice(i, 1);
        mine.unshift(plan);
        console.log('[PROTOTYPE] 會送給 API 的 plan（steps 只有累計 to_g）：', plan);
        return true;
    }

    // ─── 路由 / 狀態 ─────────────────────────────────────────────────────────
    const ui = { tag: '' }; // 清單的標籤篩選
    const esc = s => escapeHtml(s);
    function v() {
        const q = parseHash().query.variant;
        return VARIANTS[q] ? q : 'C1';
    }
    const href = screen => `#/proto-plans/${screen}?variant=${v()}`;
    function allTags() { return [...new Set(allPlans().flatMap(p => p.tags))]; }
    function filtered(list) { return ui.tag ? list.filter(p => p.tags.includes(ui.tag)) : list; }
    // C2：步驟之間的間距跟秒數成比例（上限避免一個長等待把畫面撐爆）
    const gapPx = gap => (v() === 'C2' ? Math.min(72, Math.round((gap || 0) * 0.45)) : 0);

    // ─── 零件 ─────────────────────────────────────────────────────────────────
    // 注水圖：橫軸是時間；注水是直條（高度 ∝ 這注的水量，悶蒸是空心），等待是斜線帶
    function chart(rows, s) {
        const end = Math.max(1, s.end);
        const pct = t => `${((t / end) * 100).toFixed(2)}%`;
        let prevT = 0;
        const marks = rows.map(r => {
            if (r.t == null) return '';
            let out = '';
            if (r.type === 'wait') {
                out = `<span class="pc-chart-wait" style="left:${pct(prevT)};width:${pct(r.t - prevT)}"></span>`;
            } else if (r.inc > 0) {
                const h = Math.max(14, Math.round((r.inc / s.maxInc) * 100));
                out = `<span class="pc-chart-bar ${r.bloom ? 'is-bloom' : ''}" style="left:${pct(r.t)};height:${h}%"></span>`;
            }
            prevT = r.t;
            return out;
        }).join('');
        return `<div class="pc-chart" aria-hidden="true">
            <div class="pc-chart-plot">${marks}</div>
            <div class="pc-chart-axis"><span>0:00</span><span>${fmtTime(s.end)}</span></div>
        </div>`;
    }
    function summaryCard(rows, s, { live } = {}) {
        const stat = (k, val, label) => `<div><b ${live ? `data-stat="${k}"` : ''}>${val}</b><span>${label}</span></div>`;
        return `<div class="pc-summary ${live ? 'is-sticky' : ''}">
            <div class="pc-stats">
                ${stat('total', `${fmtG(s.total)} g`, '總水量')}
                ${stat('ratio', s.ratio, '粉水比')}
                ${stat('pours', `${s.pours} 次`, '注水')}
                ${stat('end', fmtTime(s.end) || '—', '總時間')}
            </div>
            <div ${live ? 'data-chart' : ''}>${chart(rows, s)}</div>
        </div>`;
    }
    function topBar(title, back, right = '') {
        return `<div class="pc-top">
            <a class="pc-back" href="${href(back)}" aria-label="返回"><i class="bi bi-chevron-left"></i></a>
            <h5 class="pc-top-title">${title}</h5>
            ${right}
        </div>`;
    }
    const dotSize = (inc, max) => (inc > 0 ? Math.round(9 + (inc / max) * 9) : 9);
    const barPct = (inc, max) => (inc > 0 ? Math.round((inc / max) * 100) : 0);
    function chips(items, isOn, act, extra = '') {
        return items.map(([val, label]) => `<button type="button" class="pc-chip ${isOn(val) ? 'active' : ''}" data-act="${act}" data-val="${esc(val)}" aria-pressed="${isOn(val)}">${label}</button>`).join('') + extra;
    }

    // ─── 畫面 ─────────────────────────────────────────────────────────────────
    function viewMe() {
        return `<div class="card account-card"><div class="card-body text-center">
            <i class="bi bi-person-circle account-avatar-placeholder"></i>
            <p class="text-muted account-email">proto@example.com</p>
            <button type="button" class="btn btn-outline-secondary" disabled><i class="bi bi-box-arrow-right me-2"></i>登出</button>
        </div></div>
        <a class="card stats-entry-card" href="#/stats">
            <span class="stats-entry-label"><i class="bi bi-bar-chart-line"></i>我的數據</span>
            <i class="bi bi-chevron-right"></i>
        </a>
        <a class="card stats-entry-card" href="${href('list')}">
            <span class="stats-entry-label"><i class="bi bi-cup-hot"></i>沖煮計劃</span>
            <i class="bi bi-chevron-right"></i>
        </a>`;
    }

    function viewList() {
        const item = p => {
            const rows = planRows(p);
            const s = summarize(rows, p.dose_g);
            return `<a class="pc-item" href="${href(`plan/${p.id}`)}">
                <div class="pc-item-top">
                    <span class="pc-item-name">${p.builtin ? '<i class="bi bi-lock-fill pc-lock"></i>' : ''}${esc(p.name)}</span>
                    <span class="pc-item-ratio">${s.ratio}</span>
                </div>
                ${chart(rows, s)}
                <div class="pc-item-meta">${fmtG(p.dose_g)} g → ${fmtG(s.total)} g · 注水 ${s.pours} 次${p.method ? ` · ${esc(p.method)}` : ''}</div>
                ${p.tags.length ? `<div class="pc-item-tags">${p.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
            </a>`;
        };
        const my = filtered(mine);
        const bi = filtered(BUILTIN);
        return `${topBar('沖煮計劃', 'me', `<a class="btn btn-primary btn-sm" href="${href('new')}"><i class="bi bi-plus-lg me-1"></i>新增</a>`)}
        <div class="pc-chips pc-chips-scroll" role="group" aria-label="標籤篩選">
            ${chips([['', '全部'], ...allTags().map(t => [t, `#${esc(t)}`])], t => ui.tag === t, 'filter')}
        </div>
        <div class="pc-section">我的計劃</div>
        <div class="card pc-list">${my.map(item).join('') || '<div class="pc-empty">沒有符合的計劃</div>'}</div>
        <div class="pc-section">內建手沖法</div>
        <div class="card pc-list">${bi.map(item).join('') || '<div class="pc-empty">沒有符合的計劃</div>'}</div>`;
    }

    function viewEdit() {
        const rows = editorRows();
        const s = summarize(rows, num(ed.dose));
        const full = ed.steps.length >= MAX_STEPS;
        const nodes = ed.steps.map((st, i) => editNode(st, i, rows[i], s)).join('');
        const methodOn = m => (m === '其他' ? ed.methodOther : !ed.methodOther && ed.method === m);
        const tempIsPreset = TEMPS.includes(num(ed.temp));
        return `${topBar(ed.srcId ? '編輯計劃' : '新增計劃', 'list', ed.srcId ? '<button type="button" class="pc-icon-btn text-danger" data-act="delete-plan" aria-label="刪除"><i class="bi bi-trash"></i></button>' : '')}
        <form class="proto-form" novalidate>
            <div class="card"><div class="card-body">
                <input class="form-control pc-name" placeholder="計劃名稱 *" value="${esc(ed.name)}" data-f="name" aria-label="名稱">
                <textarea class="form-control mt-2" rows="2" maxlength="500" placeholder="說明（選填）" data-f="description" aria-label="說明">${esc(ed.description)}</textarea>
                <div class="pc-field-label mt-3">標籤</div>
                <div class="pc-chips">
                    ${chips([...new Set([...mine.flatMap(p => p.tags), ...ed.tags])].map(t => [t, `#${esc(t)}`]), t => ed.tags.includes(t), 'tag')}
                    <input class="pc-chip-input" placeholder="＋ 新標籤" value="${esc(ed.tagDraft)}" data-tag-new aria-label="新標籤">
                </div>
            </div></div>

            <div class="card"><div class="card-body">
                <div class="pc-field-label">濾杯</div>
                <div class="pc-chips">
                    ${chips([...METHODS, '其他'].map(m => [m, esc(m)]), methodOn, 'method')}
                </div>
                ${ed.methodOther ? `<input class="form-control form-control-sm mt-2" placeholder="濾杯名稱" value="${esc(ed.method)}" data-f="method" aria-label="其他濾杯">` : ''}
                <div class="pc-field-label mt-3">研磨度</div>
                <div class="pc-chips">${chips(GRINDS.map(g => [g, g]), g => ed.grind === g, 'grind')}</div>

                <div class="pc-dose-temp">
                    <div class="pc-dose">
                        <div class="pc-field-label">粉量 *</div>
                        <div class="pc-stepper">
                            <button type="button" data-act="dose" data-d="-1" aria-label="減 ${DOSE_STEP} g"><i class="bi bi-dash-lg"></i></button>
                            <input inputmode="decimal" value="${esc(ed.dose)}" data-f="dose" aria-label="粉量">
                            <span>g</span>
                            <button type="button" data-act="dose" data-d="1" aria-label="加 ${DOSE_STEP} g"><i class="bi bi-plus-lg"></i></button>
                        </div>
                    </div>
                    <div class="pc-temp">
                        <div class="pc-field-label">水溫 <span class="pc-hint">每注可另設</span></div>
                        <div class="pc-temp-scale">
                            ${TEMPS.map(t => `<button type="button" class="${num(ed.temp) === t ? 'active' : ''}" data-act="temp" data-val="${t}" aria-pressed="${num(ed.temp) === t}">${tempLabel(t)}</button>`).join('')}
                        </div>
                        <label class="pc-temp-other ${ed.temp && !tempIsPreset ? 'active' : ''}">其他
                            <input inputmode="decimal" value="${tempIsPreset ? '' : esc(ed.temp)}" placeholder="—" data-f="temp" aria-label="其他水溫"> °C</label>
                    </div>
                </div>
            </div></div>

            ${summaryCard(rows, s, { live: true })}

            <div class="pc-timeline">${nodes}
                <div class="pc-node pc-node-add">
                    <div class="pc-rail"><span class="pc-dot pc-dot-add"></span></div>
                    <div class="pc-body pc-add">
                        <button type="button" class="pc-add-btn" data-act="add-pour" ${full ? 'disabled' : ''}><i class="bi bi-droplet-fill"></i> 注水</button>
                        <button type="button" class="pc-add-btn pc-add-wait" data-act="add-wait" ${full ? 'disabled' : ''}><i class="bi bi-hourglass-split"></i> 等待</button>
                    </div>
                </div>
            </div>
            ${ed.errors.length ? `<div class="alert alert-danger py-2 small">${ed.errors.map(esc).join('<br>')}</div>` : ''}
            <button type="submit" class="btn btn-primary w-100">儲存</button>
        </form>`;
    }

    // 收起時：這一步有設定的東西用小標籤提示（悶蒸 / 水溫 / 備註）
    function stepTags(st) {
        const tags = [];
        if (st.bloom) tags.push('<span class="pc-tag pc-tag-bloom">悶蒸</span>');
        if (st.temp_c != null) tags.push(`<span class="pc-tag pc-tag-temp"><i class="bi bi-thermometer-half"></i>${tempLabel(st.temp_c)}</span>`);
        if (st.note) tags.push(`<span class="pc-tag pc-tag-note"><i class="bi bi-chat-left-text"></i>${esc(st.note)}</span>`);
        return tags.length ? `<div class="pc-tags">${tags.join('')}</div>` : '';
    }

    function editNode(st, i, row, s) {
        const tagSrc = { bloom: st.bloom, temp_c: valid(num(st.temp)) ? num(st.temp) : null, note: st.note.trim() };
        const more = `<button type="button" class="pc-icon-btn pc-more ${st.open ? 'active' : ''}" data-act="open" data-i="${i}" aria-expanded="${st.open}" aria-label="這一步的設定"><i class="bi bi-sliders"></i></button>`;
        const del = `<button type="button" class="pc-icon-btn" data-act="del" data-i="${i}" aria-label="刪除這步"><i class="bi bi-x-lg"></i></button>`;
        const gap = `style="margin-top:${gapPx(row.gap)}px"`;
        if (st.type === 'wait') {
            return `<div class="pc-node pc-node-wait" data-node="${i}" ${gap}>
                <div class="pc-rail"><span class="pc-wait-icon"><i class="bi bi-hourglass-split"></i></span></div>
                <div class="pc-body">
                    <div class="pc-row">
                        <span class="pc-wait-label">等到</span>
                        <input class="form-control form-control-sm pc-in-time" inputmode="numeric" placeholder="m:ss" value="${esc(st.time)}" data-sf="time" data-i="${i}" aria-label="等到">
                        <span class="pc-dur" data-dur="${i}">${row.dur != null ? `等 ${fmtDur(row.dur)}` : ''}</span>
                        ${more}${del}
                    </div>
                    ${st.open ? `<div class="pc-panel">
                        <input class="form-control form-control-sm" maxlength="100" placeholder="備註（例：輕搖、等待滴完）" value="${esc(st.note)}" data-sf="note" data-i="${i}" aria-label="備註">
                    </div>` : stepTags(tagSrc)}
                </div></div>`;
        }
        return `<div class="pc-node pc-node-pour" data-node="${i}" ${gap}>
            <div class="pc-rail"><span class="pc-dot ${st.bloom ? 'is-bloom' : ''}" data-dot="${i}" style="--s:${dotSize(row.inc, s.maxInc)}px"></span></div>
            <div class="pc-body">
                <div class="pc-row">
                    <input class="form-control form-control-sm pc-in-time" inputmode="numeric" placeholder="m:ss" value="${esc(st.time)}" data-sf="time" data-i="${i}" aria-label="時間">
                    <span class="pc-amount"><span class="pc-plus">+</span><input class="form-control form-control-sm pc-in-g ${row.bad ? 'is-invalid' : ''}" inputmode="decimal" placeholder="0" value="${esc(st.val)}" data-sf="val" data-i="${i}" aria-label="這注的水量"><span class="pc-unit">g</span></span>
                    <span class="pc-cum" data-cum="${i}">${row.cum != null ? `累計 ${fmtG(row.cum)}` : ''}</span>
                    ${more}${del}
                </div>
                <div class="pc-bar"><span data-bar="${i}" style="width:${barPct(row.inc, s.maxInc)}%"></span></div>
                ${st.open ? `<div class="pc-panel">
                    ${i === 0 ? `<label class="pc-panel-bloom"><input type="checkbox" class="form-check-input" data-sf="bloom" data-i="${i}" ${st.bloom ? 'checked' : ''}> 悶蒸</label>` : ''}
                    <span class="pc-panel-temp"><i class="bi bi-thermometer-half"></i><input class="form-control form-control-sm" inputmode="decimal" placeholder="${esc(ed.temp || '—')}" value="${esc(st.temp)}" data-sf="temp" data-i="${i}" aria-label="這注的水溫">°C</span>
                    <input class="form-control form-control-sm" maxlength="100" placeholder="備註" value="${esc(st.note)}" data-sf="note" data-i="${i}" aria-label="備註">
                </div>` : stepTags(tagSrc)}
            </div></div>`;
    }

    function viewDetail(p) {
        const rows = planRows(p);
        const s = summarize(rows, p.dose_g);
        const meta = [
            p.method, p.grind && `研磨 ${p.grind}`, `粉 ${fmtG(p.dose_g)} g`, p.temp_c != null && tempLabel(p.temp_c),
        ].filter(Boolean);
        const nodes = rows.map(r => {
            const gap = `style="margin-top:${gapPx(r.gap)}px"`;
            const muted = [r.temp_c != null && `${tempLabel(r.temp_c)}`, r.note].filter(Boolean);
            const sub = muted.length ? `<div class="proto-muted">${muted.map(esc).join(' · ')}</div>` : '';
            if (r.type === 'wait') {
                return `<div class="pc-node pc-node-wait" ${gap}>
                    <div class="pc-rail"><span class="pc-wait-icon"><i class="bi bi-hourglass-split"></i></span></div>
                    <div class="pc-body"><div class="pc-row pc-row-ro">
                        <span class="pc-ro-time">${fmtTime(r.t)}</span><span class="pc-wait-label">等到 ${fmtTime(r.t)}</span><span class="pc-dur">等 ${fmtDur(r.dur)}</span>
                    </div>${sub}</div></div>`;
            }
            return `<div class="pc-node pc-node-pour" ${gap}>
                <div class="pc-rail"><span class="pc-dot ${r.bloom ? 'is-bloom' : ''}" style="--s:${dotSize(r.inc, s.maxInc)}px"></span></div>
                <div class="pc-body"><div class="pc-row pc-row-ro">
                    <span class="pc-ro-time">${fmtTime(r.t)}</span><span class="pc-ro-g">+${fmtG(r.inc)} g</span><span class="pc-cum">累計 ${fmtG(r.cum)} g</span>${r.bloom ? '<span class="pc-tag pc-tag-bloom">悶蒸</span>' : ''}
                </div>
                <div class="pc-bar"><span style="width:${barPct(r.inc, s.maxInc)}%"></span></div>${sub}</div></div>`;
        }).join('');
        return `${topBar(esc(p.name), 'list', '<span class="pc-badge"><i class="bi bi-lock-fill"></i> 內建</span>')}
        ${p.description ? `<p class="pc-desc">${esc(p.description)}</p>` : ''}
        <div class="pc-item-tags mb-2">${meta.map(m => `<span class="pc-meta">${esc(m)}</span>`).join('')}</div>
        ${summaryCard(rows, s)}
        <div class="pc-timeline pc-timeline-ro">${nodes}</div>
        <a class="btn btn-primary w-100" href="${href(`copy/${p.id}`)}"><i class="bi bi-copy me-1"></i>複製成我的</a>`;
    }

    // ─── 浮動切換列（只有 PROTOTYPE 路由會出現）──────────────────────────────
    function switcherMarkup(screenKey) {
        const keys = Object.keys(VARIANTS);
        return `<div class="proto-switcher" role="toolbar" aria-label="PROTOTYPE 版本切換">
            <button type="button" data-sw="-1" aria-label="上一個版本"><i class="bi bi-chevron-left"></i></button>
            <span class="proto-switcher-label">PROTOTYPE ${v()}・${VARIANTS[v()]} <small>${keys.indexOf(v()) + 1}/${keys.length}</small></span>
            <button type="button" data-sw="1" aria-label="下一個版本"><i class="bi bi-chevron-right"></i></button>
            <select data-sw-screen aria-label="畫面">
                ${SCREENS.map(([k, label]) => `<option value="${k}" ${k === screenKey ? 'selected' : ''}>${label}</option>`).join('')}
                ${SCREENS.some(([k]) => k === screenKey) ? '' : `<option value="${esc(screenKey)}" selected>（目前）</option>`}
            </select>
        </div>`;
    }
    function cycle(dir) {
        const keys = Object.keys(VARIANTS);
        const next = keys[(keys.indexOf(v()) + dir + keys.length) % keys.length];
        location.replace(`#/${parseHash().parts.join('/')}?variant=${next}`);
    }
    document.addEventListener('keydown', e => {
        if (!location.hash.startsWith('#/proto-plans')) return;
        if (e.target.closest('input, textarea, select, [contenteditable]')) return;
        if (e.key === 'ArrowLeft') cycle(-1);
        if (e.key === 'ArrowRight') cycle(1);
    });

    // ─── 掛載 ─────────────────────────────────────────────────────────────────
    function viewProtoPlans(root, parts) {
        if (!['localhost', '127.0.0.1'].includes(location.hostname)) {
            viewNotFound(root);
            return;
        }
        const screen = parts.slice(1);
        const screenKey = screen.join('/') || 'list';
        let html;
        if (screen[0] === 'me') {
            html = viewMe();
        } else if (screen[0] === 'plan' || screen[0] === 'new' || screen[0] === 'copy') {
            const p = screen[1] ? findPlan(screen[1]) : null;
            if (screen[0] === 'plan' && p?.builtin) {
                html = viewDetail(p);
            } else {
                // 換版本時保留編輯中的內容，才能拿同一份資料比較
                if (edKey !== screenKey || !ed) {
                    ed = planToEditor(p, { copy: screen[0] === 'copy' });
                    edKey = screenKey;
                }
                html = viewEdit();
            }
        } else {
            html = viewList();
        }
        root.innerHTML = `<div class="proto-plans proto-${v()}">${html}</div>${switcherMarkup(screenKey)}`;
        bind(root);
    }

    function rerender() { renderRoute(); }

    // 打字時只更新衍生的部分，不重畫（不然游標會跑掉）
    function refreshDerived(wrap) {
        const rows = editorRows();
        const s = summarize(rows, num(ed.dose));
        rows.forEach((r, i) => {
            const node = wrap.querySelector(`[data-node="${i}"]`);
            if (node) node.style.marginTop = `${gapPx(r.gap)}px`;
            const cum = wrap.querySelector(`[data-cum="${i}"]`);
            if (cum) cum.textContent = r.cum != null ? `累計 ${fmtG(r.cum)}` : '';
            const dot = wrap.querySelector(`[data-dot="${i}"]`);
            if (dot) dot.style.setProperty('--s', `${dotSize(r.inc, s.maxInc)}px`);
            const bar = wrap.querySelector(`[data-bar="${i}"]`);
            if (bar) bar.style.width = `${barPct(r.inc, s.maxInc)}%`;
            const dur = wrap.querySelector(`[data-dur="${i}"]`);
            if (dur) dur.textContent = r.dur != null ? `等 ${fmtDur(r.dur)}` : '';
            const val = wrap.querySelector(`[data-sf="val"][data-i="${i}"]`);
            if (val) val.classList.toggle('is-invalid', !!r.bad);
        });
        const text = { total: `${fmtG(s.total)} g`, ratio: s.ratio, pours: `${s.pours} 次`, end: fmtTime(s.end) || '—' };
        wrap.querySelectorAll('[data-stat]').forEach(el => { el.textContent = text[el.dataset.stat]; });
        const c = wrap.querySelector('[data-chart]');
        if (c) c.innerHTML = chart(rows, s);
    }

    function addTag(wrap) {
        const t = ed.tagDraft.trim().replace(/^#/, '');
        ed.tagDraft = '';
        if (t && !ed.tags.includes(t)) ed.tags.push(t);
        rerender();
        wrap.ownerDocument.querySelector('[data-tag-new]')?.focus();
    }

    function bind(root) {
        const wrap = root.querySelector('.proto-plans');
        const bar = root.querySelector('.proto-switcher');
        bar.addEventListener('click', e => {
            const b = e.target.closest('[data-sw]');
            if (b) cycle(Number(b.dataset.sw));
        });
        bar.querySelector('[data-sw-screen]').addEventListener('change', e => {
            location.hash = `#/proto-plans/${e.target.value}?variant=${v()}`;
        });

        wrap.addEventListener('click', e => {
            const t = e.target.closest('[data-act]');
            if (!t) return;
            const act = t.dataset.act;
            const i = Number(t.dataset.i);
            const val = t.dataset.val;
            const blank = type => ({ type, time: '', val: '', bloom: false, temp: '', note: '', open: false });
            if (act === 'filter') ui.tag = val;
            else if (act === 'tag') ed.tags = ed.tags.includes(val) ? ed.tags.filter(x => x !== val) : [...ed.tags, val];
            else if (act === 'method') {
                ed.methodOther = val === '其他' ? !ed.methodOther : false;
                ed.method = val === '其他' ? '' : (ed.method === val ? '' : val);
            } else if (act === 'grind') ed.grind = ed.grind === val ? '' : val;
            else if (act === 'temp') ed.temp = num(ed.temp) === Number(val) ? '' : val;
            else if (act === 'dose') {
                const cur = num(ed.dose);
                ed.dose = valid(cur)
                    ? fmtG(Math.min(100, Math.max(DOSE_STEP, r1(cur + Number(t.dataset.d) * DOSE_STEP))))
                    : '15'; // 空白時先給一個常用值
            } else if (act === 'open') ed.steps[i].open = !ed.steps[i].open;
            else if (act === 'add-pour') ed.steps.push(blank('pour'));
            else if (act === 'add-wait') ed.steps.push(blank('wait'));
            else if (act === 'del') ed.steps.splice(i, 1);
            else if (act === 'delete-plan') {
                confirmDialog({ title: '刪除計劃', message: `確定刪除「${ed.name}」？`, confirmText: '刪除', danger: true })
                    .then(ok => {
                        if (!ok) return;
                        const k = mine.findIndex(p => p.id === ed.srcId);
                        if (k >= 0) mine.splice(k, 1);
                        ed = null;
                        edKey = null;
                        location.hash = href('list');
                    });
                return;
            } else return;
            rerender();
        });
        wrap.addEventListener('change', e => {
            const t = e.target;
            if (t.dataset.sf === 'bloom') { ed.steps[Number(t.dataset.i)].bloom = t.checked; rerender(); }
            if (t.matches('[data-tag-new]') && t.value.trim()) addTag(wrap);
        });
        wrap.addEventListener('keydown', e => {
            if (e.target.matches('[data-tag-new]') && e.key === 'Enter') {
                e.preventDefault();
                addTag(wrap);
            }
        });
        wrap.addEventListener('input', e => {
            const t = e.target;
            if (t.matches('[data-tag-new]')) { ed.tagDraft = t.value; return; }
            if (t.dataset.f) ed[t.dataset.f] = t.value;
            else if (t.dataset.sf && t.dataset.sf !== 'bloom') ed.steps[Number(t.dataset.i)][t.dataset.sf] = t.value;
            else return;
            refreshDerived(wrap);
        });
        wrap.querySelector('form.proto-form')?.addEventListener('submit', e => {
            e.preventDefault();
            if (!save()) { rerender(); return; }
            showToast('PROTOTYPE：只存在記憶體（console 有送出的內容）');
            ed = null;
            edKey = null;
            location.hash = href('list');
        });
    }

    window.viewProtoPlans = viewProtoPlans;
}());
