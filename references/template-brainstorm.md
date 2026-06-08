# Ultraflow — Brainstorm Template

Workflow script for parallel brainstorming. N agents each run the original **ck:brainstorm** skill from a distinct angle → one synthesizer (also following ck:brainstorm) consolidates into a final recommendation.

The brainstorming method, trade-off rigor, and honesty bar are ck:brainstorm's; Workflow adds independent parallel angles + adversarial synthesis.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `topic` | string | required | Problem or question to brainstorm |
| `n` | number | 3 | Number of independent brainstorm agents |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-brainstorm',
  description: 'N parallel ck:brainstorm runs from distinct angles, then ck:brainstorm synthesis',
  phases: [
    { title: 'Brainstorm', detail: 'N agents each run ck:brainstorm from a distinct angle' },
    { title: 'Synthesize', detail: 'One ck:brainstorm run consolidates into a final recommendation' },
  ],
}

// args may arrive as an object OR a JSON string (harness-dependent) — normalize both.
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
const topic = A.topic || 'the given topic'
const n = A.n || 3

// Abort early on an empty topic instead of brainstorming on a placeholder.
if (!A.topic) {
  log('No topic provided (args carried no topic) — aborting.')
  return { error: 'empty-input', hint: 'Re-run: /man:ultraflow --brainstorm "<topic>"' }
}

const useCkSkill = (name, dir) =>
  `Use the ORIGINAL ${name} skill as the single source of truth — do NOT invent a different process.\n` +
  `Load it first: call the Skill tool with skill "${name}". If the Skill tool is unavailable to you, Read ~/.claude/skills/${dir}/SKILL.md and every reference file it instructs you to load.\n` +
  `Then follow that skill's principles, structure, and honesty bar EXACTLY for the work below.`

const ANGLES = [
  'the Pragmatist — simplest solution that ships; KISS/YAGNI first; minimal dependencies',
  'the Architect — scalability, maintainability, clean boundaries; ~12 months ahead',
  'the Security/Risk engineer — attack surfaces, data integrity, failure modes, blast radius',
  'the User/DX advocate — developer experience, debuggability, migration path, API ergonomics',
  'the Performance engineer — latency, throughput, memory, query patterns, caching',
]

phase('Brainstorm')
const proposals = await parallel(
  ANGLES.slice(0, n).map((angle, i) => () =>
    agent(
      `${useCkSkill('ck:brainstorm', 'brainstorm')}

Brainstorm a solution for: ${topic}

Adopt the perspective of ${angle}. Commit to a specific, opinionated approach (concrete technology/pattern choices). Apply ck:brainstorm's trade-off analysis and brutal honesty. Output following ck:brainstorm's format, ending with clear pros / cons / risks / effort.`,
      { label: `brainstorm-${i + 1}`, phase: 'Brainstorm' }
    )
  )
)

const valid = proposals.filter(Boolean)
log(`${valid.length}/${n} proposals generated`)

// Abort before synthesis if every brainstorm agent failed (nothing to consolidate).
if (valid.length === 0) {
  log('All brainstorm agents failed — aborting before synthesis')
  return { topic, proposals: 0, error: 'all agents failed' }
}

phase('Synthesize')
const synthesis = await agent(
  `${useCkSkill('ck:brainstorm', 'brainstorm')}

You are consolidating ${valid.length} independent brainstorm proposals for: ${topic}

${valid.map((p, i) => `=== Proposal ${i + 1} (${ANGLES[i]}) ===\n${p}`).join('\n\n')}

Following ck:brainstorm's method, produce a FINAL RECOMMENDATION:
1. Chosen approach (1 paragraph) with honest rationale
2. Best ideas grafted from the runner-up proposals
3. The #1 risk and its mitigation
4. What should NOT be built (YAGNI boundary)
5. Concrete next steps`,
  { label: 'synthesizer', phase: 'Synthesize' }
)

// Guard: synthesizer returned nothing — surface raw proposals rather than silently returning null.
if (!synthesis) {
  log('Synthesizer agent returned nothing — returning raw proposals')
  return { topic, proposals: valid.length, synthesis: valid.join('\n\n'), error: 'synthesizer failed' }
}

return { topic, proposals: valid.length, synthesis }
```

## Notes

- Default `n=3`: Pragmatist + Architect + Security — balanced coverage. `n=4` adds DX, `n=5` adds Performance.
- Each agent and the synthesizer run the real ck:brainstorm skill; Workflow only supplies the parallel angles.
- Requires `ck:brainstorm` installed (`~/.claude/skills/brainstorm`).
- Natural next step: `/man:ultraflow plan <synthesis>`.
