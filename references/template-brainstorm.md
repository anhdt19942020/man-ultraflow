# Ultraflow — Brainstorm Template

Workflow script for parallel brainstorming. N agents each explore the problem from a distinct angle → judge panel evaluates trade-offs → synthesis picks the best approach.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `topic` | string | required | Problem or question to brainstorm |
| `n` | number | 3 | Number of independent brainstorm agents |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-brainstorm',
  description: 'Parallel brainstorming from N independent angles then adversarial synthesis',
  phases: [
    { title: 'Brainstorm', detail: 'N agents each propose a solution from a distinct angle' },
    { title: 'Evaluate', detail: 'Judge panel scores each proposal on YAGNI/KISS/DRY + risk' },
    { title: 'Synthesize', detail: 'Pick winner, graft best ideas from runners-up' },
  ],
}

const topic = (args && args.topic) || 'the given topic'
const n = (args && args.n) || 3

const ANGLES = [
  { name: 'Pragmatist', focus: 'Simplest possible solution. KISS/YAGNI first. Minimal dependencies. Ship fast.' },
  { name: 'Architect', focus: 'Scalability, maintainability, clean boundaries. Think 12 months ahead but not 5 years.' },
  { name: 'Security Engineer', focus: 'Attack surfaces, data integrity, auth boundaries, failure modes, blast radius.' },
  { name: 'User Advocate', focus: 'Developer experience, debuggability, migration path, API ergonomics.' },
  { name: 'Performance Engineer', focus: 'Latency, throughput, memory, database query patterns, caching strategy.' },
]

const selectedAngles = ANGLES.slice(0, n)

phase('Brainstorm')

const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    approach: { type: 'string', description: '1-sentence approach summary' },
    solution: { type: 'string', description: 'Detailed solution description (3-8 sentences)' },
    pros: { type: 'array', items: { type: 'string' }, description: '3-5 concrete pros' },
    cons: { type: 'array', items: { type: 'string' }, description: '3-5 concrete cons / trade-offs' },
    risks: { type: 'array', items: { type: 'string' }, description: '2-3 specific risks' },
    effort: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Implementation effort' },
    reversibility: { type: 'string', enum: ['easy', 'moderate', 'hard'], description: 'How easy to reverse if wrong' },
  },
  required: ['approach', 'solution', 'pros', 'cons', 'risks', 'effort', 'reversibility'],
}

const proposals = await parallel(
  selectedAngles.map((angle, i) => () =>
    agent(
      `You are the ${angle.name}. Your focus: ${angle.focus}

Brainstorm a solution for: ${topic}

Propose the best approach from YOUR specific angle. Be concrete, opinionated, and brutal about trade-offs.
Honor YAGNI (don't build what's not needed), KISS (simplest solution that works), DRY (no duplication).
Do NOT be generic — commit to a specific approach with specific technology/pattern choices.`,
      { label: `brainstorm-${angle.name.toLowerCase().replace(' ', '-')}`, phase: 'Brainstorm', schema: PROPOSAL_SCHEMA }
    ).then(result => ({ angle: angle.name, ...result }))
  )
)

const validProposals = proposals.filter(Boolean)
log(`${validProposals.length}/${n} proposals generated`)

phase('Evaluate')

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          angle: { type: 'string' },
          yagni: { type: 'number', description: '0-10: does it avoid over-engineering?' },
          simplicity: { type: 'number', description: '0-10: KISS score' },
          risk: { type: 'number', description: '0-10: 10=low risk, 0=high risk' },
          reversibility: { type: 'number', description: '0-10: 10=easy to reverse' },
          overall: { type: 'number', description: '0-10 weighted average' },
          rationale: { type: 'string', description: '1-2 sentence rationale' },
        },
        required: ['angle', 'yagni', 'simplicity', 'risk', 'reversibility', 'overall', 'rationale'],
      }
    },
    winner: { type: 'string', description: 'Angle name of the winning proposal' },
    killer_flaw: { type: 'string', description: 'The single biggest risk across all proposals' },
  },
  required: ['scores', 'winner', 'killer_flaw'],
}

const verdict = await agent(
  `Judge these ${validProposals.length} proposals for: ${topic}

${validProposals.map(p => `=== ${p.angle} ===\nApproach: ${p.approach}\nSolution: ${p.solution}\nPros: ${p.pros.join(', ')}\nCons: ${p.cons.join(', ')}\nRisks: ${p.risks.join(', ')}\nEffort: ${p.effort} | Reversibility: ${p.reversibility}`).join('\n\n')}

Score each on YAGNI (avoid over-engineering), simplicity (KISS), risk, reversibility.
Pick a winner. Identify the killer flaw across all proposals that the team must watch for.`,
  { label: 'judge', phase: 'Evaluate', schema: VERDICT_SCHEMA }
)

phase('Synthesize')

const winner = validProposals.find(p => p.angle === (verdict && verdict.winner)) || validProposals[0]
const runners = validProposals.filter(p => p.angle !== (verdict && verdict.winner))

const synthesis = await agent(
  `Synthesize the winning approach for: ${topic}

Winner (${winner && winner.angle}): ${winner && winner.solution}

Runners-up best ideas:
${runners.map(p => `- ${p.angle}: ${p.pros && p.pros[0]}`).join('\n')}

Judge's verdict:
${verdict && JSON.stringify(verdict.scores, null, 2)}

Killer flaw to watch: ${verdict && verdict.killer_flaw}

Write a FINAL RECOMMENDATION that:
1. States the chosen approach clearly (1 paragraph)
2. Grafts the 1-2 best ideas from runners-up into the winning approach
3. Lists 3-5 concrete next steps to start implementation
4. Names the #1 risk and how to mitigate it
5. States what should NOT be built (YAGNI boundary)

Be direct, opinionated, actionable. No hedging.`,
  { label: 'synthesizer', phase: 'Synthesize' }
)

return {
  topic,
  proposals: validProposals,
  verdict,
  winner: winner && winner.angle,
  synthesis,
}
```

## Notes

- Default `n=3` gives Pragmatist + Architect + Security angles — good balanced coverage
- `n=4` adds User Advocate, `n=5` adds Performance Engineer
- The judge scores each proposal independently; the synthesizer grafts the best pieces
- Winner is determined by weighted score, not majority vote — prevents consensus mediocrity
- Ask user if they want to proceed to `/man:ultraflow plan <synthesis>` after completion
