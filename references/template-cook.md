# Ultraflow — Cook Template

Workflow script for parallel implementation. Scouts codebase → generates plan → spawns N parallel developers (each in isolated worktree) → runs tester.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `task` | string | required | Feature/task description |
| `n` | number | 2 | Number of parallel developers |
| `planPath` | string | optional | Path to existing plan file to skip planning phase |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-cook',
  description: 'Implement a feature with parallel devs in isolated worktrees, then test',
  phases: [
    { title: 'Scout', detail: 'Scan codebase for relevant patterns and files' },
    { title: 'Plan', detail: 'Break task into independent subtasks per developer' },
    { title: 'Implement', detail: 'N parallel developers, each in own git worktree' },
    { title: 'Test', detail: 'Run full test suite across merged changes' },
  ],
}

const task = (args && args.task) || 'the given task'
const n = (args && args.n) || 2
const planPath = args && args.planPath

phase('Scout')
const scoutReport = await agent(
  `Scout the codebase for context needed to implement: ${task}

Return:
1. Project type, language, framework
2. Files most relevant to this task (with paths)
3. Existing patterns/conventions to follow
4. Public contracts that must stay stable (APIs, schemas, types)
5. Suggested split: how to divide this task into ${n} independent subtasks with NO file overlap`,
  { label: 'scout' }
)

phase('Plan')
const plan = planPath
  ? await agent(`Read the plan at: ${planPath}\nReturn the plan content verbatim.`, { label: 'plan-reader' })
  : await agent(
      `Create an implementation plan for: ${task}

Scout report:
${scoutReport}

Requirements:
- Split into exactly ${n} independent subtasks
- Each subtask MUST own distinct files (no overlap — devs work in parallel)
- List file ownership per subtask as glob patterns
- Each subtask must be completable without the other finishing first
- Include acceptance criteria per subtask

Format:
## Subtask 1 — <title>
File ownership: <glob patterns>
Goal: <what this subtask implements>
Steps: <numbered implementation steps>
Acceptance: <what done looks like>

## Subtask 2 — <title>
...`,
      { label: 'planner' }
    )

log('Plan ready, spawning developers')

phase('Implement')

const subtaskPrompts = Array.from({ length: n }, (_, i) => `
You are developer-${i + 1} implementing subtask ${i + 1} from the plan below.
Read your subtask section carefully. Only touch files in YOUR file ownership glob.
Do NOT touch files owned by other subtasks.

Full task context: ${task}

Plan:
${plan}

Scout report:
${scoutReport}

When done: commit your changes with a conventional commit message (feat:, fix:, etc.).
`)

const devResults = await parallel(
  subtaskPrompts.map((prompt, i) => () =>
    agent(prompt, {
      label: `dev-${i + 1}`,
      phase: 'Implement',
      isolation: 'worktree',
    })
  )
)

const completedDevs = devResults.filter(Boolean)
log(`${completedDevs.length}/${n} developers completed`)

phase('Test')
const testResult = await agent(
  `Run the full test suite and report results.

Task that was just implemented: ${task}

Developer results:
${completedDevs.map((r, i) => `Dev ${i + 1}: ${r}`).join('\n\n')}

Steps:
1. Check for any merge conflicts from parallel dev branches
2. Run the project test suite
3. Report: pass/fail counts, any failing tests with error messages
4. Verify the implemented task meets its acceptance criteria`,
  { label: 'tester', phase: 'Test' }
)

return {
  task,
  devsCompleted: completedDevs.length,
  plan,
  testResult,
}
```

## Notes

- `isolation: 'worktree'` gives each dev their own git branch — no file conflicts even if they touch the same area by mistake
- After Workflow completes, lead must merge worktree branches: `git worktree list` then `git merge <branch>`
- Pass `args.planPath` to skip the scout+plan phases and jump straight to implement
- Default `n=2` is safest — more devs = more merge complexity; use `n=3` only when subtasks are clearly independent
