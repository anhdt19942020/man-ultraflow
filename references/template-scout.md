# Ultraflow — Scout Template

Workflow script for parallel codebase scouting. N agents search different parts of the codebase simultaneously → merge into a comprehensive context map.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `target` | string | required | What to scout for (task, feature, module, or keyword) |
| `n` | number | 3 | Number of parallel scout agents |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-scout',
  description: 'Parallel codebase scouting across N search dimensions, merged into a single context map',
  phases: [
    { title: 'Scout', detail: 'N agents search different codebase dimensions in parallel' },
    { title: 'Merge', detail: 'Synthesize findings into a comprehensive context map' },
  ],
}

const target = (args && args.target) || 'the given target'
const n = (args && args.n) || 3

const SCOUT_DIMENSIONS = [
  {
    name: 'files',
    prompt: `Find all files directly relevant to: ${target}

Search for:
1. Files whose names suggest they handle this functionality
2. Files that import/export key symbols related to this
3. Config files, schemas, migrations, types relevant to this
4. Test files covering this area

Return for each file:
- Absolute path
- Why it's relevant (1 sentence)
- Key exports/symbols/functions it contains
- Line count estimate (small <100, medium 100-300, large >300)`
  },
  {
    name: 'patterns',
    prompt: `Find existing patterns and conventions relevant to: ${target}

Search for:
1. How similar features are currently implemented (find 2-3 examples)
2. Naming conventions for variables, functions, files in this area
3. Error handling patterns used nearby
4. Testing patterns for similar code
5. Any utility/helper functions that should be reused (not duplicated)

Return concrete examples with file:line references.`
  },
  {
    name: 'contracts',
    prompt: `Find public contracts and integration points relevant to: ${target}

Search for:
1. API endpoints, route handlers, or RPC methods that might be affected
2. Database schemas, migrations, or query patterns in this area
3. Environment variables, config keys, or feature flags involved
4. TypeScript interfaces/types that define data shapes
5. External service calls or third-party integrations nearby

For each: file:line, what it does, and whether it must stay stable (breaking change risk).`
  },
  {
    name: 'risks',
    prompt: `Find potential risks and conflicts relevant to: ${target}

Search for:
1. TODO/FIXME/HACK comments in this area of the codebase
2. Duplicate implementations of similar functionality (DRY violations)
3. Circular dependencies or tight coupling near this area
4. Dead code or deprecated patterns that might mislead
5. Existing plans in ./plans/ that overlap with or conflict with this work

Return file:line references and 1-sentence description of each risk.`
  },
]

const selectedDimensions = SCOUT_DIMENSIONS.slice(0, n)

phase('Scout')

const scoutResults = await parallel(
  selectedDimensions.map(dim => () =>
    agent(dim.prompt, { label: `scout-${dim.name}`, phase: 'Scout' })
  )
)

const validResults = scoutResults.filter(Boolean)
log(`${validResults.length}/${n} scout dimensions complete`)

phase('Merge')

const mergedReport = await agent(
  `Merge these ${validResults.length} scout reports into a single comprehensive context map for: ${target}

${validResults.map((r, i) => `=== Scout: ${selectedDimensions[i] && selectedDimensions[i].name} ===\n${r}`).join('\n\n')}

Produce a structured context map:

## Project Context
- Type, language, framework, key dependencies

## Relevant Files
Table: | Path | Role | Key Symbols | Size |
(deduplicated, sorted by relevance)

## Patterns to Follow
- Naming conventions
- Error handling pattern
- Testing approach
- Reusable utilities to use (not duplicate)

## Contracts to Preserve
- APIs, schemas, types that must stay stable
- Environment variables / config keys involved

## Risks & Watchpoints
- TODOs/HACs nearby
- Potential conflicts or duplications
- Overlapping plans

## Suggested Implementation Entrypoints
Top 3 files to start reading/modifying, in order, with reason.`,
  { label: 'merger', phase: 'Merge' }
)

return {
  target,
  scoutResults: validResults,
  report: mergedReport,
}
```

## Notes

- Default `n=3` covers files + patterns + contracts — the core scout triad
- `n=4` adds risk dimension — recommended before large refactors
- The merge phase deduplicates and structures the parallel findings
- Output `report` is formatted for direct use as context in `/man:ultraflow plan` or `/man:ultraflow cook`
- Ask user if they want to proceed to `/man:ultraflow plan <target>` using this scout report
