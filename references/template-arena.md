# Ultraflow — Arena Template (smart adversarial dispatcher)

The orchestration layer adds the **adversarial structure**; ck: skills stay untouched and are used only as per-agent tools. A router agent reads the prompt and auto-decides: which ck: skill **produces** the work, which ck: skill(s) **contest** it, how many agents, and what to attack. Then: PRODUCE → CONTEST → JUDGE.

This is the meta-entry point: you give a plain prompt, the router picks the right ck: pairing for you.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | required | Any task/question/decision in natural language |
| `n` | number | optional | Override the number of contest agents (else router decides, 2-3) |

## Routing table (the router follows this)

| Prompt intent | PRODUCE (ck:) | CONTEST (ck:) | N | Contest what |
|---|---|---|---|---|
| implement / code / build / add feature | `ck:cook` (mutates) | `ck:code-review` + `ck:test` | 2-3 | bugs, regressions, broken contracts, missing tests |
| plan / architect / design / roadmap | `ck:plan` | `ck:predict` + architect-critic | 2-3 | false assumptions, missing edge cases, over-engineering, infeasibility |
| fix bug / error / failing test | `ck:fix` (mutates) | `ck:debug` + `ck:code-review` | 2-3 | wrong root cause, regressions |
| debug / find root cause / why | `ck:debug` | additional `ck:debug` investigators | 3 | competing hypotheses |
| research / find info / compare | `ck:research` | research verifiers | 2-3 | wrong/unsourced claims, missing data |
| security / audit / vulnerability | `ck:security` | red-team attackers (`ck:security`) | 3 | exploitable holes |
| review code | `ck:code-review` | `ck:code-review` other lenses | 3 | missed bugs |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-arena',
  description: 'Router auto-picks ck: skills, then PRODUCE → adversarial CONTEST → JUDGE',
  phases: [
    { title: 'Route', detail: 'One router agent picks producer ck:, contester ck:, N agents, contest targets' },
    { title: 'Produce', detail: 'Producer agent runs the chosen ck: skill to create the artifact' },
    { title: 'Contest', detail: 'N adversaries each run a ck: skill to attack the artifact' },
    { title: 'Judge', detail: 'One judge rules: survives / needs revision, with prioritized actions' },
  ],
}

const prompt = (args && args.prompt) || 'the given task'
const nOverride = args && args.n

const useCkSkill = (name, dir) =>
  `Use the ORIGINAL ${name} skill as the single source of truth — do NOT invent a different process.\n` +
  `Load it first: call the Skill tool with skill "${name}". If the Skill tool is unavailable to you, Read ~/.claude/skills/${dir}/SKILL.md and every reference file it instructs you to load.\n` +
  `Then follow that skill's steps, gates, and output format EXACTLY for the work below.`

const ROUTING_TABLE = `
- implement / code / build / add feature  → producer ck:cook (dir cook, mutates=true) | contesters [ck:code-review (ck-code-review), ck:test (test)] | contest: bugs, regressions, broken contracts, missing tests
- plan / architect / design / roadmap     → producer ck:plan (dir ck-plan, mutates=false) | contesters [ck:predict (ck-predict)] | contest: false assumptions, missing edge cases, over-engineering, infeasibility
- fix bug / error / failing test          → producer ck:fix (dir fix, mutates=true) | contesters [ck:debug (ck-debug), ck:code-review (ck-code-review)] | contest: wrong root cause, regressions
- debug / find root cause / why           → producer ck:debug (dir ck-debug, mutates=false) | contesters [ck:debug (ck-debug)] | contest: competing hypotheses
- research / find info / compare          → producer ck:research (dir research, mutates=false) | contesters [ck:research (research)] | contest: wrong/unsourced claims, missing data
- security / audit / vulnerability        → producer ck:security (dir ck-security, mutates=false) | contesters [ck:security (ck-security)] | contest: exploitable holes
- review code / review PR                 → producer ck:code-review (dir ck-code-review, mutates=false) | contesters [ck:code-review (ck-code-review)] | contest: missed bugs`

const ROUTE_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', description: 'The matched intent row' },
    producer_skill: { type: 'string', description: 'e.g. ck:cook' },
    producer_dir: { type: 'string', description: 'e.g. cook' },
    mutates_files: { type: 'boolean', description: 'true if the producer writes code/files' },
    deliverable: { type: 'string', description: 'concrete artifact the producer must output' },
    contesters: {
      type: 'array',
      items: { type: 'object', properties: { name: { type: 'string' }, dir: { type: 'string' } }, required: ['name', 'dir'] },
      description: 'ck: skills the adversaries use',
    },
    n_agents: { type: 'number', description: 'number of contest agents, 2-3' },
    contest_targets: { type: 'array', items: { type: 'string' }, description: 'what the adversaries must attack' },
  },
  required: ['intent', 'producer_skill', 'producer_dir', 'mutates_files', 'deliverable', 'contesters', 'n_agents', 'contest_targets'],
}

