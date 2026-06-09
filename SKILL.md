---
name: man:ultraflow
description: "Multi-agent Workflow orchestration with ready-made templates. Runs parallel agents via Workflow engine (no env var needed, works on Sonnet). Templates: arena (router auto-picks ck: skills then PRODUCE→adversarial CONTEST+BENCH in parallel→DAR-digested critiques→hybrid verdict JUDGE — real test/lint numbers feed Caesar for mutating intents; artifact digest for large outputs, unanimity pre-digest, diversity-preserved model assignment, pre-computed diff context), bench (N solutions benchmarked with real metrics → objective winner), scout (parallel codebase search), brainstorm (N angles → synthesis), plan (research → phased plan), cook (scout→plan→parallel devs→test), fix (N competing hypotheses), debug (adversarial hypotheses), research (N researchers → synthesis), review (security/perf/coverage → merged findings). Usage: /man:ultraflow <template> <args> or /man:ultraflow --arena <prompt>. Trigger on: 'parallel agents', 'ultraflow', 'multi-agent workflow', 'run agents in parallel', 'adversarial', 'đối kháng'."
user-invocable: true
when_to_use: "Invoke when the user wants parallel multi-agent execution using the Workflow engine."
category: dev-tools
keywords: [workflow, parallel, multi-agent, research, review, pipeline, plan, brainstorm, scout, fix, debug, arena, adversarial]
argument-hint: "<template> <args> [--agents N] OR --arena <prompt>"
metadata:
  author: user
  version: "4.5.0"
---

# Ultraflow — Parallel Agent Workflows

Run parallel agents via the **Workflow tool** (no env var, works on Sonnet/Opus).

## Source of Truth: the original ck: skills

Each template is **only an orchestrator**. The actual workflow logic is NOT reimplemented here — every spawned agent loads and follows the original ck: skill verbatim (via the Skill tool, or by reading `~/.claude/skills/<dir>/SKILL.md` + its references). Workflow's job is the parallel fan-out, worktree isolation, and synthesis; the ck: skill's job is the method, gates, and output format.

| Template | Delegates to ck: skill | Skill dir |
|---|---|---|
| `arena` | **router-decided** (cook+code-review+test / plan+predict / fix+debug / …) | router picks |
| `scout` | `ck:scout` | `scout` |
| `brainstorm` | `ck:brainstorm` | `brainstorm` |
| `plan` | `ck:research` + `ck:plan` | `research`, `ck-plan` |
| `cook` | `ck:scout` + `ck:plan` + `ck:cook` + `ck:test` | `scout`, `ck-plan`, `cook`, `test` |
| `fix` | `ck:fix` | `fix` |
| `debug` | `ck:debug` | `ck-debug` |
| `research` | `ck:research` | `research` |
| `review` | `ck:code-review` | `ck-code-review` |
| `bench` | `ck:test` + `ck:code-review` | `test`, `ck-code-review` |

**Dependency:** these templates require the listed ck: skills to be installed (ClaudeKit). If a ck: skill is missing, that template degrades to whatever the agent can do without it.

## Usage

```
/man:ultraflow --arena <prompt> [--agents N]   ← router auto-picks ck: skills + adversaries
/man:ultraflow scout <target> [--agents N]
/man:ultraflow brainstorm <topic> [--agents N]
/man:ultraflow plan <task> [--agents N] [--mode fast|hard|deep]
/man:ultraflow cook <task> [--agents N] [--plan <path>]
/man:ultraflow fix <issue> [--agents N]
/man:ultraflow debug <issue> [--agents N]
/man:ultraflow research <topic> [--agents N]
/man:ultraflow review <scope> [--agents N]
/man:ultraflow bench <task> [--agents N]
```

## Execution Protocol

When invoked, IMMEDIATELY:

1. **Parse** template type and args from the command
2. **Read** the matching reference template (see table below)
3. **Call the Workflow tool** with the script from the template and `args` filled in

