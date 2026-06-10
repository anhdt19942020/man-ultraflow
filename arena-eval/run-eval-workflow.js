export const meta = {
  name: 'arena-eval',
  description: 'Score arena template against 8 ground-truth cases. Returns {score, max, passed_threshold, cases}',
  phases: [
    { title: 'Evaluate', detail: 'Compressed arena simulation on all 11 cases in parallel (single agent per case reads template + applies routing/challenger/Caesar logic)' },
    { title: 'Score', detail: 'Compare structured verdicts against expected-outcomes.json, compute total score (max 22, pass threshold 17)' },
  ],
}

// NOTE: Workflow engine forbids nesting — agents inside a Workflow cannot call workflow() themselves.
// So each case runs a COMPRESSED ARENA SIMULATION: one agent reads references/template-arena.md,
// applies the routing table, challenger lenses, and Caesar rules, and returns a structured verdict.
// This tests whether the template instructions are clear and correct enough to produce right verdicts.
// It is NOT a substitute for running the real multi-agent arena, but it IS cheap and fast enough
// to serve as the metric signal for ck:loop self-improvement rounds.

// args.baseDir: root of the man-ultraflow repo. Override when running from a different install path.
const A = (typeof args === 'string' ? {} : (args || {}))
const BASE = A.baseDir || 'D:/Projects/man-ultraflow'

// ---------------------------------------------------------------------------
// Case definitions — metadata only; agents read the full files from disk.
// ---------------------------------------------------------------------------
const CASES = [
  {
    id: 'case-01',
    file: 'case-01-implement-race-condition.md',
    expected_verdicts: ['REVISE', 'REJECT'],
    must_find: ['race condition', 'toctou', 'concurrent', 'atomic', 'duplicate', 'upsert'],
    false_positive_gate: false,
    model: 'sonnet',
    hint: 'Look hard at concurrent access — the bug is subtle but BLOCKER-severity.',
  },
  {
    id: 'case-02',
    file: 'case-02-implement-clean-code.md',
    expected_verdicts: ['ACCEPT'],
    must_find: [],
    false_positive_gate: true, // pass only if NO BLOCKER/MAJOR upheld
    model: 'sonnet',
    hint: 'This is intentionally clean code. Your job here is NOT to find issues — it is to confirm there are none. False positives are scored as failures.',
  },
  {
    id: 'case-03',
    file: 'case-03-security-sql-injection.md',
    expected_verdicts: ['REJECT'],
    must_find: ['sql injection', 'injection', 'f-string', 'parameteris', 'sanitise', 'unsanitised', 'string format'],
    false_positive_gate: false,
    model: 'sonnet',
    hint: 'Focus on how user input reaches the SQL query string.',
  },
  {
    id: 'case-04',
    file: 'case-04-plan-false-assumption.md',
    expected_verdicts: ['REVISE', 'REJECT'],
    must_find: ['rollback', 'multi/exec', 'promise.all', 'timeout', 'transaction', 'atomic'],
    false_positive_gate: false,
    model: 'opus', // requires knowing Redis MULTI/EXEC semantics and Promise.all API
    hint: 'Check every technical claim in the plan against actual API behaviour.',
  },
  {
    id: 'case-05',
    file: 'case-05-fix-wrong-root-cause.md',
    expected_verdicts: ['REJECT'],
    must_find: ['listener', 'removelistener', 'leak', 'memory leak', 'symptom', 'root cause', 'event emitter'],
    false_positive_gate: false,
    model: 'opus', // requires reasoning about memory leaks vs symptom treatment
    hint: 'Ask: does this fix eliminate the cause, or just delay the crash?',
  },
  {
    id: 'case-06',
    file: 'case-06-research-unsourced-claims.md',
    expected_verdicts: ['REVISE'],
    must_find: ['consistent', 'citation', 'source', '100x', 'wrong', 'incorrect', 'eventually consistent', 'claim'],
    false_positive_gate: false,
    model: 'sonnet',
    hint: 'Flag any factual claim that lacks a citation, AND any claim that is demonstrably wrong.',
  },
  {
    id: 'case-07',
    file: 'case-07-implement-missing-error-handling.md',
    expected_verdicts: ['REVISE'],
    must_find: ['size', 'validation', 'mime', 'type', 'partial failure', 's3', 'orphan', 'error handling', 'unbounded'],
    must_find_min_major: 2, // need at least 2 MAJOR findings upheld
    false_positive_gate: false,
    model: 'sonnet',
    hint: 'Think about what happens when each line throws. Think about what a malicious user could upload.',
  },
  {
    id: 'case-08',
    file: 'case-08-plan-overengineered.md',
    expected_verdicts: ['REVISE'],
    must_find: ['over-engineer', 'yagni', 'simpler', 'scope', 'kafka', 'kubernetes', 'disproportionate', 'contact form'],
    false_positive_gate: false,
    model: 'sonnet',
    hint: 'Compare the complexity of the proposed solution against the stated task. YAGNI.',
  },
  {
    id: 'case-09',
    file: 'case-09-implement-severity-inflation.md',
    expected_verdicts: ['REVISE'],
    must_find: ['timeout', 'hang', 'block', 'indefinitely'],
    false_positive_gate: false,
    model: 'sonnet',
    hint: 'A concern exists (missing timeout) but it is theoretical — no test failure, no trace showing actual hang. Correct severity is MAJOR (real, fixable with one parameter) not BLOCKER (which requires demonstrated breakage). If a challenger labels it BLOCKER, Caesar may REJECT; the correct verdict is REVISE.',
  },
  {
    id: 'case-10',
    file: 'case-10-implement-benchmark-override.md',
    expected_verdicts: ['REVISE'],
    must_find: ['test', 'fail', 'failing', 'benchmark'],
    false_positive_gate: false,
    model: 'sonnet',
    hint: 'The case file contains a "## Simulated benchmark output" section — treat those numbers as if the Benchmarker role produced them from actually running the test suite. Caesar MUST apply step 0: if TESTS_FAILED > 0, the verdict cannot be ACCEPT, regardless of what challengers say. Even if all challengers say SOUND, Caesar must choose REVISE and cite the failing tests.',
  },
  {
    id: 'case-11',
    file: 'case-11-fix-angle-separation.md',
    expected_verdicts: ['REJECT'],
    must_find: [],
    must_find_groups: [
      ['root cause', 'symptom', 'sliding', 'renew', 'session renewal', 'expir'],
      ['regression', 'broad', 'except exception', 'databaseerror', 'operationalerror', 'mask', 'swallow'],
    ],
    false_positive_gate: false,
    model: 'sonnet',
    hint: 'Fix-intent uses two challengers: debug (verify whether the fix actually addresses the root cause) and code-review (check for regressions the fix introduces). The fix silences an exception but does not address why sessions expire — wrong root cause. Additionally, except Exception is dangerously broad and catches DB errors, allowing unauthenticated access during outages.',
  },
]

