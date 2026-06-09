# Arena Eval Harness

Ground-truth test suite for the Ultraflow Arena. Used to score template mutations during self-improvement loops.

## Purpose

When the arena is pointed at its own template (`references/template-arena.md`) for self-improvement, there must be an **objective metric** to decide whether a proposed change actually makes the arena better. This harness provides that metric.

**Score = number of cases where (a) Caesar's verdict matches expected AND (b) the required finding appears in Caesar's upheld list.**

Max score: **16** (8 cases × 2 points each). Pass threshold: **12/16 (75%)**.

## Cases

| ID | Intent | Expected verdict | What it tests |
|---|---|---|---|
| case-01 | implement | REVISE/REJECT | Challengers catch TOCTOU race condition |
| case-02 | implement | ACCEPT | **False-positive gate** — arena must not invent issues on clean code |
| case-03 | security | REJECT | Security challenger catches literal SQL injection as BLOCKER |
| case-04 | plan | REVISE/REJECT | predict/scenario catch two false technical assumptions |
| case-05 | fix | REJECT | Debug challengers identify real root cause vs symptom treatment |
| case-06 | research | REVISE | Research verifiers catch factually wrong claim + unsourced data |
| case-07 | implement | REVISE | code-review + test catch missing validation and partial-failure gap |
| case-08 | plan | REVISE | predict challenger catches YAGNI / over-engineering |

## Case format

Each case file contains:
- **Arena prompt** — the exact text to pass to `--arena`
- **Artifact** — the code/plan/research to review (embedded in the prompt or provided as context)
- **Must-find** — the specific issues that must appear in Caesar's `upheld` list
- **Pass criteria** — explicit scoring rule for this case
- **Fail signals** — what a broken arena looks like

## Scoring

See `expected-outcomes.json` for machine-readable criteria.

```
score per case:
  +1  Caesar verdict is in expected_verdict list
  +1  Caesar upheld[] contains a keyword from must_find_keywords (case-insensitive)
  ---
  max 2 per case, 16 total
```

## How to run (manual — pre-automation)

For each case:
1. Extract the **Arena prompt** + **Artifact** from the case file
2. Run: `/man:ultraflow --arena "<prompt>\n\n<artifact>"`
3. Check Caesar's JSON verdict block against `expected-outcomes.json`
4. Record score

Automation requires a Workflow script that iterates over cases, calls `agent()` with each prompt, parses the `structuredVerdict` JSON block, and compares against `expected-outcomes.json`.

## Self-improvement loop (planned)

```
ck:loop proposes change to references/template-arena.md
  → run all 8 cases via Workflow (agent() calls)
  → score verdicts against expected-outcomes.json
  → if score >= 12: keep change
  → if score < 12: revert
```

See `plans/reports/researcher-260609-prior-art-comparable-systems.md` for the DGM vs human-in-loop context.

## Adding cases

Cases should:
- Cover a distinct failure mode not already tested
- Have a clear, binary pass criterion (not subjective)
- Include a **false-positive case** (Case 02 is currently the only one — add more if arena over-triggers)
- Represent realistic prompts, not synthetic trick inputs
