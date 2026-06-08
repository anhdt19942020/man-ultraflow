# Ultraflow — Fix Template

Workflow script for parallel fixing. One agent runs the original **ck:fix** diagnosis (scout + root-cause) → N agents each run **ck:fix** to implement a competing fix approach in an isolated worktree → one verifier selects the best.

Diagnosis discipline ("no fix without root cause"), routing, and gates are ck:fix's; Workflow races N independent fix attempts and picks the winner.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `issue` | string | required | Bug, error message, or issue description |
| `n` | number | 3 | Number of competing fix attempts |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-fix',
  description: 'ck:fix diagnosis, then N competing ck:fix attempts in worktrees, then verify',
  phases: [
    { title: 'Diagnose', detail: 'One agent runs ck:fix Scout+Diagnose (root cause, no fix yet)' },
    { title: 'Fix', detail: 'N agents each run ck:fix to implement a distinct approach in a worktree' },
    { title: 'Verify', detail: 'Select the best fix and state how to apply it' },
  ],
}

// args may arrive as an object OR a JSON string (harness-dependent) — normalize both.
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
const issue = A.issue || 'the given issue'
const n = A.n || 3

// Abort early on an empty issue instead of running diagnosis on a placeholder.
if (!A.issue) {
  log('No issue provided (args carried no issue) — aborting.')
  return { error: 'empty-input', hint: 'Re-run: /man:ultraflow --fix "<issue description>"' }
}

const useCkSkill = (name, dir) =>
  `Use the ORIGINAL ${name} skill as the single source of truth — do NOT invent a different process.\n` +
  `Load it first: call the Skill tool with skill "${name}". If the Skill tool is unavailable to you, Read ~/.claude/skills/${dir}/SKILL.md and every reference file it instructs you to load.\n` +
  `Then follow that skill's steps, gates, and discipline EXACTLY for the work below.`

const DIAGNOSIS_SCHEMA = {
  type: 'object',
  properties: {
    root_cause: { type: 'string' },
    affected_files: { type: 'array', items: { type: 'string' } },
    fix_approaches: { type: 'array', items: { type: 'string' }, description: `Exactly ${n} distinct approaches` },
    confidence: { type: 'number' },
  },
  required: ['root_cause', 'affected_files', 'fix_approaches', 'confidence'],
}

phase('Diagnose')
const diagnosis = await agent(
  `${useCkSkill('ck:fix', 'fix')}

Run ONLY the ck:fix Scout + Diagnose steps (Steps 1-2) for: ${issue}
Do NOT implement a fix yet — honor ck:fix's HARD-GATE (no fix before root cause).

Return: the root cause, affected files (path), exactly ${n} distinct fix approaches (simplest → most invasive), and your confidence (0-100).`,
  { label: 'diagnoser', phase: 'Diagnose', schema: DIAGNOSIS_SCHEMA }
)

// Guard: diagnoser returned nothing — cannot proceed without root cause.
if (!diagnosis) {
  log('Diagnoser agent returned nothing — aborting before fix attempts')
  return { issue, error: 'diagnoser failed' }
}

const approaches = diagnosis.fix_approaches || Array.from({ length: n }, (_, i) => `fix approach ${i + 1}`)
log(`Root cause: ${diagnosis.root_cause} — spawning ${Math.min(n, approaches.length)} fix attempts`)

phase('Fix')
const fixes = await parallel(
  approaches.slice(0, n).map((approach, i) => () =>
    agent(
      `${useCkSkill('ck:fix', 'fix')}

The diagnosis is already done (reuse it — do NOT re-diagnose):
- Root cause: ${diagnosis.root_cause}
- Affected files: ${(diagnosis.affected_files || []).join(', ')}

Implement the fix for: ${issue}
Use THIS approach (approach ${i + 1}): ${approach}

Follow ck:fix's implementation + verification discipline. Fix the root cause, keep the change minimal, preserve public contracts. Commit with a conventional message. Report what changed (file:line), why it fixes the root cause, and any risks. End your report with the branch name on its own final line in the EXACT form \`BRANCH: <branch-name>\`.`,
      { label: `fix-${i + 1}`, phase: 'Fix', isolation: 'worktree' }
    ).then(result => ({ approach, result, index: i + 1 }))
  )
)

const done = fixes.filter(Boolean)
log(`${done.length}/${n} fix attempts completed`)

// Collect worktree branch from each fix attempt's BRANCH: <name> footer line.
const branches = done
  .map(f => (typeof f.result === 'string' ? f.result.match(/BRANCH:\s*(\S+)/) : null))
  .filter(Boolean)
  .map(m => m[1])

// Abort before verify if every fix attempt failed (nothing to evaluate).
if (done.length === 0) {
  log('All fix attempts failed — aborting before verify')
  return { issue, diagnosis, attempts: 0, branches, error: 'all fix attempts failed' }
}

phase('Verify')
const verification = await agent(
  `Select the best fix for: ${issue}

Root cause: ${diagnosis.root_cause}

Attempts:
${done.map(f => `=== Fix ${f.index} (${f.approach}) ===\n${f.result}`).join('\n\n')}

Evaluate each (addresses root cause? regressions? minimal? contracts preserved?). Pick the winner (prefer simplest when equivalent). State which fix won, why, and the exact git commands / edits to apply it (which worktree branch to merge).`,
  { label: 'verifier', phase: 'Verify' }
)

return { issue, diagnosis, attempts: done.length, branches, verification }
```

## Notes

- Diagnosis runs ck:fix once (root cause is shared); the N attempts skip re-diagnosis and only differ in approach.
- `isolation: 'worktree'` keeps the competing fixes on separate branches — no conflicts. Each fix attempt reports `BRANCH: <name>` and the returned `branches` array lists them all. After verification: merge the winning branch (`git merge <branch>`) then discard the others (`git worktree remove <path>`). The verifier's output names the winning branch explicitly.
- Requires `ck:fix` installed (`~/.claude/skills/fix`).
- Default `n=3`; `n=2` for trivial bugs, `n=4` for systemic issues.
