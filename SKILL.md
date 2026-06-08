---
name: man:ultraflow
description: "Multi-agent Workflow orchestration with ready-made templates. Runs parallel agents via Workflow engine (no env var needed, works on Sonnet). Templates: arena (router auto-picks ck: skills then PRODUCE→adversarial CONTEST→JUDGE), scout (parallel codebase search), brainstorm (N angles → synthesis), plan (research → phased plan), cook (scout→plan→parallel devs→test), fix (N competing hypotheses), debug (adversarial hypotheses), research (N researchers → synthesis), review (security/perf/coverage → merged findings). Usage: /man:ultraflow <template> <args> or /man:ultraflow --arena <prompt>. Trigger on: 'parallel agents', 'ultraflow', 'multi-agent workflow', 'run agents in parallel', 'adversarial', 'đối kháng'."
user-invocable: true
when_to_use: "Invoke when the user wants parallel multi-agent execution using the Workflow engine."
category: dev-tools
keywords: [workflow, parallel, multi-agent, research, review, pipeline, plan, brainstorm, scout, fix, debug, arena, adversarial]
argument-hint: "<template> <args> [--agents N] OR --arena <prompt>"
metadata:
  author: user
  version: "4.0.0"
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
- `arena`: routed intent + producer/contesters used + JUDGE verdict (ACCEPT/REVISE/REJECT) + prioritized required actions; if files were mutated, remind to merge the worktree branch
- `scout`: context map with file table + patterns + contracts + risks
- `brainstorm`: synthesis with winner, trade-offs, next steps
- `plan`: plan document path + phase summary; save to `./plans/`
- `cook`: dev completion count + test results; remind user to merge worktree branches (`git worktree list` → `git merge <branch>`)
- `fix`: selected fix + what changed + verification; merge winning worktree branch
- `debug`: root cause + evidence chain + recommended fix
- `research`: exec summary + key recommendations
- `review`: counts (CRITICAL/IMPORTANT/MODERATE) + action items
- Ask if user wants to save the report to `plans/reports/`
