# Ultraflow — Review Template

Workflow script for parallel code review. 3 agents cover different dimensions concurrently (security / performance / test coverage), then synthesize deduplicated findings sorted by severity.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `scope` | string | required | What to review: file path, PR description, feature name |
| `n` | number | 3 | Number of review dimensions (max 5) |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-review',
  description: 'Review code across N parallel dimensions, synthesize severity-rated findings',
  phases: [
    { title: 'Review', detail: 'Parallel reviewers: security, performance, test coverage' },
    { title: 'Synthesize', detail: 'Deduplicate and rank findings by severity' },
  ],
}

const n = Math.min((args && args.n) || 3, 5)
const scope = (args && args.scope) || 'the current codebase changes'

const ALL_DIMENSIONS = [
  {
    key: 'security',
    focus: 'security vulnerabilities, auth/authorization gaps, input validation, OWASP Top 10, injection risks, data exposure, insecure defaults',
  },
  {
    key: 'performance',
    focus: 'bottlenecks, N+1 queries, memory leaks, unnecessary re-renders, algorithmic complexity, missing indexes, caching opportunities',
  },
  {
    key: 'coverage',
    focus: 'test coverage gaps, untested edge cases, missing error path tests, missing assertions, tests that do not actually verify behavior',
  },
  {
    key: 'architecture',
    focus: 'coupling, cohesion, violated boundaries, abstraction leaks, circular dependencies, scalability constraints, design pattern misuse',
  },
  {
    key: 'reliability',
    focus: 'error handling gaps, missing retries, race conditions, resource leaks, silent failures, missing timeouts, unhandled promise rejections',
  },
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
    `You are a specialist code reviewer focused exclusively on: ${dim.focus}

Review scope: ${scope}

Rules:
- Output ONLY concrete findings with evidence. No "this looks good", no summaries.
- Every finding MUST include a specific file:line or code snippet as evidence.
- Do NOT speculate. If you cannot find evidence, omit the finding.
- Be adversarial — assume bugs exist until proven otherwise.

Severity guide:
- CRITICAL: exploitable vulnerability, data loss risk, or production outage risk
- IMPORTANT: significant bug, security weakness, or performance problem likely to manifest
- MODERATE: code quality issue, minor bug, or missed improvement

If no findings in your dimension, return an empty findings array.`,
    { label: `reviewer-${dim.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }
  )
))

const valid = reviews.filter(Boolean)
log(`${valid.length}/${n} reviewers completed`)

const allFindings = valid.flatMap(r =>
  (r.findings || []).map(f => ({ ...f, dimension: r.dimension }))
)

const byKey = f => `${f.title}::${f.evidence}`.toLowerCase().slice(0, 80)
const seen = new Set()
const deduped = allFindings.filter(f => {
  const k = byKey(f)
  if (seen.has(k)) return false
  seen.add(k)
  return true
})

const critical = deduped.filter(f => f.severity === 'CRITICAL')
const important = deduped.filter(f => f.severity === 'IMPORTANT')
const moderate = deduped.filter(f => f.severity === 'MODERATE')

log(`Found: ${critical.length} critical, ${important.length} important, ${moderate.length} moderate`)

phase('Synthesize')
const synthesis = await agent(
  `Produce a clean code review report for: ${scope}

CRITICAL FINDINGS (${critical.length}):
${critical.length ? critical.map(f => `[${f.dimension}] ${f.title}\n  Evidence: ${f.evidence}\n  Fix: ${f.recommendation}`).join('\n\n') : 'None'}

IMPORTANT FINDINGS (${important.length}):
${important.length ? important.map(f => `[${f.dimension}] ${f.title}\n  Evidence: ${f.evidence}\n  Fix: ${f.recommendation}`).join('\n\n') : 'None'}

MODERATE FINDINGS (${moderate.length}):
${moderate.length ? moderate.map(f => `[${f.dimension}] ${f.title}\n  Evidence: ${f.evidence}\n  Fix: ${f.recommendation}`).join('\n\n') : 'None'}

Write a concise action-item report:
1. One-line summary of overall quality
2. Numbered action items sorted by severity (CRITICAL first)
3. Each item: severity tag, what to fix, where, how`,
  { label: 'synthesizer', phase: 'Synthesize' }
)

return {
  total: deduped.length,
  critical: critical.length,
  important: important.length,
  moderate: moderate.length,
  report: synthesis,
}
```

## Notes

- Default 3 dimensions: security → performance → coverage (highest ROI for most PRs)
- Pass `args.n = 5` for full audit: adds architecture + reliability dimensions
- Dedup runs in the script (no extra agent needed) — exact title+evidence match
- `FINDINGS_SCHEMA` forces structured output — no parsing, validated at tool layer
