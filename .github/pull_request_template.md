Closes #<!-- issue number -->

## Behaviour summary

<!-- Read this first to decide whether to let the PR through, before the diff. -->

**Run output**

```
<!-- What running the change prints or shows (or link a screenshot). -->
```

**What it does**

<!-- One short paragraph. -->

**What it deliberately doesn't do**

<!-- One short paragraph. -->

**Mapped to acceptance criteria**

- <criterion> → <the behaviour above that meets it>

**Risks and opportunities**

<!-- One line per Risk in the issue → how its mitigation was handled; one line per "this time" Opportunity → where it's done. "None" if the issue lists none. -->
- <risk> → <mitigation applied>

## Acceptance criteria — evidence

<!-- One line per acceptance criterion from the approved issue. Copy the wording. -->
- [ ] <criterion> — evidence: <command + output excerpt / screenshot / preview link>

## Not verified

<!-- Anything you could not check, and why. Write "None" only if everything above has evidence. -->

## Deviations from the approved plan

<!-- Where the implementation differs from the approved issue, and the reason. "None" if identical. -->

## Risk

<!-- Exactly one risk label goes on the PR. -->
- Level: `risk: low` / `risk: medium` / `risk: high`
- Reason: <!-- low = every changed file is in the low-risk allowlist; high = auth, DB migrations, .github/workflows, secrets, billing -->

## Review

<!-- Filled by issue-implement after its fresh-context code and security reviewer subagents (at most 3 rounds each). Every finding has a category and is fixed a category at a time. Round 3 is the last review: if it found only low findings, all are fixed and nothing is sent for another review; if it found any medium+ finding, nothing is patched, the PR becomes a draft and goes back to the author to rethink the approach. Only a fix that needs the author's product decision is handed over, with the reason. -->
- code-review: <N> round(s)
- security-review: <N> round(s)
<!-- If round 3 ran, keep the one line that applies: -->
- Round 3 findings all fixed; not sent for another review.
- Round 3 found medium+ findings; sent back to the author to rethink the approach.

| Review | Severity | Category | Location | Outcome |
|---|---|---|---|---|
| code / security | high / medium / low | state / race, error handling, a11y, input validation… | `file:line` | fixed in <sha> / not fixed: <reason> |

## Verification commands

```
<!-- The verify command from CLAUDE.md, plus anything else you ran. -->
```

<!--
If the issue has `article-status: request`, add a `## 文章素材` section here:
background, the author's own words from the session (decision points), approach,
pitfalls hit, before/after numbers.
-->
