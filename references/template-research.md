# Ultraflow — Research Template

Workflow script for parallel research. N agents explore different angles concurrently, then synthesize.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `topic` | string | required | Research topic |
| `n` | number | 3 | Number of parallel researchers |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-research',
  description: 'Research a topic with N parallel agents, each covering a different angle',
  phases: [
    { title: 'Research', detail: 'N researchers in parallel, each on a distinct angle' },
    { title: 'Synthesize', detail: 'Merge all reports into one executive summary' },
  ],
}

const n = (args && args.n) || 3
const topic = (args && args.topic) || 'the given topic'

const BASE_ANGLES = [
  `Architecture, patterns, and proven approaches for: ${topic}`,
  `Alternatives, competing solutions, and trade-offs for: ${topic}`,
  `Risks, edge cases, failure modes, and security concerns for: ${topic}`,
  `Implementation details, tooling, and ecosystem for: ${topic}`,
  `Performance, scalability, and operational concerns for: ${topic}`,
]

const ANGLES = BASE_ANGLES.slice(0, n)

phase('Research')
const reports = await parallel(ANGLES.map((angle, i) => () =>
  agent(
    `You are researcher-${i + 1} in a parallel research team.

Your assigned angle: ${angle}

Research this thoroughly. Be specific and evidence-based. Structure your report as:
1. Executive Summary (2-3 sentences)
2. Key Findings (bullet points with evidence)
3. Concrete Examples or Code Snippets (if applicable)
4. Recommendations
5. Unresolved Questions

Topic context: ${topic}`,
    { label: `researcher-${i + 1}`, phase: 'Research' }
  )
))

const valid = reports.filter(Boolean)
log(`${valid.length}/${n} researchers completed`)

phase('Synthesize')
const synthesis = await agent(
  `Synthesize these ${valid.length} research reports on: ${topic}

${valid.map((r, i) => `=== Researcher ${i + 1} (${ANGLES[i]}) ===\n${r}`).join('\n\n')}

Produce a unified report:
## Executive Summary
## Key Findings (deduplicated, prioritized)
## Comparative Analysis (where researchers agreed/disagreed)
## Recommendations (actionable, ranked)
## Open Questions`,
  { label: 'synthesizer', phase: 'Synthesize' }
)

return synthesis
```

## Notes

- Default 3 angles covers architecture/alternatives/risks — good for most topics
- Pass `args.n = 4` or `5` for broader coverage (adds implementation + performance angles)
- Agents run fully parallel — wall-clock ≈ slowest single researcher, not sum of all
