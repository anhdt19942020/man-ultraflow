# Ultraflow — Plan Template

Workflow script for parallel planning. N researchers (each following the original **research** skill) investigate distinct angles → one planner agent following the original **ck:plan** skill synthesizes the phased plan from their reports.

The logic is the ck: skill verbatim; the Workflow layer only parallelizes the research phase and feeds reports into ck:plan (which explicitly skips its own research when "provided with researcher reports").

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `task` | string | required | Feature/task description to plan |
| `n` | number | 2 | Number of parallel researchers |
| `mode` | string | `"fast"` | `"fast"` (skip research → ck:plan --fast), `"hard"` (research + ck:plan), `"deep"` (research + ck:plan + red-team) |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-plan',
  description: 'Parallel research feeding the original ck:plan skill to produce a phased plan',
  phases: [
    { title: 'Research', detail: 'N parallel researchers, each following the research skill' },
    { title: 'Plan', detail: 'One planner following ck:plan verbatim, fed the researcher reports' },
  ],
}

const task = (args && args.task) || 'the given task'
const n = (args && args.n) || 2
const mode = (args && args.mode) || 'fast'

// Delegation contract — every agent loads and follows the ORIGINAL ck: skill.
const useCkSkill = (name, dir) =>
  `Use the ORIGINAL ${name} skill as the single source of truth — do NOT invent a different process.\n` +
  `Load it first: call the Skill tool with skill "${name}". If the Skill tool is unavailable to you, Read ~/.claude/skills/${dir}/SKILL.md and every reference file it instructs you to load.\n` +
  `Then follow that skill's steps, gates, and output format EXACTLY for the work below.`

const RESEARCH_ANGLES = [
  `Architecture, patterns, and proven approaches for: ${task}`,
  `Risks, edge cases, failure modes, security, and acceptance criteria for: ${task}`,
  `Integration points, existing-code touchpoints, and migration strategy for: ${task}`,
  `Tooling, libraries, performance, and operational concerns for: ${task}`,
]

phase('Research')
const reports = mode === 'fast'
  ? []
  : await parallel(
      RESEARCH_ANGLES.slice(0, n).map((angle, i) => () =>
        agent(
          `${useCkSkill('ck:research', 'research')}\n\nYour assigned research angle: ${angle}\n\nReturn a structured, evidence-based report (executive summary, key findings, recommendations, open questions).`,
          { label: `researcher-${i + 1}`, phase: 'Research' }
        )
      )
    )

const validReports = reports.filter(Boolean)
log(mode === 'fast' ? 'Fast mode — skipping research' : `${validReports.length}/${n} researchers completed`)

phase('Plan')
const planFlag = mode === 'fast' ? '--fast' : mode === 'deep' ? '--deep' : '--hard'
const plan = await agent(
  `${useCkSkill('ck:plan', 'ck-plan')}

Run ck:plan in ${planFlag} mode for this task: ${task}

${validReports.length > 0
  ? `You are PROVIDED with the following researcher reports — per ck:plan's own rules, skip the internal research phase and use these directly:\n\n${validReports.map((r, i) => `=== Researcher ${i + 1} (${RESEARCH_ANGLES[i]}) ===\n${r}`).join('\n\n')}`
  : '(fast mode — no researcher reports; follow ck:plan --fast)'}

Produce the plan.md + phase-*.md exactly as ck:plan specifies (frontmatter, phases table, per-phase structure). Do NOT implement code.`,
  { label: 'planner', phase: 'Plan' }
)

return { task, mode, researchers: validReports.length, plan }
```

## Notes

- `mode: "fast"` → no research; the planner runs `ck:plan --fast` (scout→plan).
- `mode: "hard"` → N parallel researchers (research skill) feed `ck:plan --hard`.
- `mode: "deep"` → same as hard but the planner runs `ck:plan --deep` (adds red-team + validation per the ck:plan workflow).
- Requires the `ck:plan` and `research` skills to be installed (`~/.claude/skills/ck-plan`, `~/.claude/skills/research`).
- The plan content + structure are ck:plan's; Workflow only parallelizes research.
