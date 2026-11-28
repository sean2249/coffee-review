# Coding standards

Read at review time (the `code-review` skill's Standards axis), on top of `CLAUDE.md`.
These are judgement calls no linter or test can enforce on its own; tooling-enforced
rules (ESLint, Stylelint, tsc) are not repeated here. Each rule names the check the
reviewer looks for in the diff.

## A save in flight blocks every submit path

While a save request is pending, every way to submit that form is blocked: each
`button[type="submit"]` inside it (the 沖煮 / 品鑑 form has two: `#f-save` and the
desktop score panel's) and implicit Enter submission, which follows the first submit
button. A form gains a submit path → the in-flight guard covers it in the same diff.

Check: a test presses submit twice (or two different submit buttons) during one pending
request and sees exactly one request.

Why: 沖煮 / 品鑑 ids come from the server, so a second POST is a second record (#169).

## Navigation and history changes are tested on every entry path

Code that intercepts navigation (`hashchange`, link clicks, `beforeunload`) or calls
`history.pushState` / `replaceState` is tested on each way the user can arrive there:

- an in-app link click (tab bar, back link);
- Back / Forward, where the hash has already changed when the code runs;
- a second navigation while a confirm dialog from the first is still open.

Cancel leaves the history stack with no overwritten and no duplicated entry; confirm
renders the destination even when the hash already equals it (no `hashchange` fires).

Check: tests exist for all three paths, and they assert `location.hash`, the rendered
view and `history.length`.

Why: the 沖煮 / 品鑑 leave prompt took three review rounds, one per path (#169).
