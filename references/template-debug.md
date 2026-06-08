# Ultraflow — Debug Template

Workflow script for adversarial debugging. N agents each run the original **ck:debug** skill championing a competing hypothesis and actively trying to disprove the others → one synthesizer (following ck:debug) converges on the root cause.

Root-cause discipline, defense-in-depth, and verification are ck:debug's; Workflow runs the competing hypotheses in parallel and forces adversarial cross-examination.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `issue` | string | required | Bug description, error message, or unexpected behavior |
| `n` | number | 3 | Number of competing hypotheses |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-debug',
  description: 'N parallel ck:debug investigations of competing hypotheses, adversarial convergence',
  phases: [
    { title: 'Hypothesize', detail: 'One ck:debug pass generates N independently testable theories' },
    { title: 'Investigate', detail: 'N agents each run ck:debug on one theory, disproving the others' },
    { title: 'Converge', detail: 'One ck:debug synthesis produces the root-cause report' },
  ],
}

// args may arrive as an object OR a JSON string (harness-dependent) — normalize both.
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
const issue = A.issue || 'the reported issue'
const n = A.n || 3

// Abort early on an empty issue instead of running debug on a placeholder.
if (!A.issue) {
  log('No issue provided (args carried no issue) — aborting.')
  return { error: 'empty-input', hint: 'Re-run: /man:ultraflow --debug "<issue description>"' }
}

const useCkSkill = (name, dir) =>
  `Use the ORIGINAL ${name} skill as the single source of truth — do NOT invent a different process.\n` +
  `Load it first: call the Skill tool with skill "${name}". If the Skill tool is unavailable to you, Read ~/.claude/skills/${dir}/SKILL.md and every reference file it instructs you to load.\n` +
  `Then follow that skill's steps, gates, and discipline EXACTLY for the work below.`

phase('Hypothesize')
const hypotheses = await agent(
  `${useCkSkill('ck:debug', 'ck-debug')}

Begin ck:debug Phase 1 (Root Cause Investigation) for: ${issue}
Generate exactly ${n} COMPETING, independently testable hypotheses — each predicting different observable evidence, across different layers (app logic, data/state, infra, races, config).

Return a numbered list, each one line:
1. If <cause>, then we should observe <specific evidence>
2. ...`,
  { label: 'hypothesizer', phase: 'Hypothesize' }
)

// Guard: hypothesizer returned nothing — cannot proceed without hypotheses.
if (!hypotheses) {
  log('Hypothesizer agent returned nothing — aborting before investigation')
  return { issue, error: 'hypothesizer failed' }
}

const hypothesisList = hypotheses.split('\n').filter(l => /^\d+\./.test(l.trim())).slice(0, n)

// Guard: no parseable numbered hypotheses — nothing to investigate.
if (hypothesisList.length === 0) {
  log('No numbered hypotheses found in hypothesizer output — aborting')
  return { issue, error: 'no hypotheses parsed', raw: hypotheses }
}

log(`${hypothesisList.length} hypotheses — spawning investigators`)

phase('Investigate')
const investigations = await parallel(
  hypothesisList.map((hypothesis, i) => () =>
    agent(
      `${useCkSkill('ck:debug', 'ck-debug')}

You are investigator-${i + 1}. Run ck:debug's root-cause-tracing and verification discipline.

Issue: ${issue}

All hypotheses under investigation:
${hypothesisList.map((h, j) => `${j + 1}. ${h}`).join('\n')}

YOUR hypothesis to champion: ${hypothesis}

Protocol (per ck:debug):
1. Evidence FOR your hypothesis (file:line citations required)
2. Evidence AGAINST your hypothesis (be honest)
3. For each OTHER hypothesis, find evidence that would DISPROVE it
4. Verdict: CONFIRMED / REFUTED / INCONCLUSIVE with confidence 0-100%

Report: ## Hypothesis / ## Evidence FOR / ## Evidence AGAINST / ## Challenges to others / ## Verdict`,
      { label: `investigator-${i + 1}`, phase: 'Investigate' }
    )
  )
)

const valid = investigations.filter(Boolean)
log(`${valid.length}/${n} investigators completed`)

// Abort before convergence if every investigator failed (nothing to synthesize).
if (valid.length === 0) {
  log('All investigators failed — aborting before convergence')
  return { issue, hypothesesTested: hypothesisList.length, investigatorsCompleted: 0, error: 'all investigators failed' }
}

phase('Converge')
const rootCause = await agent(
  `${useCkSkill('ck:debug', 'ck-debug')}

Synthesize these ${valid.length} adversarial ck:debug investigations into a definitive root-cause report. Apply ck:debug's verification iron law (no completion claim without evidence).

Issue: ${issue}

Hypotheses:
${hypothesisList.join('\n')}

Investigation reports:
${valid.map((r, i) => `=== Investigator ${i + 1} ===\n${r}`).join('\n\n')}

Report: ## Root Cause / ## Evidence Chain (file:line) / ## Disproven Theories / ## Recommended Fix / ## Verification Steps`,
  { label: 'root-cause-synthesizer', phase: 'Converge' }
)

// Guard: synthesizer returned nothing — surface raw investigation reports rather than silently returning null.
if (!rootCause) {
  log('Root-cause synthesizer returned nothing — returning raw investigation outputs')
  return { issue, hypothesesTested: hypothesisList.length, investigatorsCompleted: valid.length, rootCause: valid.join('\n\n'), error: 'synthesizer failed' }
}

return { issue, hypothesesTested: hypothesisList.length, investigatorsCompleted: valid.length, rootCause }
```

## Notes

- Every agent runs the real ck:debug skill; Workflow supplies the competing hypotheses and parallel adversarial cross-examination.
- `n=3` is the sweet spot — 2 deadlocks easily, 4+ adds noise. Use `n=5` for distributed/data-corruption issues.
- If all return INCONCLUSIVE, ck:debug will say runtime observation (logs/profiling) is needed.
- Requires `ck:debug` installed (`~/.claude/skills/ck-debug`).
- Natural next step: `/man:ultraflow fix <issue>` to implement the recommended fix.
