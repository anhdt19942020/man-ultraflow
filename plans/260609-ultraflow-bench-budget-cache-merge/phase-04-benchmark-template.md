---
phase: 4
title: "Benchmark Template — objective scorecard judging"
status: pending
priority: P2
effort: "2d"
dependencies: [1]
---

# Phase 4: Benchmark Template (`bench`)

## Overview
arena/brainstorm judge qualitatively (LLM opinion). Add a `bench` template that runs N candidate
solutions in isolated worktrees, then **measures** each (test pass %, wall-time, LOC delta, lint
count) into an objective scorecard, and merges the numerically-best branch. Turn "judge by LLM"
into "judge by numbers".

## Requirements
- Functional: `bench <task> [--agents N] [--metrics tests,time,loc,lint] [--weights ...]` → N
  ck:cook solutions in worktrees → a measurement agent scores each → a ranker picks the winner by a
  stated formula → output scorecard + winner branch.
- Functional: graceful degradation — if no runnable test/lint suite exists, fall back to the
  qualitative arena judge and say so. **Never emit fabricated numbers.**
- Non-functional: scoring is reproducible (same branches → same scorecard); the formula is explicit
  and shown.

## Architecture
Reuses the cook fan-out skeleton (`template-cook.md`) but replaces the qualitative test/verify tail
with a **measurement + ranking** pair.

```
phase Scout   → (cache-aware, P2) context
phase Plan    → ck:plan splits into N *competing whole-task* solutions (NOT file-disjoint —
                each branch solves the SAME task its own way, unlike cook's disjoint split)
phase Solve   → N ck:cook devs, each in its own worktree, BRANCH: footer
phase Measure → ONE measurement agent checks out each branch in turn and records, per branch:
                  tests   : pass/total + pass%       (runs the project test cmd)
                  time    : wall-clock of the suite  (time the run)
                  loc     : net LOC delta vs base     (git diff --stat / cloc)
                  lint    : violation count           (project linter)
                returns SCORECARD_SCHEMA (P1) JSON — structured, machine-rankable
phase Rank    → score each branch by weighted formula; emit scorecard table + winner
```
- **Tooling detection:** the measurement agent first detects the project's test/lint commands
  (package.json scripts, composer/phpunit, Makefile, etc.). If none found for a metric, that column
  is `n/a` and excluded from the formula; if NO metric is runnable → abort to qualitative fallback.
- **Default formula (documented, overridable via `--weights`):**
  `score = 0.5*testPassRate − 0.2*normalizedLint − 0.2*normalizedTime − 0.1*normalizedLOC`
  (higher = better; normalize each numeric column to [0,1] across the N branches). Ties → fewer LOC.
- **Isolation discipline:** the measurement agent must run each branch's suite from that branch's
  worktree, restoring the original branch afterward — never measure on a dirty mixed tree.
- Output reuses `SCORECARD_SCHEMA` so the result is machine-readable and feeds smart-merge (P5).

## Related Code Files
- Create: `references/template-bench.md`
- Modify: `SKILL.md` (register `bench` in the template table + usage + `--metrics`/`--weights`)
- Modify: `README.md` (templates table row)
- Read for context: `references/template-cook.md` (fan-out skeleton), `references/template-arena.md` (qualitative fallback), `references/_shared.md` (SCORECARD_SCHEMA, parseBranches)
- Create (runtime): `.ultraflow/bench/<run-id>/scorecard.json`

## Implementation Steps
1. Copy the cook skeleton into `template-bench.md`; change the plan split prompt from "file-disjoint subtasks" to "N competing whole-task solutions (each branch solves the full task differently)".
2. Keep `isolation: 'worktree'` per solver; collect branches via `parseBranches` (P1).
3. Add the Measure agent: detect test/lint/loc commands; for each branch — checkout, run, capture numbers; return `SCORECARD_SCHEMA` JSON (use the `schema` option for structured output).
4. Add the Rank step: normalize columns, apply the weighted formula (parse `--weights`), output a markdown scorecard table + the winning branch.
5. Implement the qualitative fallback: if Measure reports zero runnable metrics, delegate to the arena judge prompt on the artifacts and label the result `judged=qualitative`.
6. Register `bench` in `SKILL.md` (template table, args shape `{ task, n, metrics?, weights? }`, default N=3) and `README.md`.
7. Write `## Notes`: formula, normalization, fallback rule, "never fabricate numbers", reproducibility note.

## Success Criteria
- [ ] `bench <task>` on a repo with a test+lint suite produces a scorecard with ≥3 numeric columns and a winner chosen by the shown formula.
- [ ] Re-running the ranker on the same `scorecard.json` yields the **same winner** (deterministic ranking).
- [ ] On a repo with no runnable suite, `bench` falls back to qualitative judging and labels it — no fabricated numbers appear.
- [ ] Each branch is measured from its own worktree; the base branch is restored afterward (verified: `git branch --show-current` unchanged post-run).
- [ ] `scorecard.json` validates against `SCORECARD_SCHEMA`; no `ck:` skill file touched.

## Risk Assessment
- **Risk (primary):** flaky/non-deterministic tests make scores noisy → wrong winner. **Mitigation:** report pass% with raw counts; document that bench is only as objective as the suite; allow `--metrics` to drop tests and rank on lint+LOC when the suite is flaky.
- **Risk:** measuring N branches serially is slow + token-heavy. **Mitigation:** measurement is mechanical (haiku-tier agent); bench is opt-in for when objectivity matters; P3 budget still caps it.
- **Risk:** checkout churn corrupts the working tree. **Mitigation:** measurement runs in worktrees, never on the user's checkout; explicit restore + a guard that aborts if the tree is dirty before starting.
- **Risk:** weighted formula encodes a debatable value judgment. **Mitigation:** formula is explicit, shown in output, and fully overridable via `--weights`; the raw per-column numbers are always printed so the user can re-rank by eye.