// ---------------------------------------------------------------------------
// Structured verdict schema (mirrors the arena's Caesar output format)
// ---------------------------------------------------------------------------
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ACCEPT', 'REVISE', 'REJECT'] },
    upheld: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['BLOCKER', 'MAJOR', 'MINOR'] },
          source: { type: 'string', description: 'challenger role that raised this (e.g. code-review, security, debug)' },
          summary: { type: 'string', description: 'one sentence, concrete evidence required (file:line or specific claim)' },
        },
        required: ['severity', 'source', 'summary'],
      },
    },
    required_actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          priority: { type: 'number' },
          action: { type: 'string' },
          where: { type: 'string' },
        },
        required: ['priority', 'action', 'where'],
      },
    },
    bottom_line: { type: 'string' },
  },
  required: ['verdict', 'upheld', 'bottom_line'],
}

// ---------------------------------------------------------------------------
// Phase 1: Run all 8 cases in parallel
// ---------------------------------------------------------------------------
phase('Evaluate')

const evaluations = await parallel(CASES.map(c => async () => {
  const verdict = await agent(
    `You are a COMPRESSED ARENA EVALUATOR running case ${c.id} of the arena eval harness.

## Step 1 — Load the arena template
Read: ${BASE}/references/template-arena.md

Pay attention to:
- The ROUTING TABLE (Lanista rules): which producer and contesters map to each intent
- The CHALLENGER prompt structure: what each challenger role attacks and how to rate findings
- CAESAR's judgment rules: how to weigh findings, when benchmark failures override optimistic opinions
- The CONTEST TARGETS for each intent row

## Step 2 — Read the eval case
Read: ${BASE}/arena-eval/cases/${c.file}

This file contains:
- **Arena prompt**: the exact task/question
- **Artifact**: the code, plan, or research to review
- **Must-find** and **Pass criteria** (for your reference — do NOT let these bias you; they exist for scoring, not for hints)

## Step 3 — Simulate the arena
Using ONLY the artifact and the template's instructions:

1. **Route** — determine the intent row from the routing table. Which producer ck: skill and which challenger ck: skills would be assigned?
2. **Challenge** — apply EACH relevant challenger lens adversarially to the artifact. For each challenger:
   - Commit to its assigned angle (e.g. code-review = logic/contracts, security = exploitable holes, test = coverage gaps)
   - Find concrete issues with evidence (specific line, claim, or scenario)
   - Rate each: BLOCKER / MAJOR / MINOR
   - If you genuinely find nothing in a challenger's area, say so — do not invent issues
3. **Judge (Caesar)** — weigh all challenger findings:
   - Uphold objections backed by concrete evidence
   - Dismiss vague objections
   - Apply Caesar's rule: ACCEPT if no upheld BLOCKER/MAJOR; REVISE if fixable BLOCKERs/MAJORs; REJECT if approach is fundamentally wrong

Hint for this case: ${c.hint}

Return the structured verdict via the schema tool.`,
    { label: c.id, phase: 'Evaluate', schema: VERDICT_SCHEMA, model: c.model }
  )
  return { case: c, verdict }
}))

