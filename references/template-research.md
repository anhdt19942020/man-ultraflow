# Ultraflow — Research Template

Workflow script for parallel research. N agents each run the original **research** skill on a distinct angle → one synthesizer (following the research skill) merges into a unified, cited report.

Research depth, sourcing, and rigor are the research skill's; Workflow runs the angles concurrently and synthesizes.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `topic` | string | required | Research topic |
| `n` | number | 3 | Number of parallel researchers |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-research',
  description: 'N parallel research-skill runs on distinct angles, then synthesis',
  phases: [
    { title: 'Research', detail: 'N researchers in parallel, each following the research skill on a distinct angle' },
    { title: 'Synthesize', detail: 'One research-skill pass merges all reports' },
  ],
}

const n = (args && args.n) || 3
const topic = (args && args.topic) || 'the given topic'

const useCkSkill = (name, dir) =>
  `Use the ORIGINAL ${name} skill as the single source of truth — do NOT invent a different process.\n` +
  `Load it first: call the Skill tool with skill "${name}". If the Skill tool is unavailable to you, Read ~/.claude/skills/${dir}/SKILL.md and every reference file it instructs you to load.\n` +
  `Then follow that skill's method and output format EXACTLY for the work below.`

const ANGLES = [
  `Architecture, patterns, and proven approaches for: ${topic}`,
  `Alternatives, competing solutions, and trade-offs for: ${topic}`,
  `Risks, edge cases, failure modes, and security concerns for: ${topic}`,
  `Implementation details, tooling, and ecosystem for: ${topic}`,
  `Performance, scalability, and operational concerns for: ${topic}`,
].slice(0, n)

phase('Research')
const reports = await parallel(ANGLES.map((angle, i) => () =>
  agent(
    `${useCkSkill('research', 'research')}\n\nYou are researcher-${i + 1} in a parallel team. Your assigned angle: ${angle}\n\nResearch thoroughly and evidence-based. Structure: 1) Executive Summary, 2) Key Findings (with evidence), 3) Concrete Examples/Snippets, 4) Recommendations, 5) Unresolved Questions.\n\nTopic context: ${topic}`,
    { label: `researcher-${i + 1}`, phase: 'Research' }
  )
))

const valid = reports.filter(Boolean)
log(`${valid.length}/${n} researchers completed`)

phase('Synthesize')
const synthesis = await agent(
  `${useCkSkill('research', 'research')}

Synthesize these ${valid.length} research reports on: ${topic}

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

- Each agent runs the real research skill; Workflow supplies the angle split and synthesis.
- Default 3 angles (architecture / alternatives / risks); `n=4` or `5` adds implementation + performance.
- Agents run fully parallel — wall-clock ≈ slowest single researcher.
- Requires the `research` skill installed (`~/.claude/skills/research`).
