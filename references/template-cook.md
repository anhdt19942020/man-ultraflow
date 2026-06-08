# Ultraflow — Cook Template

Workflow script for parallel implementation. One scout agent (following **ck:scout**) → one planner (following **ck:plan**) splits the task into N file-disjoint subtasks → N developers each implement their subtask following **ck:cook** in an isolated worktree → one tester (following **ck:test**) verifies.

Every phase delegates to the original ck: skill; Workflow provides the parallel fan-out and worktree isolation.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `task` | string | required | Feature/task description |
| `n` | number | 2 | Number of parallel developers |
| `planPath` | string | optional | Existing plan path — skips scout + plan phases |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-cook',
  description: 'ck:scout + ck:plan split, then N ck:cook devs in worktrees, then ck:test',
  phases: [
    { title: 'Scout', detail: 'One agent runs ck:scout for context' },
    { title: 'Plan', detail: 'One agent runs ck:plan to split into N file-disjoint subtasks' },
    { title: 'Implement', detail: 'N developers each run ck:cook on a subtask in its own worktree' },
    { title: 'Test', detail: 'One agent runs ck:test across the merged changes' },
  ],
}

const task = (args && args.task) || 'the given task'
const n = (args && args.n) || 2
const planPath = args && args.planPath

const useCkSkill = (name, dir) =>
  `Use the ORIGINAL ${name} skill as the single source of truth — do NOT invent a different process.\n` +
  `Load it first: call the Skill tool with skill "${name}". If the Skill tool is unavailable to you, Read ~/.claude/skills/${dir}/SKILL.md and every reference file it instructs you to load.\n` +
  `Then follow that skill's steps, gates, and output format EXACTLY for the work below.`

let scoutReport = ''
let plan

if (planPath) {
  phase('Plan')
  plan = await agent(`Read the plan at: ${planPath}\nReturn its full content verbatim.`, { label: 'plan-reader', phase: 'Plan' })
} else {
  phase('Scout')
  scoutReport = await agent(
    `${useCkSkill('ck:scout', 'scout')}\n\nScout the codebase for everything needed to implement: ${task}\nReturn project type, relevant files, conventions, public contracts, and overlapping plans.`,
    { label: 'scout', phase: 'Scout' }
  )

  phase('Plan')
  plan = await agent(
    `${useCkSkill('ck:plan', 'ck-plan')}

Run ck:plan --parallel for: ${task}

You are PROVIDED with this scout report — skip ck:plan's internal scouting and use it directly:
${scoutReport}

CRITICAL for parallel execution: split the work into EXACTLY ${n} subtasks where each subtask OWNS DISTINCT files (no overlap), each independently completable. For each subtask give: title, file-ownership globs, goal, steps, acceptance criteria.`,
    { label: 'planner', phase: 'Plan' }
  )
}

log(`Plan ready — spawning ${n} developers`)

phase('Implement')
const devResults = await parallel(
  Array.from({ length: n }, (_, i) => () =>
    agent(
      `${useCkSkill('ck:cook', 'cook')}

You are developer-${i + 1}. Implement ONLY subtask ${i + 1} from the plan below, following ck:cook (code mode — the plan already encodes scout + requirements). Touch ONLY files in YOUR subtask's ownership glob; never touch other subtasks' files.

Full task context: ${task}

Plan:
${plan}
${scoutReport ? `\nScout report:\n${scoutReport}` : ''}

When done: commit your changes with a conventional commit message.`,
      { label: `dev-${i + 1}`, phase: 'Implement', isolation: 'worktree' }
    )
  )
)

const completed = devResults.filter(Boolean)
log(`${completed.length}/${n} developers completed`)

phase('Test')
const testResult = await agent(
  `${useCkSkill('ck:test', 'test')}

Run the full test suite for the work just implemented: ${task}

Developer results:
${completed.map((r, i) => `Dev ${i + 1}: ${r}`).join('\n\n')}

Steps: check for merge conflicts across the parallel dev branches, run the suite per ck:test, report pass/fail counts with failing-test errors, and confirm each subtask's acceptance criteria.`,
  { label: 'tester', phase: 'Test' }
)

return { task, devsCompleted: completed.length, plan, testResult }
```

## Notes

- Scout = ck:scout, plan split = ck:plan --parallel, each dev = ck:cook (code mode), test = ck:test — all nguyên bản.
- `isolation: 'worktree'` puts each dev on its own branch. After completion: `git worktree list`, then merge each branch.
- Pass `args.planPath` to skip scout + plan and go straight to implement.
- Requires `ck:scout`, `ck:plan`, `ck:cook`, `ck:test` installed.
- Default `n=2` (safest for merge); use `n=3` only when subtasks are clearly file-disjoint.
