# Ultraflow — Plan Template

Workflow script for parallel planning. Scouts codebase → parallel researchers investigate different aspects → planner synthesizes into a comprehensive plan document.

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `task` | string | required | Feature/task description to plan |
| `n` | number | 2 | Number of parallel researchers |
| `mode` | string | `"fast"` | Planning depth: `"fast"` (scout→plan), `"hard"` (research+plan), `"deep"` (research+plan+redteam) |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-plan',
  description: 'Create implementation plan with parallel research, then synthesize into phase-based plan document',
  phases: [
    { title: 'Scout', detail: 'Scan codebase for context, patterns, and conventions' },
    { title: 'Research', detail: 'N parallel researchers investigate different aspects' },
    { title: 'Plan', detail: 'Synthesize research into comprehensive phased plan' },
  ],
}

const task = (args && args.task) || 'the given task'
const n = (args && args.n) || 2
const mode = (args && args.mode) || 'fast'

phase('Scout')
const scoutReport = await agent(
  `Scout the codebase to gather context for planning: ${task}

Return:
1. Project type, language, framework, key dependencies
2. Files and modules most relevant to this task (with paths)
3. Existing patterns, conventions, and code standards to follow
4. Public contracts that must stay stable (APIs, schemas, types, env vars)
5. Existing plans in ./plans/ that overlap with this task
6. Potential risks and constraints`,
  { label: 'scout', phase: 'Scout' }
)

phase('Research')

const researchTopics = [
  `Technical implementation approach for: ${task}\n\nFocus on: architecture patterns, library choices, data flow, component design.\nScout context:\n${scoutReport}`,
  `Edge cases, risks, and acceptance criteria for: ${task}\n\nFocus on: error scenarios, security concerns, performance requirements, validation rules, definition of done.\nScout context:\n${scoutReport}`,
]

if (n > 2) {
  researchTopics.push(
    `Integration points and migration strategy for: ${task}\n\nFocus on: existing code touchpoints, breaking changes, backward compatibility, rollout strategy.\nScout context:\n${scoutReport}`
  )
}

const extraTopics = Array.from({ length: Math.max(0, n - 3) }, (_, i) =>
  `Deep-dive research angle ${i + 4} for: ${task}\n\nInvestigate: testing strategy, performance benchmarks, developer experience, monitoring/observability.\nScout context:\n${scoutReport}`
)

const allTopics = [...researchTopics.slice(0, n), ...extraTopics]

const researchResults = mode === 'fast'
  ? []
  : await parallel(
      allTopics.map((topic, i) => () =>
        agent(topic, { label: `researcher-${i + 1}`, phase: 'Research' })
      )
    )

log('Research complete, synthesizing plan')

phase('Plan')

const plannerPrompt = `Create a comprehensive, phased implementation plan for: ${task}

Scout report:
${scoutReport}

${researchResults.length > 0 ? `Research findings:\n${researchResults.filter(Boolean).map((r, i) => `=== Researcher ${i + 1} ===\n${r}`).join('\n\n')}` : '(fast mode — no research phase)'}

## Output Requirements

Write a complete plan following this structure:

### plan.md
- Title, status, priority
- Phases table with ID, title, status, dependencies
- Key decisions and constraints
- Success criteria

### For each phase (phase-01-xxx.md through phase-NN-xxx.md):
Use this structure:
\`\`\`
---
phase: N
title: "Phase Name"
status: pending
priority: P2
effort: "Xh"
dependencies: []
---

# Phase N: Name

## Overview
1-2 sentences.

## Requirements
- Functional: ...
- Non-functional: ...

## Architecture
Design, data flow, component interactions.

## Related Code Files
- Create: path/...
- Modify: path/...

## Implementation Steps
1. ...

## Success Criteria
- [ ] ...

## Risk Assessment
Risks + mitigations.
\`\`\`

Rules:
- Minimum 2, maximum 6 phases
- Each phase must be independently testable
- Implementation steps must be specific enough for a junior developer
- Follow codebase conventions from scout report
- Respect YAGNI, KISS, DRY principles
- Do NOT write code — write plans only`

const plan = await agent(plannerPrompt, { label: 'planner', phase: 'Plan' })

${mode === 'deep' ? `
phase('Red Team')
const redTeam = await agent(
  \`Adversarially review this implementation plan for: ${task}

Plan:
\${plan}

Find:
1. Unexamined assumptions that could invalidate the approach
2. Missing edge cases or error scenarios
3. Security vulnerabilities or data integrity risks
4. Over-engineering (YAGNI violations) or under-engineering
5. Dependencies that could block or delay phases
6. Acceptance criteria that are vague or untestable

For each issue: severity (critical/major/minor), description, suggested fix.\`,
  { label: 'red-team', phase: 'Red Team' }
)

return { task, mode, plan, redTeam }
` : `return { task, mode, plan }`}
```

## Notes

- `mode: "fast"` skips research phase — goes directly scout→plan; fastest, best for simple tasks
- `mode: "hard"` runs N parallel researchers before planning; better for complex features
- `mode: "deep"` adds adversarial red-team review after planning; best for high-risk changes
- After workflow completes, save `plan` output to `./plans/<timestamp>-<slug>/plan.md` and phase files
- Default `n=2` researchers; more adds coverage but diminishing returns past 3
