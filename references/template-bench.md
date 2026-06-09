# Ultraflow — Bench Template

Workflow script for objective benchmarking of competing solutions. N solver agents each implement the task in isolated worktrees → a benchmarker agent runs real metrics (test suite, timing, LOC count, lint score) on each branch → a scorer agent produces an objective scorecard and declares a winner.

Unlike arena's qualitative Caesar judgment, bench uses **measurable numbers** to pick the winner.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `task` | string | required | Feature/fix/task description — each solver implements independently |
| `n` | number | 3 | Number of competing solver agents |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-bench',
  description: 'N solvers implement independently → benchmarker measures real metrics → scorer picks objective winner',
  phases: [
    { title: 'Scout', detail: 'One agent scouts codebase for context' },
    { title: 'Solve', detail: 'N solvers each implement the task in isolated worktrees' },
    { title: 'Benchmark', detail: 'Run test suite, measure timing, count LOC, check lint on each branch' },
    { title: 'Score', detail: 'Produce objective scorecard and declare winner' },
  ],
}

const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
const task = A.task || 'the given task'
const n = A.n || 3

if (!A.task) {
  log('No task provided — aborting.')
  return { error: 'empty-input', hint: 'Re-run: /man:ultraflow bench "<task>"' }
}

const useCkSkill = (name, dir) =>
  'Use the ORIGINAL ' + name + ' skill as the single source of truth — do NOT invent a different process.\n' +
  'Load it first: call the Skill tool with skill "' + name + '". If the Skill tool is unavailable to you, Read ~/.claude/skills/' + dir + '/SKILL.md and every reference file it instructs you to load.\n' +
  'Then follow that skill\'s steps, gates, and output format EXACTLY for the work below.'

phase('Scout')
const scoutReport = await agent(
  useCkSkill('ck:scout', 'scout') + '\n\nScout the codebase for everything needed to implement: ' + task + '\nReturn project type, relevant files, conventions, test commands, lint commands, and build commands.',
  { label: 'scout', phase: 'Scout' }
)

if (!scoutReport) {
  log('Scout failed — aborting')
  return { task, error: 'scout failed' }
}

log('Scout done — spawning ' + n + ' competing solvers')

phase('Solve')
const solverResults = await parallel(
  Array.from({ length: n }, (_, i) => () =>
    agent(
      useCkSkill('ck:cook', 'cook') + '\n\n' +
      'You are solver-' + (i + 1) + ' in a benchmark competition. ' + n + ' solvers independently implement the same task. Your goal: produce the BEST implementation (correct, clean, fast, well-tested).\n\n' +
      'Task: ' + task + '\n\n' +
      'Scout report:\n' + scoutReport + '\n\n' +
      'When done: commit your changes with a conventional commit message, report the file:line changes, and end your report with the branch name on its own final line in the EXACT form `BRANCH: <branch-name>`.',
      { label: 'solver-' + (i + 1), phase: 'Solve', isolation: 'worktree' }
    )
  )
)

const completed = solverResults.filter(Boolean)
log(completed.length + '/' + n + ' solvers completed')

if (completed.length === 0) {
  log('All solvers failed — nothing to benchmark')
  return { task, solversCompleted: 0, error: 'all solvers failed' }
}

const branches = completed
  .map(r => (typeof r === 'string' ? r.match(/BRANCH:\s*(\S+)/) : null))
  .filter(Boolean)
  .map(m => m[1])

