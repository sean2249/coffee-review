Closes #<!-- issue number; one line per issue, for a spec the spec and each ticket -->

## Summary

<!-- The smallest view that makes the change clear: a diagram, diff sketch, call tree or file tree (the `pr` skill). -->

## Evidence

- **Before:** <!-- screenshot / output / failing test run -->
  **After:** <!-- screenshot / output / passing test run -->

## Merge Danger

**Door:** <!-- one-way or two-way: if this is wrong while it's live, can the harm be taken back? -->

**Blast Radius:** <!-- one word, then what a bad merge would affect -->

## Acceptance criteria — evidence

<!-- One line per acceptance criterion from the brief or ticket, word for word. For a spec, group them by ticket. -->
- [ ] <criterion> — evidence: <command + output excerpt / screenshot / preview link>

## Not verified

<!-- Anything you could not check, and why. Write "None" only if everything above has evidence. -->

## Deviations

<!-- Where the work differs from the brief, spec or tickets, and the reason. "None" if it doesn't. -->

## Risk

<!-- Exactly one risk label goes on the PR. It tells the author how closely to read before merging; nothing merges automatically. -->
- Level: `risk: low` / `risk: medium` / `risk: high`
- Reason: <!-- low = two-way door, a clean review, and nothing under .github/, .claude/, CLAUDE.md or the agent docs; high = one-way door or a blast radius across repos; medium = the rest -->

## Review

<!-- Filled by issue-ship: a security reviewer (security-audit, guidance mode) and a code reviewer (code-review), fresh subagents each round, at most 3 rounds. On a public repo, security findings appear only as a count. -->
- Rounds: <N>
<!-- If round 3 sent the work back, say which direction the author chose. -->

| Review | Severity | Category | Location | Outcome |
|---|---|---|---|---|
| code / security | high / medium / low | state / race, error handling, input validation… | `file:line` | fixed in <sha> / not fixed: <reason> |

## Verification commands

```
<!-- The verify command from CLAUDE.md, plus anything else you ran. -->
```

<!--
If the issue has `article-status: request`, add a `## 文章素材` section here:
background, the author's own words from the session (decision points), approach,
pitfalls hit, before/after numbers.
-->