phase('Route')
const route = await agent(
  `You are the ARENA router. Read the prompt and decide the adversarial setup using the routing table. Pick the SINGLE best-matching row.

Prompt: ${prompt}

Routing table:
${ROUTING_TABLE}

Return the producer ck: skill (+dir), whether it mutates files, the concrete deliverable, the contester ck: skills (+dirs), how many contest agents (2-3), and the specific contest targets for THIS prompt.`,
  { label: 'router', phase: 'Route', schema: ROUTE_SCHEMA }
)

if (!route) {
  log('Router failed — aborting')
  return { prompt, error: 'router failed' }
}

const n = Math.max(2, Math.min(nOverride || route.n_agents || 2, 4))
log(`Intent: ${route.intent} → produce with ${route.producer_skill}, contest with ${route.contesters.map(c => c.name).join(', ')} (${n} agents)`)

phase('Produce')
const artifact = await agent(
  `${useCkSkill(route.producer_skill, route.producer_dir)}

Task: ${prompt}

Produce this deliverable: ${route.deliverable}

Report exactly what you produced. ${route.mutates_files ? 'Commit your changes with a conventional commit message and report the branch + the file:line changes so reviewers can inspect them.' : 'Output the full artifact so reviewers can scrutinize it.'}`,
  { label: 'producer', phase: 'Produce', ...(route.mutates_files ? { isolation: 'worktree' } : {}) }
)

phase('Contest')
const critiques = await parallel(
  Array.from({ length: n }, (_, i) => {
    const adv = route.contesters[i % route.contesters.length]
    return () =>
      agent(
        `${useCkSkill(adv.name, adv.dir)}

You are contester-${i + 1} in an adversarial arena. Your job: ATTACK the artifact below produced for this task — assume it is flawed until proven otherwise. Use your ${adv.name} skill as the tool to find concrete faults.

Original task: ${prompt}

Artifact produced (by ${route.producer_skill}):
${artifact}

Contest targets (attack these specifically): ${route.contest_targets.join('; ')}

Rules:
- Every objection MUST cite concrete evidence (file:line, a specific claim, a reproducible scenario). No vague "could be better".
- Rate each objection: BLOCKER / MAJOR / MINOR.
- If you genuinely find nothing in your area, say so explicitly (do not invent issues).

Report: ## Objections (rated, with evidence) / ## What holds up / ## Verdict (artifact is: SOUND / NEEDS-REVISION / REJECT)`,
        { label: `contester-${i + 1}-${adv.name.replace('ck:', '')}`, phase: 'Contest' }
      )
  })
)

const valid = critiques.filter(Boolean)
log(`${valid.length}/${n} contesters reported`)

phase('Judge')
const verdict = await agent(
  `You are the impartial JUDGE of an adversarial arena. Weigh the produced artifact against the contesters' objections and rule.

Original task: ${prompt}

Artifact (by ${route.producer_skill}):
${artifact}

Contester reports:
${valid.map((c, i) => `=== Contester ${i + 1} ===\n${c}`).join('\n\n')}

Rule:
1. **Verdict**: ACCEPT (ship as-is) / REVISE (fix listed items first) / REJECT (approach is wrong)
2. **Upheld objections**: which BLOCKER/MAJOR objections are real (dismiss any that are wrong or non-issues — say why)
3. **Required actions** (numbered, prioritized): exactly what to fix, where, how
4. **One-line bottom line**

Be decisive. A contester being loud does not make an objection valid — judge on evidence.`,
  { label: 'judge', phase: 'Judge' }
)

return {
  prompt,
  intent: route.intent,
  producer: route.producer_skill,
  contesters: route.contesters.map(c => c.name),
  agents: n,
  mutatedFiles: route.mutates_files,
  verdict,
}
```

## Notes

- **Trigger:** `/man:ultraflow --arena "<prompt>"` (or `arena <prompt>`). The router decides everything else.
- **`--agents N`** overrides the router's agent count (clamped 2-4).
- The adversarial structure lives entirely here; every agent still uses the original ck: skills as tools — ck: is never modified.
- If the producer mutated files (`ck:cook` / `ck:fix`), it ran in an isolated worktree. After a REVISE/ACCEPT verdict, merge the branch: `git worktree list` → `git merge <branch>`.
- Requires the ck: skills the router routes to (cook, ck-code-review, test, ck-plan, ck-predict, fix, ck-debug, research, ck-security).
