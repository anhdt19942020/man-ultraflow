# Ultraflow — Debug Template

Workflow script for adversarial debugging. N agents each champion a competing hypothesis and actively try to disprove each other, then converge on root cause.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `issue` | string | required | Bug description, error message, or unexpected behavior |
| `n` | number | 3 | Number of competing hypotheses |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-debug',
  description: 'Debug an issue with N competing hypotheses, adversarial disproof, root cause synthesis',
  phases: [
    { title: 'Hypothesize', detail: 'Generate N independently testable theories' },
    { title: 'Investigate', detail: 'Each agent champions one theory, tries to disprove others' },
    { title: 'Converge', detail: 'Synthesize surviving evidence into root cause report' },
  ],
}

const issue = (args && args.issue) || 'the reported issue'
const n = (args && args.n) || 3

phase('Hypothesize')
const hypotheses = await agent(
  `Generate ${n} competing hypotheses for this issue: ${issue}

Rules:
- Each hypothesis must be INDEPENDENTLY TESTABLE (different observable evidence)
- Each must predict DIFFERENT symptoms — no near-duplicates
- Frame each as: "If <cause>, then we should observe <specific evidence>"
- Cover different layers: application logic, data/state, infrastructure, race conditions, config

Return exactly ${n} hypotheses as a numbered list. Each on one line:
1. If <cause>, then <observable evidence>
2. ...`,
  { label: 'hypothesizer', phase: 'Hypothesize' }
)

log(`Hypotheses generated, spawning ${n} investigators`)

const hypothesisList = hypotheses
  .split('\n')
  .filter(l => /^\d+\./.test(l.trim()))
  .slice(0, n)

phase('Investigate')
const investigations = await parallel(
  hypothesisList.map((hypothesis, i) => () =>
    agent(
      `You are investigator-${i + 1}. Your job: test your hypothesis AND actively try to disprove the others.

Issue: ${issue}

All hypotheses under investigation:
${hypothesisList.map((h, j) => `${j + 1}. ${h}`).join('\n')}

YOUR hypothesis to champion: ${hypothesis}

Investigation protocol:
1. Search the codebase for evidence FOR your hypothesis (file:line citations required)
2. Search for evidence AGAINST your hypothesis (be honest)
3. For each OTHER hypothesis, find evidence that would DISPROVE it
4. Conclude: CONFIRMED / REFUTED / INCONCLUSIVE with confidence 0-100%

Report format:
## Hypothesis
<your hypothesis>

## Evidence FOR
- <finding> (file:line)

## Evidence AGAINST
- <finding> (file:line) or "None found"

## Challenges to other hypotheses
- Hypothesis X: <why evidence contradicts it>

## Verdict
CONFIRMED / REFUTED / INCONCLUSIVE — <confidence>%
<one sentence rationale>`,
      { label: `investigator-${i + 1}`, phase: 'Investigate' }
    )
  )
)

const valid = investigations.filter(Boolean)
log(`${valid.length}/${n} investigators completed`)

phase('Converge')
const rootCause = await agent(
  `Synthesize these ${valid.length} adversarial investigation reports into a definitive root cause analysis.

Issue: ${issue}

All hypotheses:
${hypothesisList.join('\n')}

Investigation reports:
${valid.map((r, i) => `=== Investigator ${i + 1} ===\n${r}`).join('\n\n')}

Produce a root cause report:
## Root Cause
<The surviving hypothesis with highest evidence weight. If inconclusive, say so.>

## Evidence Chain
<Step-by-step: what leads to the bug, with file:line citations>

## Disproven Theories
<Each rejected hypothesis and the key evidence that killed it>

## Recommended Fix
<Concrete, specific — file to change, what to change, why it fixes the root cause>

## Verification Steps
<How to confirm the fix works>`,
  { label: 'root-cause-synthesizer', phase: 'Converge' }
)

return {
  issue,
  hypothesesTested: hypothesisList.length,
  investigatorsCompleted: valid.length,
  rootCause,
}
```

## Notes

- Adversarial design matters: investigators who only verify their own theory miss disconfirming evidence; forcing them to challenge peers converges faster
- `n=3` is the sweet spot — 2 is too easy to deadlock, 4+ adds noise without coverage gain
- If all 3 return INCONCLUSIVE, the issue likely requires runtime observation (logs, profiling) — the report will say so
- Pass `args.n = 5` for complex distributed issues (adds network/infra and data-corruption hypotheses)
