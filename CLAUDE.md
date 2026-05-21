# CLAUDE.md

Personal coffee review/cupping web app (CoE-inspired). Vanilla JS SPA, served as static
files (GitHub Pages), backed by a Supabase Postgres schema. PWA-installable. All UI text
is Traditional Chinese — keep it that way when editing.

## Tech stack

- **No build, no framework**: vanilla ES2022 JS in `app.js`, classic `<script>` (not a
  module). Bootstrap 5.3 CSS+JS and Bootstrap Icons loaded from jsDelivr CDN.
- **Supabase JS** loaded on demand via dynamic `import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')`.
- **PWA**: `manifest.json` + `sw.js` (stale-while-revalidate for app shell; passes through
  `*.supabase.co` so writes/reads always hit the network).
- **Tooling**: ESLint flat config (`eslint.config.js`) + Stylelint (`.stylelintrc.json`).
  `package.json` declares `"type": "module"` for the config files only; `app.js` / `sw.js`
  are scripts (see ESLint per-file overrides).
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

**Flavor wheel**: 3-level tree in `flavors` (app.js:101). IDs are
`${containerId}__l1-<slug>__l2-<slug>__l3-<slug>` and are what gets persisted in
`evaluations[key].flavors` / `observation.aroma.flavors`. Selecting a deeper level
auto-selects ancestors; deselecting an ancestor cascades. `applyFlavorSelections` rebuilds
the expansion state from stored ids.

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
