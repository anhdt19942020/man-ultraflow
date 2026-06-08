# Ultraflow — Fix Template

Workflow script for parallel bug fixing. Diagnose root cause → N agents each propose a fix from a different angle → best fix applied → verified.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `issue` | string | required | Bug, error message, or issue description |
| `n` | number | 3 | Number of competing fix hypotheses |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-fix',
  description: 'Diagnose root cause then run N competing fix hypotheses, apply the best',
  phases: [
    { title: 'Diagnose', detail: 'Root cause investigation — no fixes without diagnosis' },
    { title: 'Fix', detail: 'N agents each implement a competing fix hypothesis' },
    { title: 'Verify', detail: 'Evaluate fixes, select winner, verify it solves the issue' },
  ],
}

const issue = (args && args.issue) || 'the given issue'
const n = (args && args.n) || 3

phase('Diagnose')

const DIAGNOSIS_SCHEMA = {
  type: 'object',
  properties: {
    root_cause: { type: 'string', description: 'The actual root cause (not the symptom)' },
    symptom: { type: 'string', description: 'What the user observes' },
    affected_files: {
      type: 'array',
      items: { type: 'object', properties: { path: { type: 'string' }, reason: { type: 'string' }, lines: { type: 'string' } }, required: ['path', 'reason'] }
    },
    fix_approaches: {
      type: 'array',
      items: { type: 'string' },
      description: `Exactly ${n} distinct fix approaches to try in parallel`
    },
    confidence: { type: 'number', description: '0-100: confidence in root cause' },
    safe_to_auto_fix: { type: 'boolean', description: 'True if fix is low-blast-radius' },
  },
  required: ['root_cause', 'symptom', 'affected_files', 'fix_approaches', 'confidence', 'safe_to_auto_fix'],
}

const diagnosis = await agent(
  `Diagnose the root cause of this issue: ${issue}

RULES:
- Find root cause, NOT just the symptom
- Read actual source files — do not guess
- Trace the error backward through the call stack
- Check: recent changes, dependencies, environment, data flow

Return:
1. Root cause (the actual broken invariant/logic, not the error message)
2. Symptom (what user sees)
3. Affected files with paths and line numbers
4. Exactly ${n} distinct fix approaches ordered from simplest to most invasive
5. Confidence score (0-100)
6. Whether this is safe to auto-fix (low blast radius = no breaking changes, no schema changes)`,
  { label: 'diagnoser', phase: 'Diagnose', schema: DIAGNOSIS_SCHEMA }
)

if (!diagnosis || diagnosis.confidence < 50) {
  log('Low confidence diagnosis — expanding investigation')
}

const approaches = (diagnosis && diagnosis.fix_approaches) || Array.from({ length: n }, (_, i) => `Fix approach ${i + 1} for: ${issue}`)
log(`Root cause identified: ${diagnosis && diagnosis.root_cause}`)
log(`Spawning ${approaches.length} parallel fix agents`)

phase('Fix')

const fixResults = await parallel(
  approaches.slice(0, n).map((approach, i) => () =>
    agent(
      `Implement fix for: ${issue}

Root cause: ${diagnosis && diagnosis.root_cause}
Approach ${i + 1}: ${approach}

Affected files:
${diagnosis && diagnosis.affected_files ? diagnosis.affected_files.map(f => `- ${f.path}${f.lines ? ':' + f.lines : ''} — ${f.reason}`).join('\n') : 'See diagnosis'}

RULES:
- Fix the ROOT CAUSE, not the symptom
- Minimal change — do not refactor unrelated code
- Preserve all public contracts (signatures, return types, API shapes)
- If approach requires breaking changes, state them explicitly and STOP without modifying files
- After implementing, describe exactly what changed and why

Return: what you changed (file:line), why it fixes the root cause, any side effects or risks.`,
      { label: `fix-${i + 1}`, phase: 'Fix', isolation: 'worktree' }
    ).then(result => ({ approach, result, index: i + 1 }))
  )
)

const completedFixes = fixResults.filter(Boolean)
log(`${completedFixes.length}/${n} fix attempts completed`)

phase('Verify')

const verification = await agent(
  `Evaluate and select the best fix for: ${issue}

Original diagnosis:
- Root cause: ${diagnosis && diagnosis.root_cause}
- Affected files: ${diagnosis && diagnosis.affected_files ? diagnosis.affected_files.map(f => f.path).join(', ') : 'unknown'}

Fix attempts:
${completedFixes.map(f => `=== Fix ${f.index} (${f.approach}) ===\n${f.result}`).join('\n\n')}

Evaluate each fix:
1. Does it address the ROOT CAUSE (not just symptom)?
2. Does it introduce any regressions or side effects?
3. Is it minimal (no unnecessary changes)?
4. Does it preserve all public contracts?

Select the best fix. If multiple are equivalent, prefer the simplest.
State: which fix won, why, and what the user should do to apply it (git commands or file edits needed).`,
  { label: 'verifier', phase: 'Verify' }
)

return {
  issue,
  diagnosis,
  fixes: completedFixes.length,
  verification,
}
```

## Notes

- `isolation: 'worktree'` means each fix agent works in its own git branch — no conflicts
- After Workflow completes: check `git worktree list`, merge the winning branch
- The verifier evaluates fix quality, NOT just "did tests pass" — tests passing on a symptom fix is a false positive
- If `diagnosis.safe_to_auto_fix` is false, present fix to user before merging
- Default `n=3` competing hypotheses is the sweet spot; `n=2` for simple bugs, `n=4` for deep/systemic issues
