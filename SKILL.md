---
name: man:ultraflow
description: "Multi-agent Workflow orchestration with ready-made templates. Runs parallel agents via Workflow engine (no env var needed, works on Sonnet). Templates: scout (parallel codebase search), brainstorm (N angles → synthesis), plan (research → phased plan), cook (scout→plan→parallel devs→test), fix (N competing hypotheses), debug (adversarial hypotheses), research (N researchers → synthesis), review (security/perf/coverage → merged findings). Usage: /man:ultraflow <template> <args>. Trigger on: 'parallel agents', 'ultraflow', 'multi-agent workflow', 'run agents in parallel'."
user-invocable: true
when_to_use: "Invoke when the user wants parallel multi-agent execution using the Workflow engine."
category: dev-tools
keywords: [workflow, parallel, multi-agent, research, review, pipeline, plan, brainstorm, scout, fix, debug]
argument-hint: "<template> <args> [--agents N]"
metadata:
  author: user
  version: "3.0.0"
---

# Ultraflow — Parallel Agent Workflows

Run parallel agents via the **Workflow tool** (no env var, works on Sonnet/Opus).

## Usage

```
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
| `scout` | `references/template-scout.md` | `{ target, n }` | 3 |
| `brainstorm` | `references/template-brainstorm.md` | `{ topic, n }` | 3 |
| `plan` | `references/template-plan.md` | `{ task, n, mode? }` | 2 |
| `cook` | `references/template-cook.md` | `{ task, n, planPath? }` | 2 |
| `fix` | `references/template-fix.md` | `{ issue, n }` | 3 |
| `debug` | `references/template-debug.md` | `{ issue, n }` | 3 |
| `research` | `references/template-research.md` | `{ topic, n }` | 3 |
| `review` | `references/template-review.md` | `{ scope, n }` | 3 |

**`--agents N` flag** → pass as `args.n`.
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
/ultraflow scout <target>         → understand codebase
/ultraflow brainstorm <topic>     → explore solution options
/ultraflow plan <task> --mode hard → create phased plan
/ultraflow cook <plan-path>       → parallel implementation
/ultraflow fix <issue>            → diagnose + fix bugs
/ultraflow debug <issue>          → deep root cause investigation
/ultraflow review <scope>         → code quality audit
/ultraflow research <topic>       → external knowledge gathering
```

## After Workflow completes

- Report results to user in clean markdown
- `scout`: context map with file table + patterns + contracts + risks
- `brainstorm`: synthesis with winner, trade-offs, next steps
- `plan`: plan document path + phase summary; save to `./plans/`
- `cook`: dev completion count + test results; remind user to merge worktree branches (`git worktree list` → `git merge <branch>`)
- `fix`: selected fix + what changed + verification; merge winning worktree branch
- `debug`: root cause + evidence chain + recommended fix
- `research`: exec summary + key recommendations
- `review`: counts (CRITICAL/IMPORTANT/MODERATE) + action items
- Ask if user wants to save the report to `plans/reports/`
