// ═══ PROTOTYPE — 拋棄式，不要合進 main ══════════════════════════════════════
// sean2249/coffee-review#146 沖煮計劃表 ②：三個 375px 版本，在同一個拋棄式路由
// #/proto-plans/<screen>?variant=A|B|C 上，用底部浮動列（或 ← →）切換。
//   A 表格：一列一步、資訊密  B 卡片：每步一張、大按鈕  C 時間軸：等待是兩注之間的一段
// 資料全在記憶體（重新整理就回到樣本），沒有 API、D1、migration；只在 localhost 開。
// screen：me | list | plan/<id>（內建 → 唯讀詳細；我的 → 編輯）| new | copy/<id>
/* global window, document, location, console, escapeHtml, parseHash, renderRoute, viewNotFound, confirmDialog, showToast */
(function () {
    'use strict';

    const VARIANTS = { A: '表格', B: '卡片', C: '時間軸' };
    const SCREENS = [
        ['me', '個人'], ['list', '清單'], ['plan/mine-46', '編輯'],
        ['new', '新增'], ['plan/builtin-hoffmann-2', '內建詳細'],
    ];
    const MAX_STEPS = 30;

    // ─── 樣本資料（內建取自 #143 的表格；⚠ 欄位是 AI 暫定值）─────────────
    const pour = (at, to, extra = {}) => ({ type: 'pour', at_seconds: at, to_g: to, ...extra });
    const wait = (until, note) => ({ type: 'wait', until_seconds: until, ...(note ? { note } : {}) });

    const BUILTIN = [
        {
            id: 'builtin-46', builtin: true, name: '粕谷哲 4:6', tags: ['V60', '分段'],
            method: 'V60', grind: '粗', dose_g: 20, temp_c: 92, finish_seconds: 210,
            description: '前 40%（兩注）調甜度與酸度，後 60%（三注）調濃度。',
            steps: [pour(0, 60), pour(45, 120), pour(90, 180), pour(135, 240), pour(180, 300)],
        },
        {
            id: 'builtin-hoffmann-2', builtin: true, name: 'James Hoffmann Ultimate V60（2 杯）', tags: ['V60', '2 杯'],
            method: 'V60', grind: '中細', dose_g: 30, temp_c: 100, finish_seconds: 210,
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
            method: 'V60', grind: '中細', dose_g: 15, temp_c: 94, finish_seconds: 180,
            description: '1 杯量；悶蒸後分 4 次小注。',
            steps: [
                pour(0, 50, { bloom: true }), wait(45, '輕搖'),
                pour(45, 100), pour(70, 150), pour(90, 200), pour(110, 250),
                wait(180, '輕轉濾杯，等待滴完'),
            ],
        },
        {
            id: 'builtin-rao', builtin: true, name: 'Scott Rao V60', tags: ['V60'],
            method: 'V60', grind: '中細', dose_g: 20, temp_c: null, finish_seconds: 255,
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
            id: 'mine-46', name: '4:6 改・淺焙', tags: ['淺焙', 'V60'], method: 'V60', grind: '中粗',
            dose_g: 20, temp_c: 94, finish_seconds: 215, updated_at: '2026-10-26',
            description: '照 4:6，後三注水溫降一點。',
            steps: [pour(0, 60, { bloom: true }), pour(45, 120), pour(90, 180, { temp_c: 90 }),
                pour(135, 240, { temp_c: 90 }), pour(180, 300, { temp_c: 90, note: '注完輕轉' })],
        },
        {
            id: 'mine-daily', name: '日常 15 g', tags: ['日常', 'V60'], method: 'V60', grind: '中細',
            dose_g: 15, temp_c: 93, finish_seconds: 165, updated_at: '2026-10-20', description: '',
            steps: [pour(0, 45, { bloom: true }), wait(35, '輕搖'), pour(35, 150), pour(75, 250)],
        },
        {
            id: 'mine-ice', name: '冰手沖 Kalita', tags: ['冰咖啡'], method: 'Kalita Wave 185', grind: '中細',
            dose_g: 20, temp_c: 94, finish_seconds: 150, updated_at: '2026-10-11',
            description: '下壺先放冰塊 120 g；熱水只注 160 g。',
            steps: [pour(0, 40, { bloom: true }), pour(35, 100), pour(70, 160), wait(150, '攪拌讓冰融')],
        },
    ];

    // ─── 共用計算（這是「邏輯」，三個版本共用；版面各自寫）──────────────────
    const r1 = n => Math.round(n * 10) / 10;
    const fmtG = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));
    function fmtTime(s) {
        if (s == null || s === '' || Number.isNaN(s)) return '';
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
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
    function planStats(p) {
        const pours = p.steps.filter(s => s.type === 'pour');
        const total = pours.length ? pours[pours.length - 1].to_g : 0;
        return { total, ratio: ratioText(total, p.dose_g), cuts: Math.max(0, pours.length - 1) };
    }
    // 唯讀用：每注的本次 / 累計
    function pourPairs(steps) {
        let prev = 0;
        return steps.map(s => {
            if (s.type !== 'pour') return null;
            const inc = r1(s.to_g - prev);
            prev = s.to_g;
            return { inc, cum: s.to_g };
        });
    }
    function allPlans() { return [...mine, ...BUILTIN]; }
    function findPlan(id) { return allPlans().find(p => p.id === id) || null; }

    // ─── 編輯器狀態：步驟的水量是「目前模式的字串」，切換時整批換算 ────────
    let ed = null;
    let edKey = null;

    function planToEditor(p, { copy } = {}) {
        return {
            srcId: copy ? null : (p?.id ?? null),
            mode: 'cum', advanced: false, errors: [],
            name: p ? (copy ? `${p.name}（複製）` : p.name) : '',
            description: p?.description ?? '', tags: (p?.tags ?? []).join('、'),
            method: p?.method ?? '', grind: p?.grind ?? '',
            dose: p?.dose_g != null ? String(p.dose_g) : '',
            temp: p?.temp_c != null ? String(p.temp_c) : '',
            finish: p?.finish_seconds != null ? fmtTime(p.finish_seconds) : '',
            steps: (p?.steps ?? [pour(0, '', { bloom: true })]).map(s => ({
                type: s.type,
                time: fmtTime(s.type === 'pour' ? s.at_seconds : s.until_seconds),
                val: s.type === 'pour' && s.to_g !== '' ? String(s.to_g) : '',
                bloom: !!s.bloom,
                temp: s.temp_c != null ? String(s.temp_c) : '',
                note: s.note ?? '',
            })),
        };
    }

    // 換算不遺失：空白 / 不合法的格子原樣保留，以前一個有值的注水為準
    function convertMode(to) {
        if (ed.mode === to) return;
        let prevCum = 0;
        for (const s of ed.steps) {
            if (s.type !== 'pour') continue;
            const x = num(s.val);
            if (!valid(x)) continue;
            if (to === 'inc') {
                s.val = fmtG(r1(x - prevCum));
                prevCum = x;
            } else {
                const c = r1(prevCum + x);
                s.val = fmtG(c);
                prevCum = c;
            }
        }
        ed.mode = to;
    }

    // 每一步的衍生值：{ cum, inc, bad }；以及總水量 / 粉水比 / 斷水
    function derive() {
        let prevCum = 0;
        let total = 0;
        let pours = 0;
        const rows = ed.steps.map(s => {
            if (s.type !== 'pour') return null;
            pours++;
            const x = num(s.val);
            if (!valid(x)) return { cum: null, inc: null, bad: Number.isNaN(x) };
            const cum = ed.mode === 'cum' ? x : r1(prevCum + x);
            const inc = ed.mode === 'cum' ? r1(x - prevCum) : x;
            prevCum = cum;
            total = cum;
            return { cum, inc, bad: inc <= 0 };
        });
        return { rows, total, ratio: ratioText(total, num(ed.dose)), cuts: Math.max(0, pours - 1) };
    }
    // 小字的「另一個值」
    function otherText(row) {
        if (!row || row.cum == null) return '—';
        return ed.mode === 'cum' ? `${row.inc > 0 ? '+' : ''}${fmtG(row.inc)} g` : `累計 ${fmtG(row.cum)} g`;
    }

    function validate() {
        const errs = [];
        const d = derive();
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
                const r = d.rows[i];
                if (!r || r.cum == null) errs.push(`第 ${i + 1} 步水量必填`);
                else if (r.bad) errs.push(ed.mode === 'inc' ? `第 ${i + 1} 步本次要大於 0` : `第 ${i + 1} 步累計要大於前一注`);
            }
        });
        return errs;
    }

    function save() {
        ed.errors = validate();
        if (ed.errors.length) return false;
        convertMode('cum'); // 存檔一律換成累計
        const note = s => (s.note.trim() ? { note: s.note.trim() } : {});
        const plan = {
            id: ed.srcId || `mine-${Date.now()}`,
            name: ed.name.trim(), description: ed.description.trim(),
            tags: ed.tags.split(/[、,，\s]+/).filter(Boolean),
            method: ed.method.trim(), grind: ed.grind.trim(),
            dose_g: num(ed.dose), temp_c: valid(num(ed.temp)) ? num(ed.temp) : null,
            finish_seconds: valid(parseTime(ed.finish)) ? parseTime(ed.finish) : null,
            updated_at: new Date().toISOString().slice(0, 10),
            steps: ed.steps.map(s => (s.type === 'pour'
                ? {
                    type: 'pour', at_seconds: parseTime(s.time), to_g: num(s.val),
                    ...(s.bloom ? { bloom: true } : {}),
                    ...(valid(num(s.temp)) ? { temp_c: num(s.temp) } : {}),
                    ...note(s),
                }
                : { type: 'wait', until_seconds: parseTime(s.time), ...note(s) })),
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
        return VARIANTS[q] ? q : 'A';
    }
    const href = screen => `#/proto-plans/${screen}?variant=${v()}`;
    function allTags() { return [...new Set(allPlans().flatMap(p => p.tags))]; }
    function filtered(list) { return ui.tag ? list.filter(p => p.tags.includes(ui.tag)) : list; }

    // ═══ Variant A — 表格 ═════════════════════════════════════════════════════
    const A = {
        me() {
            return `${meAccountCard()}
            <a class="card stats-entry-card" href="#/stats">
                <span class="stats-entry-label"><i class="bi bi-bar-chart-line"></i>我的數據</span>
                <i class="bi bi-chevron-right"></i>
            </a>
            <a class="card stats-entry-card" href="${href('list')}">
                <span class="stats-entry-label"><i class="bi bi-cup-hot"></i>沖煮計劃</span>
                <i class="bi bi-chevron-right"></i>
            </a>`;
        },
        list() {
            const row = p => {
                const s = planStats(p);
                return `<a class="pa-row" href="${href(`plan/${p.id}`)}">
                    <div class="pa-row-main">
                        <div class="pa-row-name">${p.builtin ? '<i class="bi bi-lock-fill pa-lock"></i>' : ''}${esc(p.name)}</div>
                        <div class="pa-row-meta">${esc(p.method || '—')}${p.tags.map(t => ` · <span class="pa-tag">#${esc(t)}</span>`).join('')}</div>
                    </div>
                    <div class="pa-row-nums">
                        <div>${fmtG(p.dose_g)} / ${fmtG(s.total)} g</div>
                        <div class="pa-row-sub">${s.ratio} · 斷水 ${s.cuts}</div>
                    </div>
                </a>`;
            };
            const my = filtered(mine);
            const bi = filtered(BUILTIN);
            return `${backHeader('沖煮計劃', 'me', `<a class="btn btn-primary btn-sm" href="${href('new')}"><i class="bi bi-plus-lg me-1"></i>新增</a>`)}
            <div class="pa-chips" role="group" aria-label="標籤篩選">
                ${['', ...allTags()].map(t => `<button type="button" class="pa-chip ${ui.tag === t ? 'active' : ''}" data-act="tag" data-tag="${esc(t)}">${t ? `#${esc(t)}` : '全部'}</button>`).join('')}
            </div>
            <div class="pa-section-title">我的計劃 <span>${my.length}</span></div>
            <div class="card pa-table">${my.map(row).join('') || '<div class="pa-empty">沒有符合的計劃</div>'}</div>
            <div class="pa-section-title">內建手沖法 <span>${bi.length}</span></div>
            <div class="card pa-table">${bi.map(row).join('') || '<div class="pa-empty">沒有符合的計劃</div>'}</div>`;
        },
        edit() {
            const d = derive();
            const full = ed.steps.length >= MAX_STEPS;
            const rows = ed.steps.map((s, i) => {
                const adv = ed.advanced ? `<div class="pa-adv">
                    ${s.type === 'pour' ? `<input class="form-control form-control-sm pa-in-temp" inputmode="decimal" placeholder="${esc(ed.temp || '水溫')}" value="${esc(s.temp)}" data-sf="temp" data-i="${i}" aria-label="水溫"><span class="pa-unit">°C</span>` : ''}
                    <input class="form-control form-control-sm" placeholder="備註（例：輕搖）" maxlength="100" value="${esc(s.note)}" data-sf="note" data-i="${i}" aria-label="備註">
                </div>` : '';
                if (s.type === 'wait') {
                    return `<div class="pa-step pa-step-wait">
                        <div class="pa-step-main">
                            <span class="pa-idx"><i class="bi bi-hourglass-split"></i></span>
                            <span class="pa-wait-label">等到</span>
                            <input class="form-control form-control-sm pa-in-time" inputmode="numeric" placeholder="m:ss" value="${esc(s.time)}" data-sf="time" data-i="${i}" aria-label="等到">
                            <span class="pa-other pa-wait-note">${ed.advanced ? '' : esc(s.note)}</span>
                            <button type="button" class="btn btn-link btn-sm pa-del" data-act="del" data-i="${i}" aria-label="刪除這步"><i class="bi bi-x-lg"></i></button>
                        </div>${adv}</div>`;
                }
                const r = d.rows[i];
                return `<div class="pa-step">
                    <div class="pa-step-main">
                        <span class="pa-idx"><i class="bi bi-droplet-fill"></i></span>
                        <input class="form-control form-control-sm pa-in-time" inputmode="numeric" placeholder="m:ss" value="${esc(s.time)}" data-sf="time" data-i="${i}" aria-label="時間">
                        <input class="form-control form-control-sm pa-in-g ${r?.bad ? 'is-invalid' : ''}" inputmode="decimal" placeholder="g" value="${esc(s.val)}" data-sf="val" data-i="${i}" aria-label="${ed.mode === 'cum' ? '累計' : '本次'}水量">
                        <span class="pa-other" data-other="${i}">${otherText(r)}</span>
                        <button type="button" class="btn btn-link btn-sm pa-del" data-act="del" data-i="${i}" aria-label="刪除這步"><i class="bi bi-x-lg"></i></button>
                    </div>
                    ${i === 0 ? `<label class="pa-bloom"><input type="checkbox" class="form-check-input" data-sf="bloom" data-i="${i}" ${s.bloom ? 'checked' : ''}> 悶蒸</label>` : ''}
                    ${adv}</div>`;
            }).join('');
            return `${backHeader(ed.srcId ? '編輯計劃' : '新增計劃', 'list', ed.srcId ? '<button type="button" class="btn btn-link btn-sm text-danger" data-act="delete-plan" aria-label="刪除"><i class="bi bi-trash"></i></button>' : '')}
            <div class="pa-stats">
                <div><span class="pa-stat-num" data-stat="total">${fmtG(d.total)} g</span><span class="pa-stat-label">總水量</span></div>
                <div><span class="pa-stat-num" data-stat="ratio">${d.ratio}</span><span class="pa-stat-label">粉水比</span></div>
                <div><span class="pa-stat-num" data-stat="cuts">${d.cuts}</span><span class="pa-stat-label">斷水次數</span></div>
            </div>
            <form class="proto-form" novalidate>
                <div class="card"><div class="card-body">${basicFields()}</div></div>
                <div class="card"><div class="card-body">
                    <div class="pa-steps-head">
                        <span class="card-title mb-0"><i class="bi bi-list-ol"></i>步驟</span>
                        ${modeToggle('pa-seg')}
                    </div>
                    <div class="pa-steps-cols"><span></span><span>時間</span><span>${ed.mode === 'cum' ? '累計 g' : '本次 g'}</span><span>${ed.mode === 'cum' ? '本次' : '累計'}</span><span></span></div>
                    ${rows}
                    <div class="pa-add">
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-act="add-pour" ${full ? 'disabled' : ''}><i class="bi bi-plus-lg"></i> 注水</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-act="add-wait" ${full ? 'disabled' : ''}><i class="bi bi-plus-lg"></i> 等待</button>
                        <button type="button" class="btn btn-link btn-sm ms-auto pa-adv-btn" data-act="adv" aria-expanded="${ed.advanced}">進階 <i class="bi bi-chevron-${ed.advanced ? 'up' : 'down'}"></i></button>
                    </div>
                    ${errorsBox()}
                </div></div>
                <button type="submit" class="btn btn-primary w-100">儲存</button>
            </form>`;
        },
        detail(p) {
            const s = planStats(p);
            const pairs = pourPairs(p.steps);
            return `${backHeader(p.name, 'list')}
            <div class="pa-badge"><i class="bi bi-lock-fill"></i> 內建・唯讀</div>
            ${p.description ? `<p class="pa-desc">${esc(p.description)}</p>` : ''}
            <div class="card"><div class="card-body pa-kv">
                ${kv('濾杯', p.method)}${kv('研磨', p.grind)}${kv('粉量', `${fmtG(p.dose_g)} g`)}
                ${kv('水溫', p.temp_c != null ? `${p.temp_c}°C` : '')}${kv('預計完成', fmtTime(p.finish_seconds))}
                ${kv('總水量', `${fmtG(s.total)} g`)}${kv('粉水比', s.ratio)}${kv('斷水', `${s.cuts} 次`)}
            </div></div>
            <div class="card pa-table">
                ${p.steps.map((st, i) => `<div class="pa-drow">
                    <span class="pa-dtime">${fmtTime(st.type === 'pour' ? st.at_seconds : st.until_seconds)}</span>
                    <div class="pa-dmain">
                        ${st.type === 'pour'
                            ? `注水${st.bloom ? '（悶蒸）' : ''} <b>+${fmtG(pairs[i].inc)} g</b> · 累計 ${fmtG(pairs[i].cum)} g`
                            : `<span class="text-muted">等到 ${fmtTime(st.until_seconds)}</span>`}
                        ${stepMuted(st)}
                    </div>
                </div>`).join('')}
            </div>
            <a class="btn btn-primary w-100" href="${href(`copy/${p.id}`)}"><i class="bi bi-copy me-1"></i>複製成我的</a>`;
        },
    };

    // ═══ Variant B — 卡片 ═════════════════════════════════════════════════════
    const B = {
        me() {
            return `${meAccountCard()}
            <div class="card pb-tools">
                <a class="pb-tool" href="#/stats">
                    <i class="bi bi-bar-chart-line pb-tool-icon"></i>
                    <span><b>我的數據</b><small>評分分佈、常去店家</small></span>
                    <i class="bi bi-chevron-right"></i>
                </a>
                <a class="pb-tool" href="${href('list')}">
                    <i class="bi bi-cup-hot pb-tool-icon"></i>
                    <span><b>沖煮計劃</b><small>${mine.length} 個我的 · ${BUILTIN.length} 個內建手沖法</small></span>
                    <i class="bi bi-chevron-right"></i>
                </a>
            </div>`;
        },
        list() {
            const card = p => {
                const s = planStats(p);
                return `<a class="pb-plan ${p.builtin ? 'is-builtin' : ''}" href="${href(`plan/${p.id}`)}">
                    <div class="pb-plan-ratio"><b>${s.ratio}</b><small>${fmtG(p.dose_g)} g</small></div>
                    <div class="pb-plan-body">
                        <div class="pb-plan-name">${esc(p.name)}</div>
                        <div class="pb-plan-meta">${esc(p.method || '—')} · 總水量 ${fmtG(s.total)} g · 斷水 ${s.cuts}</div>
                        <div class="pb-plan-tags">${p.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>
                    </div>
                </a>`;
            };
            const my = filtered(mine);
            const bi = filtered(BUILTIN);
            return `${backHeader('沖煮計劃', 'me')}
            <div class="pb-pills">
                ${['', ...allTags()].map(t => `<button type="button" class="pb-pill ${ui.tag === t ? 'active' : ''}" data-act="tag" data-tag="${esc(t)}">${t ? esc(t) : '全部'}</button>`).join('')}
            </div>
            <h6 class="pb-h">我的計劃</h6>
            ${my.map(card).join('') || '<div class="empty-state">沒有符合的計劃</div>'}
            <a class="pb-new" href="${href('new')}"><i class="bi bi-plus-circle"></i> 新增計劃</a>
            <h6 class="pb-h">內建手沖法 <small>唯讀，可複製成我的</small></h6>
            ${bi.map(card).join('') || '<div class="empty-state">沒有符合的計劃</div>'}`;
        },
        edit() {
            const d = derive();
            const full = ed.steps.length >= MAX_STEPS;
            let n = 0;
            const cards = ed.steps.map((s, i) => {
                const adv = ed.advanced ? `<div class="pb-adv">
                    ${s.type === 'pour' ? `<label class="pb-adv-temp">水溫<span class="pb-unit-wrap"><input class="form-control" inputmode="decimal" placeholder="${esc(ed.temp || '—')}" value="${esc(s.temp)}" data-sf="temp" data-i="${i}"><span>°C</span></span></label>` : ''}
                    <label class="pb-adv-note">備註<input class="form-control" maxlength="100" placeholder="例：輕搖" value="${esc(s.note)}" data-sf="note" data-i="${i}"></label>
                </div>` : '';
                if (s.type === 'wait') {
                    return `<div class="pb-step pb-step-wait">
                        <div class="pb-step-head"><span><i class="bi bi-hourglass-split"></i> 等待</span>
                            <button type="button" class="btn btn-link btn-sm pb-del" data-act="del" data-i="${i}" aria-label="刪除這步"><i class="bi bi-trash"></i></button></div>
                        <div class="pb-step-main">
                            <label>等到<input class="form-control form-control-lg" inputmode="numeric" placeholder="m:ss" value="${esc(s.time)}" data-sf="time" data-i="${i}"></label>
                            <div class="pb-wait-note">${ed.advanced ? '' : esc(s.note || '')}</div>
                        </div>${adv}</div>`;
                }
                n++;
                const r = d.rows[i];
                return `<div class="pb-step">
                    <div class="pb-step-head"><span><i class="bi bi-droplet-fill"></i> 第 ${n} 注</span>
                        ${i === 0 ? `<label class="pb-bloom"><input type="checkbox" class="form-check-input" data-sf="bloom" data-i="${i}" ${s.bloom ? 'checked' : ''}> 悶蒸</label>` : ''}
                        <button type="button" class="btn btn-link btn-sm pb-del" data-act="del" data-i="${i}" aria-label="刪除這步"><i class="bi bi-trash"></i></button></div>
                    <div class="pb-step-main">
                        <label>時間<input class="form-control form-control-lg" inputmode="numeric" placeholder="m:ss" value="${esc(s.time)}" data-sf="time" data-i="${i}"></label>
                        <label>${ed.mode === 'cum' ? '注到' : '這注'}<span class="pb-unit-wrap"><input class="form-control form-control-lg ${r?.bad ? 'is-invalid' : ''}" inputmode="decimal" value="${esc(s.val)}" data-sf="val" data-i="${i}"><span>g</span></span>
                            <small class="pb-other" data-other="${i}">${otherText(r)}</small></label>
                    </div>${adv}</div>`;
            }).join('');
            return `${backHeader(ed.srcId ? '編輯計劃' : '新增計劃', 'list', ed.srcId ? '<button type="button" class="btn btn-outline-danger btn-sm" data-act="delete-plan">刪除</button>' : '')}
            <form class="proto-form pb-form" novalidate>
                <div class="card"><div class="card-body">${basicFields()}</div></div>
                <div class="pb-steps-head">
                    <h6 class="pb-h m-0">步驟</h6>
                    <div class="form-check form-switch m-0">
                        <input class="form-check-input" type="checkbox" role="switch" id="pb-adv" data-act="adv" ${ed.advanced ? 'checked' : ''}>
                        <label class="form-check-label" for="pb-adv">進階（水溫・備註）</label>
                    </div>
                </div>
                ${modeToggle('pb-seg')}
                <p class="pb-hint">${ed.mode === 'cum' ? '輸入「注到幾 g」，小字是這注加了多少。' : '輸入「這注幾 g」，小字是累計到多少。'}</p>
                ${cards}
                <div class="pb-add">
                    <button type="button" data-act="add-pour" ${full ? 'disabled' : ''}><i class="bi bi-droplet"></i> 加一注</button>
                    <button type="button" data-act="add-wait" ${full ? 'disabled' : ''}><i class="bi bi-hourglass"></i> 加等待</button>
                </div>
                ${errorsBox()}
                <div class="pb-dock">
                    <div class="pb-dock-stats">
                        <span><b data-stat="total">${fmtG(d.total)} g</b>總水量</span>
                        <span><b data-stat="ratio">${d.ratio}</b>粉水比</span>
                        <span><b data-stat="cuts">${d.cuts}</b>斷水</span>
                    </div>
                    <button type="submit" class="btn btn-primary">儲存</button>
                </div>
            </form>`;
        },
        detail(p) {
            const s = planStats(p);
            const pairs = pourPairs(p.steps);
            let n = 0;
            return `${backHeader('內建手沖法', 'list')}
            <div class="card pb-hero"><div class="card-body">
                <h5>${esc(p.name)}</h5>
                <div class="pb-plan-tags mb-2">${p.tags.map(t => `<span>${esc(t)}</span>`).join('')}<span class="pb-lock"><i class="bi bi-lock-fill"></i> 唯讀</span></div>
                ${p.description ? `<p class="pa-desc mb-3">${esc(p.description)}</p>` : ''}
                <div class="pb-hero-grid">
                    <div><b>${s.ratio}</b>粉水比</div><div><b>${fmtG(p.dose_g)} g</b>粉量</div><div><b>${fmtG(s.total)} g</b>總水量</div>
                    <div><b>${s.cuts}</b>斷水</div><div><b>${p.temp_c != null ? `${p.temp_c}°` : '—'}</b>水溫</div><div><b>${fmtTime(p.finish_seconds) || '—'}</b>預計完成</div>
                </div>
                <div class="pb-hero-line">${esc(p.method || '')}${p.grind ? ` · 研磨 ${esc(p.grind)}` : ''}</div>
            </div></div>
            ${p.steps.map((st, i) => (st.type === 'pour'
                ? `<div class="pb-step pb-step-ro"><div class="pb-step-head"><span><i class="bi bi-droplet-fill"></i> 第 ${++n} 注${st.bloom ? '・悶蒸' : ''}</span><span class="pb-ro-time">${fmtTime(st.at_seconds)}</span></div>
                    <div class="pb-ro-g">+${fmtG(pairs[i].inc)} g <small>· 累計 ${fmtG(pairs[i].cum)} g</small></div>${stepMuted(st)}</div>`
                : `<div class="pb-step pb-step-wait pb-step-ro"><div class="pb-step-head"><span><i class="bi bi-hourglass-split"></i> 等到 ${fmtTime(st.until_seconds)}</span></div>${stepMuted(st)}</div>`)).join('')}
            <div class="pb-dock"><a class="btn btn-primary w-100" href="${href(`copy/${p.id}`)}"><i class="bi bi-copy me-1"></i>複製成我的</a></div>`;
        },
    };

    // ═══ Variant C — 時間軸 ═══════════════════════════════════════════════════
    // 迷你時間軸：0 → 預計完成，注水是點（大小 ∝ 本次），等待是虛線段
    function miniTrack(p) {
        const end = Math.max(p.finish_seconds || 0, ...p.steps.map(s => s.at_seconds ?? s.until_seconds)) || 1;
        const pairs = pourPairs(p.steps);
        let prevT = 0;
        const marks = p.steps.map((s, i) => {
            if (s.type === 'wait') {
                const seg = `<span class="pc-track-wait" style="left:${(prevT / end) * 100}%;width:${((s.until_seconds - prevT) / end) * 100}%"></span>`;
                prevT = s.until_seconds;
                return seg;
            }
            prevT = s.at_seconds;
            const size = 6 + Math.min(10, pairs[i].inc / 25);
            return `<span class="pc-track-dot" style="left:${(s.at_seconds / end) * 100}%;width:${size}px;height:${size}px"></span>`;
        });
        return `<div class="pc-track"><span class="pc-track-line"></span>${marks.join('')}<span class="pc-track-end">${fmtTime(end)}</span></div>`;
    }
    const C = {
        me() {
            return `${meAccountCard()}
            <a class="card stats-entry-card" href="#/stats">
                <span class="stats-entry-label"><i class="bi bi-bar-chart-line"></i>我的數據</span>
                <i class="bi bi-chevron-right"></i>
            </a>
            <div class="card pc-me"><div class="card-body">
                <a class="pc-me-head" href="${href('list')}"><span><i class="bi bi-cup-hot"></i> 沖煮計劃</span><span class="pc-me-all">全部 <i class="bi bi-chevron-right"></i></span></a>
                ${mine.slice(0, 2).map(p => `<a class="pc-me-plan" href="${href(`plan/${p.id}`)}"><span>${esc(p.name)}</span><small>${planStats(p).ratio}</small></a>`).join('')}
            </div></div>`;
        },
        list() {
            const item = p => {
                const s = planStats(p);
                return `<a class="pc-item" href="${href(`plan/${p.id}`)}">
                    <div class="pc-item-top"><span class="pc-item-name">${esc(p.name)}</span><span class="pc-item-ratio">${s.ratio}</span></div>
                    ${miniTrack(p)}
                    <div class="pc-item-meta">${fmtG(p.dose_g)} g → ${fmtG(s.total)} g · 斷水 ${s.cuts}${p.method ? ` · ${esc(p.method)}` : ''}${p.tags.length ? ` · ${p.tags.map(t => `#${esc(t)}`).join(' ')}` : ''}</div>
                </a>`;
            };
            const my = filtered(mine);
            const bi = filtered(BUILTIN);
            return `<div class="pc-list-head">
                <a class="stats-back" href="${href('me')}" aria-label="返回"><i class="bi bi-chevron-left"></i></a>
                <h5 class="m-0">沖煮計劃</h5>
                <select class="form-select form-select-sm pc-tag-select" data-act="tag-select" aria-label="標籤篩選">
                    <option value="">所有標籤</option>
                    ${allTags().map(t => `<option value="${esc(t)}" ${ui.tag === t ? 'selected' : ''}>#${esc(t)}</option>`).join('')}
                </select>
            </div>
            <div class="pc-group"><div class="pc-group-title">我的計劃<a href="${href('new')}"><i class="bi bi-plus-lg"></i> 新增</a></div>
                ${my.map(item).join('') || '<div class="pc-empty">沒有符合的計劃</div>'}</div>
            <div class="pc-group"><div class="pc-group-title">內建手沖法 <i class="bi bi-lock-fill"></i></div>
                ${bi.map(item).join('') || '<div class="pc-empty">沒有符合的計劃</div>'}</div>`;
        },
        edit() {
            const d = derive();
            const full = ed.steps.length >= MAX_STEPS;
            const nodes = ed.steps.map((s, i) => {
                const adv = ed.advanced ? `<div class="pc-adv">
                    ${s.type === 'pour' ? `<input class="form-control form-control-sm pc-adv-temp" inputmode="decimal" placeholder="${esc(ed.temp ? `${ed.temp}°` : '水溫')}" value="${esc(s.temp)}" data-sf="temp" data-i="${i}" aria-label="水溫">` : ''}
                    <input class="form-control form-control-sm" maxlength="100" placeholder="備註" value="${esc(s.note)}" data-sf="note" data-i="${i}" aria-label="備註">
                </div>` : '';
                if (s.type === 'wait') {
                    return `<div class="pc-node pc-node-wait">
                        <div class="pc-rail"><span class="pc-seg"></span></div>
                        <div class="pc-body">
                            <div class="pc-main">
                                <span class="pc-wait-label"><i class="bi bi-hourglass-split"></i> 等到</span>
                                <input class="form-control form-control-sm pc-in-time" inputmode="numeric" placeholder="m:ss" value="${esc(s.time)}" data-sf="time" data-i="${i}" aria-label="等到">
                                <span class="pc-other pc-wait-note">${ed.advanced ? '' : esc(s.note)}</span>
                                <button type="button" class="btn btn-link btn-sm pc-del" data-act="del" data-i="${i}" aria-label="刪除這步"><i class="bi bi-x-lg"></i></button>
                            </div>${adv}
                        </div></div>`;
                }
                const r = d.rows[i];
                return `<div class="pc-node">
                    <div class="pc-rail"><span class="pc-dot ${s.bloom ? 'is-bloom' : ''}"></span></div>
                    <div class="pc-body">
                        <div class="pc-main">
                            <input class="form-control form-control-sm pc-in-time" inputmode="numeric" placeholder="m:ss" value="${esc(s.time)}" data-sf="time" data-i="${i}" aria-label="時間">
                            <span class="pc-unit-wrap"><input class="form-control form-control-sm pc-in-g ${r?.bad ? 'is-invalid' : ''}" inputmode="decimal" value="${esc(s.val)}" data-sf="val" data-i="${i}" aria-label="${ed.mode === 'cum' ? '累計' : '本次'}水量"><span>g</span></span>
                            <span class="pc-other" data-other="${i}">${otherText(r)}</span>
                            <button type="button" class="btn btn-link btn-sm pc-del" data-act="del" data-i="${i}" aria-label="刪除這步"><i class="bi bi-x-lg"></i></button>
                        </div>
                        ${i === 0 ? `<label class="pc-bloom"><input type="checkbox" class="form-check-input" data-sf="bloom" data-i="${i}" ${s.bloom ? 'checked' : ''}> 悶蒸</label>` : ''}
                        ${adv}
                    </div></div>`;
            }).join('');
            return `<div class="pc-hero">
                <div class="pc-hero-top">
                    <a class="pc-hero-back" href="${href('list')}" aria-label="返回"><i class="bi bi-chevron-left"></i></a>
                    <input class="pc-hero-name" placeholder="計劃名稱 *" value="${esc(ed.name)}" data-f="name" aria-label="名稱">
                    ${ed.srcId ? '<button type="button" class="btn btn-link btn-sm pc-hero-del" data-act="delete-plan" aria-label="刪除"><i class="bi bi-trash"></i></button>' : ''}
                </div>
                <div class="pc-hero-stats">
                    <div><b data-stat="total">${fmtG(d.total)} g</b><span>總水量</span></div>
                    <div><b data-stat="ratio">${d.ratio}</b><span>粉水比</span></div>
                    <div><b data-stat="cuts">${d.cuts}</b><span>斷水</span></div>
                </div>
            </div>
            <form class="proto-form" novalidate>
                <div class="pc-timeline-head">
                    <span class="pc-tl-title">時間軸</span>
                    ${modeToggle('pc-seg')}
                    <button type="button" class="pc-adv-btn ${ed.advanced ? 'active' : ''}" data-act="adv" aria-pressed="${ed.advanced}"><i class="bi bi-sliders"></i> 進階</button>
                </div>
                <div class="pc-timeline">${nodes}
                    <div class="pc-node pc-node-add">
                        <div class="pc-rail"><span class="pc-dot pc-dot-add"></span></div>
                        <div class="pc-body pc-add">
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-act="add-pour" ${full ? 'disabled' : ''}>＋注水</button>
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-act="add-wait" ${full ? 'disabled' : ''}>＋等待</button>
                        </div>
                    </div>
                </div>
                ${errorsBox()}
                <details class="card pc-details"><summary class="card-body">說明・器材・粉量 <span class="text-muted">${esc(ed.dose ? `${ed.dose} g` : '')}${ed.temp ? ` · ${esc(ed.temp)}°C` : ''}</span></summary>
                    <div class="card-body pt-0">${basicFields({ withName: false })}</div>
                </details>
                <button type="submit" class="btn btn-primary w-100">儲存</button>
            </form>`;
        },
        detail(p) {
            const s = planStats(p);
            const pairs = pourPairs(p.steps);
            return `<div class="pc-hero">
                <div class="pc-hero-top">
                    <a class="pc-hero-back" href="${href('list')}" aria-label="返回"><i class="bi bi-chevron-left"></i></a>
                    <span class="pc-hero-name pc-hero-name-ro">${esc(p.name)}</span>
                    <i class="bi bi-lock-fill pc-hero-lock" title="內建・唯讀"></i>
                </div>
                <div class="pc-hero-stats">
                    <div><b>${fmtG(s.total)} g</b><span>總水量</span></div>
                    <div><b>${s.ratio}</b><span>粉水比</span></div>
                    <div><b>${s.cuts}</b><span>斷水</span></div>
                </div>
                ${miniTrack(p)}
            </div>
            ${p.description ? `<p class="pa-desc">${esc(p.description)}</p>` : ''}
            <div class="pc-meta-line">${[p.method, p.grind && `研磨 ${p.grind}`, `粉 ${fmtG(p.dose_g)} g`, p.temp_c != null && `${p.temp_c}°C`, p.finish_seconds && `約 ${fmtTime(p.finish_seconds)} 完成`].filter(Boolean).map(esc).join(' · ')}</div>
            <div class="pc-timeline pc-timeline-ro">
                ${p.steps.map((st, i) => (st.type === 'pour'
                    ? `<div class="pc-node"><div class="pc-rail"><span class="pc-dot ${st.bloom ? 'is-bloom' : ''}"></span></div>
                        <div class="pc-body"><div class="pc-main"><span class="pc-ro-time">${fmtTime(st.at_seconds)}</span><span>注水${st.bloom ? '・悶蒸' : ''} <b>+${fmtG(pairs[i].inc)} g</b> · 累計 ${fmtG(pairs[i].cum)} g</span></div>${stepMuted(st)}</div></div>`
                    : `<div class="pc-node pc-node-wait"><div class="pc-rail"><span class="pc-seg"></span></div>
                        <div class="pc-body"><div class="pc-main"><span class="pc-ro-time">${fmtTime(st.until_seconds)}</span><span class="text-muted">等到 ${fmtTime(st.until_seconds)}</span></div>${stepMuted(st)}</div></div>`)).join('')}
            </div>
            <a class="btn btn-primary w-100" href="${href(`copy/${p.id}`)}"><i class="bi bi-copy me-1"></i>複製成我的</a>`;
        },
    };

    // ─── 版本之間共用的小零件（只有欄位，版面各自決定）────────────────────
    function meAccountCard() {
        return `<div class="card account-card"><div class="card-body text-center">
            <i class="bi bi-person-circle account-avatar-placeholder"></i>
            <p class="text-muted account-email">proto@example.com</p>
            <button type="button" class="btn btn-outline-secondary" disabled><i class="bi bi-box-arrow-right me-2"></i>登出</button>
        </div></div>`;
    }
    function backHeader(title, back, right = '') {
        return `<div class="stats-header proto-header">
            <a class="stats-back" href="${href(back)}" aria-label="返回"><i class="bi bi-chevron-left"></i></a>
            <h5 class="m-0 proto-title">${esc(title)}</h5>
            <span class="ms-auto">${right}</span>
        </div>`;
    }
    function basicFields({ withName = true } = {}) {
        return `${withName ? `<div class="mb-2"><label class="form-label">名稱 *</label><input class="form-control" value="${esc(ed.name)}" data-f="name"></div>` : ''}
            <div class="mb-2"><label class="form-label">說明</label><textarea class="form-control" rows="2" maxlength="500" data-f="description" placeholder="這個計劃的重點">${esc(ed.description)}</textarea></div>
            <div class="mb-2"><label class="form-label">標籤</label><input class="form-control" value="${esc(ed.tags)}" data-f="tags" placeholder="以「、」分隔"></div>
            <div class="row g-2 mb-2">
                <div class="col-7"><label class="form-label">濾杯</label><input class="form-control" value="${esc(ed.method)}" data-f="method" list="proto-method-options"></div>
                <div class="col-5"><label class="form-label">研磨度</label><input class="form-control" value="${esc(ed.grind)}" data-f="grind"></div>
            </div>
            <div class="row g-2">
                <div class="col-4"><label class="form-label">粉量 g *</label><input class="form-control" inputmode="decimal" value="${esc(ed.dose)}" data-f="dose"></div>
                <div class="col-4"><label class="form-label">水溫 °C</label><input class="form-control" inputmode="decimal" value="${esc(ed.temp)}" data-f="temp"></div>
                <div class="col-4"><label class="form-label">預計完成</label><input class="form-control" inputmode="numeric" placeholder="m:ss" value="${esc(ed.finish)}" data-f="finish"></div>
            </div>
            <datalist id="proto-method-options"><option value="V60"><option value="Kalita Wave 185"><option value="Origami"></datalist>`;
    }
    function modeToggle(cls) {
        return `<div class="btn-group btn-group-sm proto-seg ${cls}" role="group" aria-label="水量顯示">
            <button type="button" class="btn ${ed.mode === 'cum' ? 'btn-primary' : 'btn-outline-secondary'}" data-act="mode" data-mode="cum" aria-pressed="${ed.mode === 'cum'}">累計</button>
            <button type="button" class="btn ${ed.mode === 'inc' ? 'btn-primary' : 'btn-outline-secondary'}" data-act="mode" data-mode="inc" aria-pressed="${ed.mode === 'inc'}">本次</button>
        </div>`;
    }
    function errorsBox() {
        return ed.errors.length ? `<div class="alert alert-danger py-2 mt-2 small mb-0">${ed.errors.map(esc).join('<br>')}</div>` : '';
    }
    function kv(k, val) {
        return val ? `<div class="pa-kv-row"><span>${k}</span><b>${esc(val)}</b></div>` : '';
    }
    // 唯讀：備註與水溫有值才顯示，小字淡色
    function stepMuted(st) {
        const bits = [st.temp_c != null && `${st.temp_c}°C`, st.note].filter(Boolean);
        return bits.length ? `<div class="proto-muted">${bits.map(esc).join(' · ')}</div>` : '';
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
        const V = { A, B, C }[v()];
        let html;
        if (screen[0] === 'me') {
            html = V.me();
        } else if (screen[0] === 'plan' || screen[0] === 'new' || screen[0] === 'copy') {
            const p = screen[1] ? findPlan(screen[1]) : null;
            if (screen[0] === 'plan' && p?.builtin) {
                html = V.detail(p);
            } else {
                // 換版本時保留編輯中的內容，才能拿同一份資料比較
                if (edKey !== screenKey || !ed) {
                    ed = planToEditor(p, { copy: screen[0] === 'copy' });
                    edKey = screenKey;
                }
                html = V.edit();
            }
        } else {
            html = V.list();
        }
        root.innerHTML = `<div class="proto-plans proto-${v()}">${html}</div>${switcherMarkup(screenKey)}`;
        bind(root);
    }

    function rerender() { renderRoute(); }

    function refreshDerived(wrap) {
        const d = derive();
        wrap.querySelectorAll('[data-other]').forEach(el => {
            el.textContent = otherText(d.rows[Number(el.dataset.other)]);
        });
        wrap.querySelectorAll('[data-sf="val"]').forEach(el => {
            el.classList.toggle('is-invalid', !!d.rows[Number(el.dataset.i)]?.bad);
        });
        wrap.querySelectorAll('[data-stat]').forEach(el => {
            const k = el.dataset.stat;
            el.textContent = k === 'total' ? `${fmtG(d.total)} g` : String(d[k]);
        });
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
            if (!t || t.tagName === 'SELECT') return;
            const act = t.dataset.act;
            const i = Number(t.dataset.i);
            const blank = type => ({ type, time: '', val: '', bloom: false, temp: '', note: '' });
            if (act === 'tag') { ui.tag = t.dataset.tag; rerender(); }
            else if (act === 'mode') { convertMode(t.dataset.mode); rerender(); }
            else if (act === 'adv') { ed.advanced = !ed.advanced; rerender(); }
            else if (act === 'add-pour') { ed.steps.push(blank('pour')); rerender(); }
            else if (act === 'add-wait') { ed.steps.push(blank('wait')); rerender(); }
            else if (act === 'del') { ed.steps.splice(i, 1); rerender(); }
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
            }
        });
        wrap.addEventListener('change', e => {
            const t = e.target;
            if (t.dataset.act === 'tag-select') { ui.tag = t.value; rerender(); }
            if (t.dataset.sf === 'bloom') ed.steps[Number(t.dataset.i)].bloom = t.checked;
        });
        wrap.addEventListener('input', e => {
            const t = e.target;
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
