# Ultraflow — Scout Template

Workflow script for parallel scouting. N agents each run the original **ck:scout** skill on a distinct dimension of the target → one merger consolidates into a single context map.

Scouting technique (parallel Explore, token-efficiency, file:line discipline) is ck:scout's; Workflow fans it across dimensions and merges.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `target` | string | required | What to scout for (task, feature, module, or keyword) |
| `n` | number | 3 | Number of parallel scout agents |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-scout',
  description: 'N parallel ck:scout runs across distinct dimensions, merged into one context map',
  phases: [
    { title: 'Scout', detail: 'N agents each run ck:scout on a distinct dimension' },
    { title: 'Merge', detail: 'Consolidate findings into a single context map' },
  ],
}

const target = (args && args.target) || 'the given target'
const n = (args && args.n) || 3

const useCkSkill = (name, dir) =>
  `Use the ORIGINAL ${name} skill as the single source of truth — do NOT invent a different process.\n` +
  `Load it first: call the Skill tool with skill "${name}". If the Skill tool is unavailable to you, Read ~/.claude/skills/${dir}/SKILL.md and every reference file it instructs you to load.\n` +
  `Then follow that skill's method and output discipline EXACTLY for the work below.`

const DIMENSIONS = [
  'relevant FILES — names, key exports/symbols, sizes, and why each matters',
  'existing PATTERNS & conventions — naming, error handling, testing, reusable utilities to avoid duplicating',
  'public CONTRACTS & integration points — APIs, schemas, types, env/config keys, breaking-change risk',
  'RISKS — TODO/FIXME/HACK markers, duplicate implementations, tight coupling, overlapping plans in ./plans',
]

phase('Scout')
const results = await parallel(
  DIMENSIONS.slice(0, n).map((dim, i) => () =>
    agent(
      `${useCkSkill('ck:scout', 'scout')}

Scout the codebase for: ${target}

Focus your scout specifically on this dimension: ${dim}

Return file:line citations following ck:scout's output discipline. Be token-efficient.`,
      { label: `scout-${i + 1}`, phase: 'Scout' }
    )
  )
)

const valid = results.filter(Boolean)
log(`${valid.length}/${n} scout dimensions complete`)

phase('Merge')
const report = await agent(
  `Merge these ${valid.length} ck:scout reports into one context map for: ${target}

${valid.map((r, i) => `=== Scout dimension ${i + 1} (${DIMENSIONS[i]}) ===\n${r}`).join('\n\n')}

Produce a structured, deduplicated context map:
## Project Context
## Relevant Files (table: Path | Role | Key Symbols | Size)
## Patterns to Follow
## Contracts to Preserve
## Risks & Watchpoints
## Suggested Entrypoints (top 3 files to start, in order, with reason)`,
  { label: 'merger', phase: 'Merge' }
)

return { target, dimensions: valid.length, report }
```

## Notes

- Default `n=3`: files + patterns + contracts. `n=4` adds the risk dimension (recommended before large refactors).
- Each agent runs the real ck:scout skill; Workflow supplies the dimension split and merges results.
- Requires `ck:scout` installed (`~/.claude/skills/scout`).
- Output `report` is ready to feed `/man:ultraflow plan` or `/man:ultraflow cook`.
