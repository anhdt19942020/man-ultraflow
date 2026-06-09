---
phase: 6
title: "Integration, Docs & Objective Validation"
status: pending
priority: P2
effort: "1d"
dependencies: [2, 3, 4, 5]
---

# Phase 6: Integration, Docs & Objective Validation

## Overview
Wire all four features into the user-facing surfaces (`SKILL.md`, `README.md`), run end-to-end
checks, and verify every phase's objective success criterion with measured numbers — not vibes.

## Requirements
- Functional: a single coherent flag surface (`--budget`, `--no-cache`/`--refresh-cache`,
  `--smart-merge`, `bench` template, `--metrics`/`--weights`) documented in one place.
- Functional: end-to-end runs proving cache hit, budget halt, scorecard determinism, smart-merge gate.
- Non-functional: zero `ck:` skill edits; consistent terminology across all reference files
  (the whole-plan consistency sweep from ck:plan).

## Architecture
This phase is the **join point** of the dependency map. It does no new feature logic — it reconciles
the four independent feature branches and runs the gates.

Flag-surface reconciliation table (single source in SKILL.md):
| Flag | Templates | Phase | Effect |
|------|-----------|-------|--------|
| `--budget N` | all | 3 | wave-gated halt + per-agent token table |
| `--no-cache` / `--refresh-cache` | scout, plan, cook, bench | 2 | bypass / overwrite scout cache |
| `bench` (template) | n/a | 4 | objective scorecard judging |
| `--metrics` / `--weights` | bench | 4 | choose & weight scored columns |
| `--smart-merge` | cook, fix, bench | 5 | cherry-pick composite + test gate |

## Related Code Files
- Modify: `SKILL.md` (template table, usage block, "After Workflow completes", flag reference)
- Modify: `README.md` (templates table, usage, flag notes)
- Read for context: all `references/template-*.md`, `references/_shared.md`, `references/_smart-merge.md`
- Create: `plans/.../reports/validation-report.md` (measured results)

## Implementation Steps
1. Reconcile `SKILL.md` template/usage tables: add `bench`, the four flags, and the token-report + cache + smart-merge bullets under "After Workflow completes". Keep one flag-reference table (DRY).
2. Update `README.md` to match (templates table row for `bench`, flag notes).
3. **Whole-plan consistency sweep:** grep all reference files for divergent copies of the shared snippets (`_shared.md` anchors), stale flag names, and contradicting defaults; reconcile.
4. Run the objective gates and record numbers in `reports/validation-report.md`:
   - cache: scout twice on an unchanged tree → assert 2nd run spawns 0 scout agents.
   - budget: arena with `--budget <low>` vs uncapped → assert fewer challengers + `budgetHalted=true`.
   - bench: run twice on the same branches → assert identical winner.
   - smart-merge: correct-pair → composite passes; conflicting-pair → fallback=true.
5. `git diff --name-only` → assert no path under a `ck:` skill dir changed.
6. Update each template's `## Notes` + the plan's status table to completed.

## Success Criteria
- [ ] Cache: 2nd unchanged-tree run spawns **0** scout agents (logged).
- [ ] Budget: low-budget run spawns strictly fewer agents than uncapped; per-agent token table printed.
- [ ] Bench: same inputs → same winner across two ranker runs.
- [ ] Smart-merge: correct pair → passing composite; conflicting pair → documented fallback, no broken tree.
- [ ] `git diff --name-only` shows only `references/*`, `SKILL.md`, `README.md`, `.gitignore`, `plans/*` — **no `ck:` skill file**.
- [ ] SKILL.md and README.md flag/template surfaces match (no drift).

## Risk Assessment
- **Risk:** four feature branches conflict on shared files (SKILL.md, _shared.md). **Mitigation:** P1 isolates shared helpers up front; SKILL.md edits are append-only sections per feature; this phase is the single reconciliation point.
- **Risk:** validation needs a repo with a real test suite to exercise bench/smart-merge. **Mitigation:** use the edutalk-api project (has phpunit) or a scratch fixture repo; document which repo each gate ran against.
- **Risk:** docs drift after later edits. **Mitigation:** the consistency sweep (Step 3) is mandatory before marking complete, per ck:plan's whole-plan consistency gate.
