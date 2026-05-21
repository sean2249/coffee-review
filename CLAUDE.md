# CLAUDE.md

This file has two parts: **Working principles** (how to behave on any change in this
repo) and **Project context** (what this app is and how it's wired). Read both before
editing.

---

## Working principles

Behavioral guidelines to reduce common LLM coding mistakes. Adapted from
<https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md>.

**Tradeoff:** these bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think before coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity first

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports / variables / functions that *your* changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-driven execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [step] → verify: [check]
2. [step] → verify: [check]
3. [step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work")
require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites
due to overcomplication, and clarifying questions come *before* implementation rather
than after mistakes.

---

## Project context

Personal coffee review/cupping web app (CoE-inspired). Vanilla JS SPA, served as static
files (GitHub Pages), backed by a Supabase Postgres schema. PWA-installable. All UI text
is Traditional Chinese — keep it that way when editing.

## Tech stack

- **No build, no framework**: vanilla ES2022 JS in `app.js`, classic `<script>` (not a
  module). Bootstrap 5.3 CSS+JS and Bootstrap Icons loaded from jsDelivr CDN.
- **Supabase JS** loaded on demand via dynamic `import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')`.
- **PWA**: `manifest.json` + `sw.js` (stale-while-revalidate for app shell; passes through
  `*.supabase.co` and `*.supabase.in` so Supabase reads/writes always hit the network —
  see `shouldBypass` in sw.js).
- **Tooling**: ESLint flat config (`eslint.config.js`) + Stylelint (`.stylelintrc.json`).
  `package.json` sets `"type": "module"` package-wide (so the config files load as ESM),
  but the browser files (`app.js`, `sw.js`) are loaded as classic scripts via `<script>` /
  `serviceWorker.register` — ESLint's per-file overrides set `sourceType: 'script'` to
  match.
- **CI**: `.github/workflows/lint.yml` runs `npm run lint` on PRs; `deploy.yml` injects
  `config.js` from secrets and publishes to GitHub Pages on push to `main`.

## File layout

```
index.html         markup + <template> blocks for form/modal; mounts to <main id="app">
app.js             everything: router, views, Supabase API, CoE widget, flavor wheel
styles.css         design tokens (:root) + section-banner-commented blocks
sw.js              service worker (cache name bumped by VERSION constant)
manifest.json      PWA manifest
config.example.js  copy → config.js (gitignored) with Supabase creds
.github/workflows  lint.yml + deploy.yml
icons/             192/512 PNG + source SVG
README.md          user-facing setup (Supabase SQL schema lives here, keep in sync)
purpose.md, 口感.md design notes (Chinese)
```

## Architecture

**Hash router** (`renderRoute` in app.js:346). Routes:

| Route | View |
|---|---|
| `#/records` (default) | List with type + shop filters |
| `#/new[/cupping\|tasting]` | Empty form, mode selectable |
| `#/cupping/<id>` / `#/tasting/<id>` | Edit (same template, mode locked) |
| `#/shops` / `#/shops/<id>` | Shop CRUD + per-shop records |

**Two record types share one form template** (`#tpl-form` in index.html). The mode toggle
flips visibility via `data-mode-only="cupping|tasting"` and `data-mode-text="..."`.
`setFormMode` (app.js:545) sets display + `required` on shop select.

**Supabase API layer**: `api` object (app.js:198) wraps the schema-scoped client; tables
live in the `coffee` schema by default (`cupping_records`, `tasting_records`, `shops`).
Use `maybeSingle()` for fetch-by-id so a missing row resolves to `{data: null}` instead
of throwing PGRST116. The schema SQL is in README.md — when changing columns, update the
SQL block there too.

**State** (`state` at app.js:139): in-memory only. `state.shops` is a cache plus a
`shopsLoaded` flag so that `shopName(id)` doesn't mislabel transient fetch failures as
"已刪除店家". CoE selection lives in `coeState`; flavor-wheel selections in `wheelState`
(keyed by container id — `wheelState.clear()` on each route transition).

**CoE scoring model** (critical to preserve):
- `coe_total` is the **user-entered** total (74–96), not a sum. Two-stage picker: medal
  tier (`totalScoreTiers` at app.js:25) → score chip.
- The 8 reference fields (`referenceFields` at app.js:86) score 4–8 with 0.5 step, default
  5. They're **stored but don't compute** the total.
- `observationFields` (`aroma`) is observation-only, no score.
- Persisted shape: `coe_total`, `coe_tier_id`, `evaluations: jsonb`, `observation: jsonb`,
  `schema_version: 1`. `evaluations[key] = { score, notes, flavors?, <custom keys>? }`.

**Flavor wheel**: up to 3 levels in `flavors` (app.js:101). The persisted ids in
`evaluations[key].flavors` / `observation.aroma.flavors` track the selection path and
**vary in depth** — when an L1's `sub` entries are bare strings (e.g. `floral` → `'茉莉'`)
the leaf stops at `${containerId}__l1-<slug>__l2-<slug>`; only branches whose L2 is an
object with its own `sub` extend to `__l3-<slug>`. String-derived slugs strip `/` and
whitespace (see `toggleFlavor`). Selecting a deeper level auto-selects ancestors;
deselecting an ancestor cascades. `applyFlavorSelections` rebuilds the expansion state
from stored ids.

## Conventions

- **Indent 4 spaces**, single quotes in JS, trailing commas where ESLint allows.
- HTML class attributes use Bootstrap utilities + custom classes from `styles.css`.
- Always `escapeHtml(...)` user/DB strings before interpolating into `innerHTML`. The
  helper is at app.js:155.
- DOM ids in forms are prefixed `f-` for top-level inputs and `<key>_<suffix>` for
  evaluation widgets (e.g. `flavor_score`, `aroma_dryAroma`).
- CSS section banners use the `/* ───── Title ──── */` style — keep new sections
  consistent so the file stays scannable.
- Style tokens: prefer `var(--accent)`, `var(--text-muted)`, `var(--radius-md)` etc. from
  the `:root` block over hardcoded values.

## Workflow

```bash
npm install
npm run lint        # lint:js + lint:css
npm run lint:js
npm run lint:css
```

There is **no dev server, no test suite, no build step**. To run locally, copy
`config.example.js` → `config.js`, fill in Supabase URL + anon key, then open `index.html`
through any static server (e.g. `python3 -m http.server`). Opening via `file://` breaks
the service worker registration and the dynamic Supabase import.

`config.js` is in `.gitignore` — never commit credentials. In production it's generated
by `deploy.yml` from `SUPABASE_URL` / `SUPABASE_ANON_KEY` secrets.

If you change anything in `APP_SHELL` (sw.js:9) or want to force users off an old cache,
bump `VERSION` in `sw.js:6`.

## Editing checklist

- Touching the form? Update both modes in `index.html` (#tpl-form) and the corresponding
  `buildFormPayload` / `loadRecordIntoForm` branch in app.js.
- Adding a column? Add to (1) `buildFormPayload`, (2) `loadRecordIntoForm`, (3) the SQL
  block in README.md, and (4) the Supabase project schema. There are no migrations.
- Adding evaluation fields? Update `referenceFields` / `observationFields` and verify the
  card list / detail card still renders sensibly with old records (treat missing keys as
  default).
- Anything that changes app-shell URLs → bump `sw.js` VERSION.
- After edits: `npm run lint`. CI will fail the PR otherwise.

## Things to leave alone unless asked

- The RLS "open access" policy in README.md is intentional for personal use; do not switch
  to auth-based policies without explicit request.
- The CoE total is **input, not computed** — don't "fix" it by summing reference scores.
- UI strings are zh-TW; don't translate to English.
- `purpose.md` and `口感.md` are background design notes, not living docs — don't rewrite
  them as part of unrelated changes.
