# Ultraflow — Review Template

Workflow script for parallel code review. N agents each run the original **ck:code-review** skill focused on a distinct dimension (security / performance / coverage / architecture / reliability) → the script deduplicates findings → one synthesizer produces a severity-ranked action report.

Review rigor, red-team analysis, and evidence discipline are ck:code-review's; Workflow fans it across dimensions and merges.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `scope` | string | required | What to review: file path, PR description, feature name |
| `n` | number | 3 | Number of review dimensions (max 5) |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-review',
  description: 'N parallel ck:code-review dimensions, deduped and severity-ranked',
  phases: [
    { title: 'Review', detail: 'N agents each run ck:code-review on a distinct dimension' },
    { title: 'Synthesize', detail: 'Deduplicate and rank findings by severity' },
  ],
}

// args may arrive as an object OR a JSON string (harness-dependent) — normalize both.
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
const n = Math.max(1, Math.min(A.n || 3, 5))
const scope = A.scope || 'the current codebase changes'

// Abort early on an empty scope instead of running reviewers on a placeholder.
if (!A.scope) {
  log('No scope provided (args carried no scope) — aborting.')
  return { error: 'empty-input', hint: 'Re-run: /man:ultraflow --review "<file path or PR description>"' }
}

const useCkSkill = (name, dir) =>
  `Use the ORIGINAL ${name} skill as the single source of truth — do NOT invent a different process.\n` +
  `Load it first: call the Skill tool with skill "${name}". If the Skill tool is unavailable to you, Read ~/.claude/skills/${dir}/SKILL.md and every reference file it instructs you to load.\n` +
  `Then follow that skill's method, severity rubric, and evidence discipline EXACTLY for the work below.`

const ALL_DIMENSIONS = [
  { key: 'security', focus: 'security vulnerabilities, auth/authorization gaps, input validation, OWASP Top 10, injection, data exposure, insecure defaults' },
  { key: 'performance', focus: 'bottlenecks, N+1 queries, memory leaks, unnecessary re-renders, algorithmic complexity, missing indexes, caching' },
  { key: 'coverage', focus: 'test coverage gaps, untested edge cases, missing error-path tests, missing assertions, tests that do not verify behavior' },
  { key: 'architecture', focus: 'coupling, cohesion, violated boundaries, abstraction leaks, circular dependencies, scalability constraints, pattern misuse' },
  { key: 'reliability', focus: 'error handling gaps, missing retries, race conditions, resource leaks, silent failures, missing timeouts, unhandled rejections' },
]

const DIMENSIONS = ALL_DIMENSIONS.slice(0, n)

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    dimension: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['CRITICAL', 'IMPORTANT', 'MODERATE'] },
          title: { type: 'string' },
          evidence: { type: 'string' },
          recommendation: { type: 'string' },
        },
        required: ['severity', 'title', 'evidence', 'recommendation'],
      },
    },
  },
  required: ['dimension', 'findings'],
}

phase('Review')
const reviews = await parallel(DIMENSIONS.map(dim => () =>
  agent(
    `${useCkSkill('ck:code-review', 'ck-code-review')}

Run ck:code-review on: ${scope}
Focus your review EXCLUSIVELY on this dimension: ${dim.focus}

Apply ck:code-review's rules: every finding needs specific file:line / snippet evidence; no "looks good"; no speculation; be adversarial. Use the CRITICAL / IMPORTANT / MODERATE severity rubric. Return your findings for the "${dim.key}" dimension (empty array if none).`,
    { label: `reviewer-${dim.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }
  )
))

const valid = reviews.filter(Boolean)
log(`${valid.length}/${n} reviewers completed`)

// Abort before synthesis if every reviewer failed (nothing to deduplicate or rank).
if (valid.length === 0) {
  log('All reviewer agents failed — aborting before synthesis')
  return { total: 0, critical: 0, important: 0, moderate: 0, error: 'all reviewers failed' }
}

const allFindings = valid.flatMap(r => (r.findings || []).map(f => ({ ...f, dimension: r.dimension })))
const byKey = f => `${f.title}::${f.evidence}`.toLowerCase().slice(0, 80)
const seen = new Set()
const deduped = allFindings.filter(f => { const k = byKey(f); if (seen.has(k)) return false; seen.add(k); return true })

const critical = deduped.filter(f => f.severity === 'CRITICAL')
const important = deduped.filter(f => f.severity === 'IMPORTANT')
const moderate = deduped.filter(f => f.severity === 'MODERATE')
log(`Found: ${critical.length} critical, ${important.length} important, ${moderate.length} moderate`)

phase('Synthesize')
const synthesis = await agent(
  `Produce a clean code-review action report for: ${scope}

CRITICAL (${critical.length}):
${critical.length ? critical.map(f => `[${f.dimension}] ${f.title}\n  Evidence: ${f.evidence}\n  Fix: ${f.recommendation}`).join('\n\n') : 'None'}

IMPORTANT (${important.length}):
${important.length ? important.map(f => `[${f.dimension}] ${f.title}\n  Evidence: ${f.evidence}\n  Fix: ${f.recommendation}`).join('\n\n') : 'None'}

MODERATE (${moderate.length}):
${moderate.length ? moderate.map(f => `[${f.dimension}] ${f.title}\n  Evidence: ${f.evidence}\n  Fix: ${f.recommendation}`).join('\n\n') : 'None'}

Write: 1) one-line overall quality summary, 2) numbered action items sorted by severity (CRITICAL first), each with severity tag + what/where/how to fix.`,
  { label: 'synthesizer', phase: 'Synthesize' }
)

// Guard: synthesizer returned nothing — fall back to the structured findings instead of a null report.
if (!synthesis) {
  log('Synthesizer agent returned nothing — returning structured findings without prose report')
  return { total: deduped.length, critical: critical.length, important: important.length, moderate: moderate.length, report: deduped.map(f => `[${f.severity}][${f.dimension}] ${f.title} — ${f.recommendation}`).join('\n'), error: 'synthesizer failed' }
}

return { total: deduped.length, critical: critical.length, important: important.length, moderate: moderate.length, report: synthesis }
```

## Notes

- Each reviewer runs the real ck:code-review skill; Workflow supplies the dimension split and dedup/synthesis.
- Default 3 dimensions: security → performance → coverage. `n=5` adds architecture + reliability (full audit).
- `FINDINGS_SCHEMA` forces structured output — validated at the tool layer, no parsing.
- Requires `ck:code-review` installed (`~/.claude/skills/ck-code-review`).