phase('Benchmark')
const benchResults = await parallel(
  branches.map((branch, i) => () =>
    agent(
      'You are the BENCHMARKER for branch "' + branch + '" (solver-' + (i + 1) + ').\n\n' +
      'Checkout the branch via: git worktree list to find its path, then work from that path.\n\n' +
      'Run these measurements and report EXACT numbers:\n' +
      '1. **Tests**: run the project test suite. Report: total tests, passed, failed, skipped. Command hint from scout: look for test scripts in package.json, Makefile, or composer.json.\n' +
      '2. **Timing**: time the test suite execution (wall clock seconds).\n' +
      '3. **LOC changed**: count lines added/removed vs main branch (git diff main --stat).\n' +
      '4. **Lint**: run the project linter. Report: errors count, warnings count. Command hint from scout: look for lint scripts.\n\n' +
      'Scout report for command hints:\n' + scoutReport + '\n\n' +
      'Output format (strict):\n' +
      'BRANCH: ' + branch + '\n' +
      'TESTS_TOTAL: <number>\n' +
      'TESTS_PASSED: <number>\n' +
      'TESTS_FAILED: <number>\n' +
      'TEST_TIME_S: <number>\n' +
      'LOC_ADDED: <number>\n' +
      'LOC_REMOVED: <number>\n' +
      'LINT_ERRORS: <number>\n' +
      'LINT_WARNINGS: <number>\n' +
      'NOTES: <any relevant observations>',
      { label: 'bench-' + branch, phase: 'Benchmark' }
    )
  )
)

const benchCompleted = benchResults.filter(Boolean)

phase('Score')
const scorecard = await agent(
  'You are the SCORER. You have benchmark results from ' + benchCompleted.length + ' competing implementations of: ' + task + '\n\n' +
  'Benchmark results:\n' +
  benchCompleted.map((r, i) => '=== Solver ' + (i + 1) + ' ===\n' + r).join('\n\n') + '\n\n' +
  'Scoring rules (objective, no opinion):\n' +
  '1. **Correctness** (weight 50%): tests passed / tests total. Any test failure is a heavy penalty.\n' +
  '2. **Efficiency** (weight 20%): lower test time = better. Normalize to 0-100.\n' +
  '3. **Conciseness** (weight 15%): fewer LOC changed = better (less code = less maintenance). Normalize to 0-100.\n' +
  '4. **Cleanliness** (weight 15%): fewer lint errors+warnings = better. Normalize to 0-100.\n\n' +
  'Produce:\n' +
  '1. A scorecard TABLE: | Branch | Tests (pass/total) | Time (s) | LOC (+/-) | Lint (err/warn) | Score |\n' +
  '2. The WINNER branch name\n' +
  '3. Brief justification (2-3 sentences max)\n\n' +
  'If any solver has 0 test failures and others have failures, the zero-failure solver wins regardless of other metrics.\n' +
  'If a tie on correctness, break by efficiency, then conciseness, then cleanliness.\n\n' +
  'End with: WINNER: <branch-name>',
  { label: 'scorer', phase: 'Score' }
)

const winnerMatch = scorecard && typeof scorecard === 'string' ? scorecard.match(/WINNER:\s*(\S+)/) : null
const winner = winnerMatch ? winnerMatch[1] : null

return { task, solversCompleted: completed.length, branches, benchResults: benchCompleted, scorecard, winner }
```

## Notes

- Each solver runs in its own worktree (`isolation: 'worktree'`) — no file conflicts between competing implementations.
- Benchmark phase runs per-branch measurement in parallel — each benchmarker checks out one branch and runs real commands.
- Scoring is 100% objective: correctness (50%) > efficiency (20%) > conciseness (15%) > cleanliness (15%).
- After completion, merge the winner branch: `git worktree list` → find winner path → `git merge <winner-branch>` → clean up worktrees.
- Requires `ck:scout`, `ck:cook`, `ck:test` installed. Lint/test commands discovered from scout report.
- **Budget note**: this template is token-intensive (N solvers + N benchmarkers + 1 scorer). The Workflow engine's `budget` API provides a soft directional cap on outer `agent()` calls only — nested ck: skill sub-invocations are invisible to the accumulator. Treat `--budget` as advisory, not a hard ceiling.
- **Cache key design**: if integrating with cache, use `git rev-parse HEAD` for the cache key (returns real SHA even in detached HEAD state). Reserve the literal `nogit` key ONLY for repos with zero commits.
