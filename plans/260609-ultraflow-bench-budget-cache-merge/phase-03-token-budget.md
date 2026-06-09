---
phase: 3
title: "Token Budget + Per-Agent Token Report"
status: pending
priority: P1
effort: "1.5d"
dependencies: [1]
---

# Phase 3: Token Budget + Per-Agent Token Report

## Overview
Multi-agent runs are token-expensive. Add `--budget <N>` to halt fan-out once cumulative spend
crosses the threshold, and print a per-agent token table after every run. This is the single
biggest real-world pain point, so it ships at P1.

## Requirements
- Functional: `--budget N` caps cumulative tokens; when the running total would exceed N before a
  fan-out wave, that wave is skipped/trimmed and the run returns a partial result flagged `budgetHalted`.
- Functional: after every run (budget or not), emit a table: `label | model | inputTok | outputTok | total | estimated?`.
- Non-functional: must work whether or not the engine exposes real usage data (see HARD GATE below); never block a run by *over*-counting; honest `estimated` flag.

## Architecture

### HARD GATE — Step 1 decides the whole design
Probe whether `agent()` returns usage metadata. There are two implementation paths and Step 1
picks one with evidence (do NOT assume an API exists — grep already showed none in current templates):

- **Path A (real numbers):** if a returned agent result carries usage (e.g. a `usage`/`tokens`
  field, or the engine exposes a run-usage accessor), read it. `estimated=false`.
- **Path B (estimation, fallback):** count `estimateTokens(promptText) + estimateTokens(resultText)`
  per agent using the P1 helper (`chars/4`). `estimated=true`. Always available, never wrong-by-API.

### Budget enforcement (between fan-out waves, not mid-agent)
The engine can't pre-empt a running `agent()`. So budgeting is **wave-gated**:
```
total = 0
before each parallel wave:
  est = sum(estimateTokens(prompt_i) for i in wave)   // pre-flight estimate
  if budget && total + est > budget:
     trim the wave to the agents that fit (or skip entirely) → log budgetHalted
run wave → total += actual-or-estimated usage of completed agents
```
- arena: gate the `Giao chiến` (challengers) wave — drop challengers from the tail until the
  estimated wave cost fits; never drop below 1 (need ≥1 adversary or report degraded coverage).
- cook/fix/bench: gate the `Implement`/`Fix`/solutions wave — reduce effective `n`.
- A pre-flight per-agent estimate uses prompt length (known before the call) + a configurable
  expected-output factor (default 1.5× prompt, documented).

### Reporting
A final `phase('Budget')` agent (or inline reduce) assembles `usage.json` and renders the markdown
table. SKILL.md "After Workflow completes" gains a "token report" bullet.

## Related Code Files
- Modify: `references/template-arena.md` (gate challenger wave; report)
- Modify: `references/template-cook.md`, `references/template-fix.md` (gate dev/fix wave; report)
- Modify: `references/template-scout.md`, `template-brainstorm.md`, `template-research.md`, `template-review.md`, `template-debug.md` (report only — single-wave templates, no halt needed but still report)
- Modify: `SKILL.md` (`--budget` parsing + token-report bullet)
- Read for context: `references/_shared.md` (estimateTokens, USAGE_ROW)
- Create (runtime): `.ultraflow/budget/<run-id>/usage.json`

## Implementation Steps
1. **Probe (HARD GATE):** add a tiny diagnostic that runs one `agent()` and inspects its return for a usage field; record which path (A/B) the implementation must take. Document the finding in the template `## Notes`.
2. Add `estimateTokens` + `USAGE_ROW` from P1 to a shared spot in each touched template.
3. Implement the per-agent accumulator: after each `agent()`/`parallel()` resolves, push a usage row (real if Path A, estimate if Path B).
4. Implement wave-gating in arena/cook/fix/bench: pre-flight estimate the next wave; if `budget` set and `total + est > budget`, trim the wave (tail-first) and set `budgetHalted=true`, `droppedAgents=[...]`.
5. Parse `--budget N` in `SKILL.md` → `args.budget`; clamp to a positive integer; document units = tokens.
6. Add a `phase('Budget')` final step that writes `usage.json` and returns `{ usageTable, totalTokens, budget, budgetHalted, droppedAgents }`.
7. Update SKILL.md "After Workflow completes" to print the token table and note any halt.

## Success Criteria
- [ ] Every run prints a per-agent table with one row per spawned agent; `estimated` column reflects the probe result honestly.
- [ ] `--budget <low>` on a 3-challenger arena spawns **fewer** challengers than the same run uncapped, returns `budgetHalted=true`, and never drops below 1 adversary (or flags degraded coverage).
- [ ] `--budget <high>` does not alter agent count (no false halts).
- [ ] `totalTokens` is reproducible within ±0 on Path A, or within the documented estimate band on Path B.
- [ ] No `ck:` skill file touched.

## Risk Assessment
- **Risk (primary):** engine exposes no usage data → only estimation possible. **Mitigation:** Path B is a first-class fallback, clearly labelled `estimated=true`; the feature still delivers a halt + a directional report. Probe gate prevents pretending we have real numbers.
- **Risk:** wave-gating can't stop an already-running agent → overshoot the budget within one wave. **Mitigation:** budget is enforced *between* waves and documented as "soft cap, wave-granular"; pre-flight estimate makes the overshoot bounded by one wave's worth.
- **Risk:** dropping challengers weakens adversarial coverage silently. **Mitigation:** `budgetHalted` + `droppedAgents` surfaced in the return; Caesar already weights partial coverage (`template-arena.md:208`).
- **Open question:** does the harness expose any run-level usage accessor? Resolve in Step 1 probe — do not block design on it.