// ---------------------------------------------------------------------------
// Phase 2: Score each verdict
// ---------------------------------------------------------------------------
phase('Score')

const scored = evaluations.filter(Boolean).map(({ case: c, verdict: v }) => {
  if (!v) return { id: c.id, verdict_score: 0, find_score: 0, total: 0, error: 'agent returned null' }

  // --- Scoring rule 1: verdict match (+1) ---
  const verdict_score = c.expected_verdicts.includes(v.verdict) ? 1 : 0

  // --- Scoring rule 2: must-find or false-positive gate (+1) ---
  let find_score = 0
  const upheld = v.upheld || []

  if (c.false_positive_gate) {
    // Case 02: pass only if no BLOCKER/MAJOR upheld (arena must not invent issues)
    const hasFalsePositive = upheld.some(u => u.severity === 'BLOCKER' || u.severity === 'MAJOR')
    find_score = hasFalsePositive ? 0 : 1
  } else if (c.must_find.length > 0) {
    const allSummaries = upheld.map(u => u.summary.toLowerCase()).join(' ')
    const keywordHit = c.must_find.some(kw => allSummaries.includes(kw.toLowerCase()))

    if (c.must_find_min_major) {
      // Case 07: keyword hit AND at least N MAJOR/BLOCKER findings upheld
      const majorCount = upheld.filter(u => u.severity === 'BLOCKER' || u.severity === 'MAJOR').length
      find_score = (keywordHit && majorCount >= c.must_find_min_major) ? 1 : 0
    } else {
      find_score = keywordHit ? 1 : 0
    }
  } else if (c.must_find_groups) {
    // Case 11: all groups must have at least one keyword match (angle separation check)
    const allSummaries = upheld.map(u => u.summary.toLowerCase()).join(' ')
    const allGroupsMatch = c.must_find_groups.every(group =>
      group.some(kw => allSummaries.includes(kw.toLowerCase()))
    )
    find_score = allGroupsMatch ? 1 : 0
  } else {
    find_score = 1 // no must-find requirement
  }

  return {
    id: c.id,
    expected: c.expected_verdicts,
    got: v.verdict,
    verdict_score,
    find_score,
    total: verdict_score + find_score,
    upheld_count: upheld.length,
    upheld_blockers: upheld.filter(u => u.severity === 'BLOCKER').length,
    bottom_line: v.bottom_line,
  }
})

const total_score = scored.reduce((sum, s) => sum + (s.total || 0), 0)
const max_score = CASES.length * 2  // 22
const passed = scored.filter(s => s.total === 2)
const failed = scored.filter(s => s.total < 2)
const pass_threshold = 17

log(`\n━━━ Arena Eval Results ━━━`)
log(`Score: ${total_score}/${max_score} (threshold: ${pass_threshold}) — ${total_score >= pass_threshold ? '✅ PASS' : '❌ FAIL'}`)
log(`Passed: ${passed.map(s => s.id).join(', ') || 'none'}`)
if (failed.length > 0) {
  log(`Failed:`)
  failed.forEach(f => {
    const reason = []
    if (f.verdict_score === 0) reason.push(`verdict=${f.got} (want ${f.expected?.join('|')})`)
    if (f.find_score === 0) reason.push(`must-find not in upheld`)
    log(`  ${f.id}: ${reason.join(', ')}`)
  })
}

return {
  score: total_score,
  max: max_score,
  passed_threshold: total_score >= pass_threshold,
  threshold: pass_threshold,
  cases: scored,
}
