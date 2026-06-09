---
phase: 5
title: "Smart Merge — cherry-pick best parts across N branches"
status: pending
priority: P2
effort: "1.5d"
dependencies: [1]
---

# Phase 5: Smart Merge

## Overview
Today cook/fix/bench leave N worktree branches and the user manually `git merge` one whole winner.
Add an opt-in **smart-merge** step: one agent reads all N worktrees, cherry-picks the best hunk
from each branch, assembles a composite branch, and gates it on the test suite — falling back to
whole-branch pick when composition breaks.

## Requirements
- Functional: `--smart-merge` flag on cook/fix/bench → after solutions exist, a merge agent produces
  a single integrated branch built from the strongest parts of each candidate.
- Functional: a **mandatory post-merge test gate**. If the composite fails, fall back to "merge the
  single best whole branch" (today's behavior) and report the fallback.
- Non-functional: never commit a broken composite to the user's main branch; all assembly happens on
  a fresh `ultraflow/smart-merge-<run-id>` branch the user can inspect/discard.

## Architecture
```
inputs: N candidate branches (from cook/fix/bench) + (optional) bench scorecard
phase Analyze → merge agent reads all N worktrees (diff per branch), identifies, per concern/file,
                which branch has the best implementation (evidence: diff, and bench numbers if present)
phase Assemble→ create branch ultraflow/smart-merge-<run-id> from base; apply the chosen hunks
                (git cherry-pick / patch apply per file region); resolve overlaps explicitly
phase Gate    → run the test suite on the composite (reuse P4 measurement if bench ran)
                PASS → present composite branch as the recommended merge
                FAIL → discard composite, fall back to single-best-branch pick, report why
```
- **Selection signal:** if a bench `scorecard.json` exists (P4), use its per-branch numbers to break
  ties objectively; otherwise the agent reasons qualitatively but must cite the diff hunks it picked.
- **Safety:** assembly is on a throwaway branch; the user still does the final `git merge` after
  inspection (consistent with the existing "ASK before any merge" rule in SKILL.md:119/123).
- **Conflict handling:** if two branches' best parts touch the same lines irreconcilably, the agent
  picks one and records the rejected alternative rather than producing a syntactic conflict.

## Related Code Files
- Create: `references/_smart-merge.md` (the shared smart-merge agent prompt + flow, imported-by-copy into cook/fix/bench)
- Modify: `references/template-cook.md`, `references/template-fix.md`, `references/template-bench.md` (add optional smart-merge phase behind `--smart-merge`)
- Modify: `SKILL.md` (`--smart-merge` parsing + post-run guidance)
- Read for context: `references/_shared.md` (parseBranches), `references/template-bench.md` (scorecard input)
- Create (runtime): branch `ultraflow/smart-merge-<run-id>`

## Implementation Steps
1. Write `references/_smart-merge.md`: the Analyze→Assemble→Gate agent prompt, taking `{ branches[], base, scorecard? }`, returning `{ compositeBranch, picks[], gate: pass|fail, fallbackBranch? }`.
2. Add a guarded `phase('Smart Merge')` block to cook/fix/bench that runs only when `args.smartMerge` is set and ≥2 branches completed.
3. Implement the test gate: reuse P4's measurement agent if available, else run the detected test command on the composite.
4. Implement fallback: on gate FAIL (or <2 branches), select the single best branch (bench winner, or fix verifier's pick, or first completed) and set `fallback=true`.
5. Parse `--smart-merge` in SKILL.md → `args.smartMerge`; document that it never auto-merges to main — it produces an inspectable branch.
6. Update SKILL.md "After Workflow completes" + "Arena ending" guidance to mention the composite branch and the ASK-before-merge rule.

## Success Criteria
- [ ] On a 2-branch cook where each branch is independently correct and touches different concerns, smart-merge produces a composite branch whose test suite **passes**.
- [ ] On an intentionally conflicting pair, the gate **fails** and the run falls back to a single whole branch (no broken composite presented as the recommendation), with `fallback=true` reported.
- [ ] The composite is always on `ultraflow/smart-merge-<run-id>`, never committed to the user's current branch automatically.
- [ ] Each pick cites the source branch + diff region; if a scorecard exists, ties are broken by its numbers.
- [ ] No `ck:` skill file touched.

## Risk Assessment
- **Risk (primary):** cherry-picked composite compiles in no single branch → broken tree. **Mitigation:** mandatory post-merge test gate + automatic fallback to whole-branch pick; composite lives on a throwaway branch only.
- **Risk:** agent silently produces git conflict markers. **Mitigation:** prompt forbids leaving conflict markers — it must choose and record the rejected alternative; Gate would fail a tree with markers anyway.
- **Risk:** smart-merge adds latency/tokens to every run. **Mitigation:** opt-in via `--smart-merge` only; off by default (KISS — manual merge stays the default path).
- **Risk:** assembling across branches that diverged from different bases. **Mitigation:** require all candidate branches to share the run's base commit (they do — worktrees branch from the same HEAD); abort smart-merge if bases differ and fall back.
