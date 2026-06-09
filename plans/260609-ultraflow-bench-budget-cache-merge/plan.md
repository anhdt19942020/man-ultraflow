---
title: "man:ultraflow — Benchmark Template, Token Budget, Cache Layer, Smart Merge"
status: pending
scope: project
plan_dir: 260609-ultraflow-bench-budget-cache-merge
created: 2026-06-09
mode: hard
blockedBy: []
blocks: []
---

# man:ultraflow — 4 Improvements Roadmap

Add four capabilities to the man:ultraflow multi-agent orchestrator without rewriting any
`ck:` skill (templates stay orchestrators-only; `ck:` stays the source of truth):

1. **Benchmark template** — replace qualitative LLM judging with objective metrics (tests, time, LOC, lint) → scorecard → merge the numerically-best branch.
2. **Token budget** — `--budget` to halt fan-out at a threshold + per-agent token report after each run.
3. **Cache layer** — persist scout context maps to `.ultraflow/cache/<git-hash>/` so plan/cook reuse instead of re-scanning.
4. **Smart merge** — one agent reads all N worktrees and cherry-picks the best parts of each branch instead of picking one whole branch.

## Ground Truth (verified against the codebase)

- Engine primitives available to every template: `agent(prompt, opts)`, `parallel([fns])`, `phase(title)`, `log(msg)`, `args`, and a returned result object. Verified across all 9 templates in `references/`.
- `agent()` `opts` supports `{ label, phase, model, schema, isolation }`. `schema` yields structured JSON (used by arena Lanista `references/template-arena.md:106` and fix diagnoser `references/template-fix.md:62`). `isolation: 'worktree'` puts an agent on its own branch.
- **No token/usage metadata is surfaced by `agent()` today** (grep for `token|usage|cost` across the skill returns zero engine fields). This is the load-bearing unknown for Phase 4 (budget).
- **No `bash`/`exec` engine primitive.** Agents run shell only via their own tool access. So the benchmark must run via a *measurement agent* that executes commands and returns structured numbers — not via direct engine shell calls.
- Worktree branch is surfaced via a `BRANCH: <name>` footer regex (`references/template-cook.md:111`, `template-fix.md:98`, `template-arena.md:165`). Merge is manual at the SKILL.md layer.
- Engine is **stateless between runs** (`template-arena.md:53` reconstructs the round counter from the prompt). Confirms the cache must be filesystem-backed, keyed by git hash.
- man-ultraflow is its own git repo (`git rev-parse --show-toplevel` = the skill dir). Plan is project-scoped here. No `ck` CLI on PATH → plan scaffolded by hand (graceful fallback per ck:plan skill).

## Phases

| # | Phase | Status | Priority | Blocks On | Deliverable |
|---|-------|--------|----------|-----------|-------------|
| 1 | [Shared Foundation: `_shared` lib + `.ultraflow/` contract](phase-01-shared-foundation.md) | pending | P1 | — | reusable helpers (git-hash, BRANCH parse, scorecard schema, cache I/O contract) |
| 2 | [Cache Layer](phase-02-cache-layer.md) | pending | P1 | 1 | scout cache read/write; plan+cook reuse on cache hit |
| 3 | [Token Budget + Per-Agent Report](phase-03-token-budget.md) | pending | P1 | 1 | `--budget`, fan-out halt, per-agent token table |
| 4 | [Benchmark Template](phase-04-benchmark-template.md) | pending | P2 | 1 | `bench` template: N solutions → objective scorecard → winner |
| 5 | [Smart Merge](phase-05-smart-merge.md) | pending | P2 | 1 | cherry-pick-best agent for cook/fix/bench winners |
| 6 | [Integration, Docs & Validation](phase-06-integration-validation.md) | pending | P2 | 2,3,4,5 | SKILL.md/README wiring, end-to-end runs, metric gates |

## Dependency Map

```
            ┌─────────────────────────┐
            │ P1 Shared Foundation    │  (git-hash, BRANCH-parse, scorecard schema,
            │ _shared.md + .ultraflow │   cache-path, token-probe helpers)
            └────────────┬────────────┘
        ┌────────┬───────┼────────┬─────────┐
        ▼        ▼       ▼        ▼          
   ┌────────┐┌────────┐┌───────┐┌──────────┐
   │P2 Cache││P3 Budg.││P4 Bnch││P5 SmrtMrg│  (P2–P5 independent of each other →
   └───┬────┘└───┬────┘└───┬───┘└────┬─────┘   can run in parallel after P1)
       └─────────┴─────────┴─────────┘
                      ▼
            ┌─────────────────────┐
            │ P6 Integration +    │  (wires all four into SKILL.md/README,
            │ Validation (gates)  │   runs e2e, checks metric success criteria)
            └─────────────────────┘
```

- **Hard dependency:** every feature phase depends on P1 (shared helpers + the `.ultraflow/` contract). Build P1 first.
- **Soft independence:** P2/P3/P4/P5 touch disjoint files (different reference templates + disjoint `_shared` functions) → safe to parallelize via `/man:ultraflow cook` itself (dogfooding) once P1 lands.
- **P6 is the join point** — it must run last because it reconciles SKILL.md routing for all four and runs the objective gates.
- **Cross-feature note:** P3 (budget) and P4 (bench) both want per-agent token numbers; P1 centralizes the token-probe helper so they share one implementation (DRY).

## Key Risks (top 3 — full list per phase)

1. **No engine token API (P3, P4).** If `agent()` truly exposes no usage data, budget + token-report degrade to *estimation* (input+output char counts ÷ ~4). P3 Step 1 is a hard probe gate that decides real-vs-estimate before any other budget work.
2. **Benchmark needs a runnable suite (P4).** Objective scoring is only meaningful where `lint`/`test`/LOC commands exist and pass deterministically. P4 must detect project tooling and *fall back to qualitative judge* when no suite is runnable — never emit fake numbers.
3. **Smart merge can produce a broken tree (P5).** Cherry-picking across branches can yield a combination that compiles in no single branch. P5 mandates a post-merge test gate; on failure it falls back to "pick the single best whole branch" (today's behavior).

## Success Criteria (objective, measured in P6)

- Cache hit on an unchanged repo cuts a `plan`/`cook` scout phase from N scout agents to **0** (re-read from disk), measured by agent-spawn count in the workflow log.
- `--budget` halts fan-out: a run with a deliberately low budget spawns **strictly fewer** agents than the same run uncapped, and prints a per-agent token table with one row per spawned agent.
- `bench` emits a scorecard with ≥3 numeric columns (tests pass %, wall-time, LOC delta, lint count) and selects the winner by a stated formula — reproducible: same inputs → same winner.
- Smart merge: on a 2-branch cook where each branch is individually correct, the merged tree passes the test suite; on an intentionally-conflicting pair it falls back to whole-branch pick (no broken merge committed).
- Zero edits to any `ck:` skill file (only `references/template-*.md`, `references/_shared.md`, `SKILL.md`, `README.md` change). Verified by `git diff --name-only`.

## Out of Scope (YAGNI)

- No new MCP server, no daemon, no DB. Cache is plain JSON files.
- No cross-machine / shared cache. Local `.ultraflow/` only, git-hash keyed.
- No retraining of `ck:` judges; bench *adds* a numeric template, it does not replace arena's qualitative judge.
- No automatic budget cost in $ — token counts only (cost mapping is a downstream concern).