| Template | Reference file | Args shape | Default N |
|---|---|---|---|
| `arena` | `references/template-arena.md` | `{ prompt, n? }` | router |
| `scout` | `references/template-scout.md` | `{ target, n }` | 3 |
| `brainstorm` | `references/template-brainstorm.md` | `{ topic, n }` | 3 |
| `plan` | `references/template-plan.md` | `{ task, n, mode? }` | 2 |
| `cook` | `references/template-cook.md` | `{ task, n, planPath? }` | 2 |
| `fix` | `references/template-fix.md` | `{ issue, n }` | 3 |
| `debug` | `references/template-debug.md` | `{ issue, n }` | 3 |
| `research` | `references/template-research.md` | `{ topic, n }` | 3 |
| `review` | `references/template-review.md` | `{ scope, n }` | 3 |
| `bench` | `references/template-bench.md` | `{ task, n }` | 3 |

**`--arena` flag** → run the `arena` template; pass everything after it as `args.prompt`. The router auto-picks the producer + adversary ck: skills and agent count. Example: `/man:ultraflow --arena "Add absence column to ticket"` → `Workflow({ script: <arena script>, args: { prompt: "Add absence column to ticket" } })`.
**`--agents N` flag** → pass as `args.n` (in arena, overrides the router's count, clamped 2-4).
**`--plan <path>` flag** (cook only) → pass as `args.planPath` to skip scout+plan phases.
**`--mode fast|hard|deep` flag** (plan only) → pass as `args.mode` (default: `fast`).

Do NOT explain what you're about to do. Parse → Read reference → Call Workflow tool immediately.

## How to call Workflow tool

```
Workflow({
  script: <exact JS script from reference>,
  args: { topic: "...", n: 3 }
})
```

Extract the JS code block from the reference file verbatim. The only substitution needed is setting `args` — the script already uses `args.*` internally.

## Typical Workflow Chain

```
/man:ultraflow scout <target>          → understand codebase
/man:ultraflow brainstorm <topic>      → explore solution options
/man:ultraflow plan <task> --mode hard → create phased plan
/man:ultraflow cook <plan-path>        → parallel implementation
/man:ultraflow fix <issue>             → diagnose + fix bugs
/man:ultraflow debug <issue>           → deep root cause investigation
/man:ultraflow review <scope>          → code quality audit
/man:ultraflow research <topic>        → external knowledge gathering
```

## After Workflow completes

- Report results to user in clean markdown
- `arena`: routed intent + producer (Gladiator) / contesters (Challengers) used + Caesar's verdict (ACCEPT/REVISE/REJECT) + prioritized required actions + `structuredVerdict` (parsed JSON from hybrid verdict, null if extraction failed), then run the **Arena ending** protocol below
- `scout`: context map with file table + patterns + contracts + risks
- `brainstorm`: synthesis with winner, trade-offs, next steps
- `plan`: plan document path + phase summary; save to `./plans/`
- `cook`: dev completion count + test results; changes already committed on current branch — offer to push
- `fix`: selected fix + what changed + verification; changes committed directly on current branch
- `debug`: root cause + evidence chain + recommended fix
- `research`: exec summary + key recommendations
- `review`: counts (CRITICAL/IMPORTANT/MODERATE) + action items
- `bench`: scorecard table with objective metrics (test pass/fail, timing, LOC, lint) + winner branch
- Ask if user wants to save the report to `plans/reports/`

## Arena ending (post-verdict next steps)

After an `arena` run, read Caesar's FULL verdict text — verdict parsing stays at YOUR layer, never trust a single token in isolation (the script does no verdict logic). The return gives you the data: `verdict` (full text), `round`, `intent`, `mutatedFiles`, `agents`, and an `error` field on technical aborts. Present a short, actionable closing menu for the matched case.

**Safety rule (always):** ASK before any mutate / merge / commit / push. Only read-only steps (suggesting, saving a report) may run without asking. If the verdict token is unclear or missing, default to the SAFE side — treat as needs-human-review, never auto-ACCEPT.

**👍 ACCEPT (ÂN XÁ) — ship it:**
- Non-mutating intent (plan / research / review / debug): offer to save the report to `plans/reports/`, and suggest the natural next workflow step (e.g. plan → `/man:ultraflow cook`).
- Mutating intent (cook / fix): Gladiator committed directly on the current branch. (Ask first) optionally push → `/ck:git` for commit message cleanup if needed.

**✊ REVISE (TÁI ĐẤU) — fix upheld items, then let the user choose:**
- **(a) Fix directly** with the ck: skill matching the ORIGINAL `intent`: implement → `/ck:cook` (or hand-edit), fix → `/ck:fix`, plan → `/ck:plan`, review code → `/ck:cook`/hand-edit then re-review (NOT `ck:fix` on a review report).
- **(b) Re-enter the arena** with the auto-generated prompt (format below).
- **Round cap (advisory):** if the returned `round` ≥ 3 and the verdict is still REVISE, do NOT offer path (b) — escalate to the user instead of looping.
- Mutating intent: re-run commits on top of the current branch — guide user to review `git log` before re-entering arena.

**👎 REJECT (KHAI TỬ) — wrong approach, step back:** do NOT offer a same-approach re-run. Suggest `/man:ultraflow brainstorm "<problem>"` or `/man:ultraflow plan "<task>" --mode hard` to rethink. If Gladiator committed changes, offer to revert: `git revert HEAD` (safe) or `git reset --hard HEAD~1` (destructive — confirm first).

**Auto-generated re-run prompt (REVISE path b)** — anchor the original intent and bump the round so the Lanista routes consistently and the counter survives a stateless engine:
```
[TÁI ĐẤU vòng <round+1> — intent: <intent>] <Caesar's required actions, condensed into one concrete task>
```

**Technical / edge cases (the return carries an `error` field):**
- `empty-prompt` → show the correct syntax.
- `router failed` / `no contesters` (Lanista) → report and offer to re-run.
- `producer failed` (Gladiator) → offer to re-run, or use the ck: skill directly.
- `all contesters failed` → the `artifact` is in the return; offer a manual `/ck:code-review` on it (do NOT "re-run the contest" — a re-run makes a new artifact, not a re-attack of the old one).
- Partial coverage (challengers that reported < `agents`, visible in logs) → note the thinner adversarial coverage; consider re-running.

## Arena Optimization Features (v4.5.0)

Eight research-backed optimizations from the arena evolution study (see `plans/reports/researcher-260609-arena-evolution-optimization.md`). Combined realistic savings: ~15-25% tokens, 20-35% wall-clock on typical runs.

| ID | Feature | Token savings | Speed gain | When active |
|---|---|---|---|---|
| P2 | Unanimity pre-digest for Caesar | ~5-8% Caesar output | +5-8% | All challengers SOUND + benchmarks clean |
| P7 | Compact routing table | ~1% (~400 tokens) | — | Always (Lanista prompt) |
| P5 | Parallel benchmarker + challengers | 0% | +20-30% | Mutating intents |
| P4+DAR | Challenger digest with diversity-aware retention | ~8-12% Caesar input | — | Always (SOUND→stub, non-SOUND→BLOCKER/MAJOR only) |
| P3 | Hybrid Caesar verdict (free-text + JSON) | ~5-8% output | — | Always (Caesar appends JSON block) |
| P6 | Diversity-preserved model assignment | ~3-5% | — | Implement intent, N=3, mechanical 3rd angle |
| P1 | Artifact digest for challengers | ~8-12% | +5% | Mutating intents, artifact >150 lines |
| P9 | Pre-computed diff context | ~2-5% | +10% | Mutating intents |

**Architectural strengths preserved:** separation of concerns (ck: skills untouched), schema-constrained routing (ROUTE_SCHEMA), distinct contest angles, model tier diversity (Lanista assigns), stateless round counter, benchmarker as objective ground truth.

**Sources:** D3 budgeted stopping (arxiv:2410.04663), DAR diversity-aware retention (arxiv:2603.20640), "Let Me Speak Freely?" hybrid verdict (production patterns), OI-MAS confidence-aware routing (arxiv:2601.04861), CompactPrompt token pruning (arxiv:2510.18043v1), wrong-consensus rate (arxiv:2509.05396).
