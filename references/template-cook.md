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

// args may arrive as an object OR a JSON string (harness-dependent) — normalize both.
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
const task = A.task || 'the given task'
const n = A.n || 2
const planPath = A.planPath

// Abort early on an empty task instead of scouting + planning for a placeholder.
if (!A.task && !planPath) {
  log('No task or planPath provided (args carried neither) — aborting.')
  return { error: 'empty-input', hint: 'Re-run: /man:ultraflow --cook "<task>" (or pass planPath)' }
}

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

  // Guard: scout returned nothing — the planner prompt below depends on this report.
  if (!scoutReport) {
    log('Scout agent returned nothing — aborting before plan')
    return { task, error: 'scout failed' }
  }

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

// Guard: plan is required before spawning developers.
if (!plan) {
  log('Planner agent returned nothing — aborting before implementation')
  return { task, error: 'planner failed' }
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

When done: commit your changes with a conventional commit message, report the file:line changes, and end your report with the branch name on its own final line in the EXACT form \`BRANCH: <branch-name>\`.`,
      { label: `dev-${i + 1}`, phase: 'Implement', isolation: 'worktree' }
    )
  )
)

const completed = devResults.filter(Boolean)
log(`${completed.length}/${n} developers completed`)

// Collect worktree branches from each dev's BRANCH: <name> footer line.
const branches = completed
  .map(r => (typeof r === 'string' ? r.match(/BRANCH:\s*(\S+)/) : null))
  .filter(Boolean)
  .map(m => m[1])

// Abort before testing if every developer failed (nothing to test or merge).
if (completed.length === 0) {
  log('All developer agents failed — aborting before test')
  return { task, devsCompleted: 0, plan, branches, error: 'all devs failed' }
}

phase('Test')
const testResult = await agent(
  `${useCkSkill('ck:test', 'test')}

Run the full test suite for the work just implemented: ${task}

Developer results:
${completed.map((r, i) => `Dev ${i + 1}: ${r}`).join('\n\n')}

Steps: check for merge conflicts across the parallel dev branches, run the suite per ck:test, report pass/fail counts with failing-test errors, and confirm each subtask's acceptance criteria.`,
  { label: 'tester', phase: 'Test' }
)

return { task, devsCompleted: completed.length, plan, branches, testResult }
```

## Notes

- Scout = ck:scout, plan split = ck:plan --parallel, each dev = ck:cook (code mode), test = ck:test — all nguyên bản.
- `isolation: 'worktree'` puts each dev on its own branch; each dev reports `BRANCH: <name>` and the returned `branches` array lists them all. After completion: merge each branch (`git merge <branch>`) then clean up (`git worktree remove <path>`). Resolve merge conflicts manually if subtask file-ownership overlapped.
- Pass `args.planPath` to skip scout + plan and go straight to implement.
- Requires `ck:scout`, `ck:plan`, `ck:cook`, `ck:test` installed.
- Default `n=2` (safest for merge); use `n=3` only when subtasks are clearly file-disjoint.
