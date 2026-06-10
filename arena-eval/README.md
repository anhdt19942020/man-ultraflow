# Arena Eval Harness

Ground-truth test suite for the Ultraflow Arena. Used to score template mutations during self-improvement loops.

## Purpose

When the arena is pointed at its own template (`references/template-arena.md`) for self-improvement, there must be an **objective metric** to decide whether a proposed change actually makes the arena better. This harness provides that metric.

**Score = number of cases where (a) Caesar's verdict matches expected AND (b) the required finding appears in Caesar's upheld list.**

Max score: **22** (11 cases × 2 points each). Pass threshold: **17/22 (77%)**.

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
| case-09 | implement | REVISE | **Severity inflation gate** — no-timeout concern must be MAJOR not BLOCKER |
| case-10 | implement | REVISE | **Benchmark override** — Caesar must REVISE despite SOUND challengers when TESTS_FAILED > 0 |
| case-11 | fix | REJECT | **Fix angle separation** — debug finds wrong root cause, code-review finds regression |

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

## Self-improvement loop

Run via Workflow tool with `scriptPath: arena-eval/self-improve-loop.js`.

```
Init: read template + eval script → run baseline eval
Loop N rounds:
  propose ONE change (sonnet) → apply (haiku Edit tool) → eval (8-case parallel) → keep if score ≥ best / revert
Report: list kept improvements, score delta, commit recommendation
```

**Args:**
- `baseDir` (default `D:/Projects/man-ultraflow`)
- `rounds` (default `3`) — each round ≈ 350K tokens (8 eval agents)
- `focus` — `'routing'|'challenger'|'caesar'|'efficiency'|null`
- `skip_baseline` — skip the baseline eval (use `known_score: 16` when you've just run it)

The loop is a Workflow (not an agent), so it CAN call `workflow()` at the top level for the eval sub-workflow. Agents inside cannot — this is the nesting constraint that makes `run-eval-workflow.js` a separate top-level workflow.

Since baseline is 16/16 (perfect), the loop finds changes that MAINTAIN the score while improving clarity or token efficiency. Any change that drops below 16 is reverted.

See `plans/reports/researcher-260609-prior-art-comparable-systems.md` for the DGM vs human-in-loop context.

## Adding cases

Cases should:
- Cover a distinct failure mode not already tested
- Have a clear, binary pass criterion (not subjective)
- Include a **false-positive case** (Case 02 is currently the only one — add more if arena over-triggers)
- Represent realistic prompts, not synthetic trick inputs
