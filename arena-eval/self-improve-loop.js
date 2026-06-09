export const meta = {
  name: 'arena-self-improve',
  description: 'Iterative self-improvement loop: propose change to template-arena.md → eval 8 cases → keep if score ≥ best, revert otherwise. Returns {baseline_score, final_score, kept, history}',
  phases: [
    { title: 'Init', detail: 'Read baseline template + eval script; run baseline eval to confirm starting score' },
    { title: 'Improve', detail: 'N rounds: propose ONE change → apply → eval → keep (score ≥ best) / revert' },
    { title: 'Report', detail: 'Summary: kept improvements, score delta, commit recommendation' },
  ],
}

// ── Args ──────────────────────────────────────────────────────────────────────
const A = typeof args === 'string' ? {} : (args || {})
const BASE          = A.baseDir         || 'D:/Projects/man-ultraflow'
const MAX_ROUNDS    = A.rounds          || 3   // default 3; each round ≈ 350K tokens
const FOCUS         = A.focus           || null // 'routing'|'challenger'|'caesar'|'efficiency'|null
const SKIP_BASELINE = A.skip_baseline   || false
const KNOWN_SCORE   = A.known_score     || 16  // used when skip_baseline=true

const TEMPLATE = `${BASE}/references/template-arena.md`
const EVAL_JS   = `${BASE}/arena-eval/run-eval-workflow.js`

// ── Proposal schema ───────────────────────────────────────────────────────────
const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    target_section: {
      type: 'string',
      enum: ['routing_table', 'lanista_prompt', 'challenger_prompt', 'caesar_prompt', 'contest_angles_instruction', 'other'],
      description: 'Which section of the template this change targets',
    },
    rationale: { type: 'string', description: 'Concrete reason: which eval case failure or quality gap this addresses' },
    old_text: { type: 'string', description: 'EXACT verbatim substring from the current template — used for literal find-replace; must match character-for-character' },
    new_text: { type: 'string', description: 'Replacement text — must differ from old_text' },
    expected_impact: { type: 'string', description: 'Which eval cases should improve and why' },
  },
  required: ['target_section', 'rationale', 'old_text', 'new_text', 'expected_impact'],
}

// ── Phase: Init ───────────────────────────────────────────────────────────────
phase('Init')

const [init_content, eval_script] = await parallel([
  () => agent(
    `Read the file at ${TEMPLATE} and return its COMPLETE content verbatim. Return ONLY the raw file content — no commentary, no markdown code fences, no truncation.`,
    { label: 'read-template', model: 'haiku' }
  ),
  () => agent(
    `Read the file at ${EVAL_JS} and return its COMPLETE content verbatim. Return ONLY the raw file content — no commentary, no markdown code fences, no truncation.`,
    { label: 'read-eval-script', model: 'haiku' }
  ),
])

if (!init_content || !eval_script) {
  log('Init failed: could not read baseline files. Check BASE path.')
  return { error: 'init-failed', base: BASE }
}

// Safety: refuse to run if template is shorter than expected (truncation guard)
if (init_content.length < 5000) {
  log(`Template suspiciously short (${init_content.length} chars) — aborting to avoid corrupting it.`)
  return { error: 'template-too-short', length: init_content.length }
}

let baseline_score
if (SKIP_BASELINE) {
  baseline_score = KNOWN_SCORE
  log(`Skipping baseline eval (known score: ${baseline_score}/16)`)
} else {
  log('Running baseline eval...')
  const baseline_result = await workflow({ script: eval_script }, { baseDir: BASE })
  baseline_score = baseline_result?.score ?? 0
  log(`Baseline: ${baseline_score}/${baseline_result?.max ?? 16}`)
}

let current_best_content = init_content
let current_best_score   = baseline_score
const history = []

// ── Phase: Improve ────────────────────────────────────────────────────────────
phase('Improve')

for (let round = 1; round <= MAX_ROUNDS; round++) {
  log(`\n─── Round ${round}/${MAX_ROUNDS}  (best: ${current_best_score}/16) ───`)

  // ── 1. Propose ──
  const past_summary = history.length > 0
    ? history.map(h => `  R${h.round} [${h.outcome}] ${h.target_section}: ${h.rationale}`).join('\n')
    : '  (none yet)'

  const proposal = await agent(
    `You are proposing ONE targeted improvement to the Ultraflow Arena template.

Read the CURRENT template: ${TEMPLATE}

## Context
- Current best eval score: ${current_best_score}/16  (a change is KEPT if new score ≥ ${current_best_score})
${FOCUS ? `- Requested focus area: ${FOCUS}` : '- Focus area: your choice (pick the highest-leverage gap)'}
- Past proposals this session (do NOT repeat the same section/idea):
${past_summary}

## What you MAY change
- ROUTING_TABLE rows (intent matching, N values, contest target wording)
- Lanista system prompt (routing reasoning, contest_angles assignment guidance, model-tier logic)
- Challenger prompt wording (attack instructions, evidence requirements, rating criteria)
- Caesar judgment criteria (how to weigh BLOCKER vs MAJOR, when to REJECT vs REVISE, benchmark override wording)
- contest_angles instruction wording
- Token efficiency: shorten without losing meaning (saves ~1-5% per run)

## NEVER change
- The safety rule line containing "ASK before any mutate" and "never auto-ACCEPT"
- Any workflow JS primitives (phase, parallel, pipeline, agent, log, workflow, return)
- The ROUTE_SCHEMA object structure
- The benchmarker role or "test failures override critic verdicts" concept

## Rules for your proposal
1. ONE change only — smaller scope = cleaner signal
2. old_text must be a VERBATIM substring of the current file (copy-paste exactly; the apply step does literal find-replace)
3. old_text must be at least 20 characters (avoids accidental broad matches)
4. If score is already 16/16: improve clarity, reduce redundancy, or sharpen a challenger angle
5. Explain which eval case(s) your change addresses`,
    { label: `propose-r${round}`, schema: PROPOSAL_SCHEMA, model: 'sonnet' }
  )

  if (!proposal) {
    log(`Round ${round}: proposer returned null — skip`)
    history.push({ round, outcome: 'propose-failed' })
    continue
  }

  if (!proposal.old_text || proposal.old_text.length < 20 || proposal.old_text === proposal.new_text) {
    log(`Round ${round}: invalid proposal (old_text too short or unchanged) — skip`)
    history.push({ round, target_section: proposal.target_section, rationale: proposal.rationale, outcome: 'invalid-proposal' })
    continue
  }

  log(`Proposal [${proposal.target_section}]: ${proposal.rationale}`)

  // ── 2. Apply ──
  const apply_result = await agent(
    `Edit the file at ${TEMPLATE}.

Use the Edit tool with these EXACT parameters:
- old_string: the text between <<<OLD_START>>> and <<<OLD_END>>> below (copy verbatim, including whitespace)
- new_string: the text between <<<NEW_START>>> and <<<NEW_END>>> below

<<<OLD_START>>>
${proposal.old_text}
<<<OLD_END>>>

<<<NEW_START>>>
${proposal.new_text}
<<<NEW_END>>>

If the Edit tool succeeds, reply with exactly: APPLIED
If the Edit tool fails (old_string not found), reply with exactly: FAILED
No other output.`,
    { label: `apply-r${round}`, model: 'haiku' }
  )

  const apply_ok = apply_result && apply_result.trim().toUpperCase().startsWith('APPLIED')
  if (!apply_ok) {
    log(`Round ${round}: apply failed — old_text not found verbatim in template`)
    history.push({ round, target_section: proposal.target_section, rationale: proposal.rationale, outcome: 'apply-failed' })
    continue
  }

  // ── 3. Eval ──
  log(`Applied. Running eval...`)
  const eval_result = await workflow({ script: eval_script }, { baseDir: BASE })
  const new_score = eval_result?.score ?? 0
  const failing = (eval_result?.cases || []).filter(c => c.total < 2).map(c => c.id)

  // ── 4. Keep or revert ──
  if (new_score >= current_best_score) {
    const new_content = await agent(
      `Read ${TEMPLATE} and return its complete content verbatim. No commentary, no fences.`,
      { label: `read-kept-r${round}`, model: 'haiku' }
    )
    if (new_content && new_content.length > 5000) {
      current_best_content = new_content
    }
    current_best_score = new_score
    history.push({ round, target_section: proposal.target_section, rationale: proposal.rationale, expected_impact: proposal.expected_impact, score: new_score, outcome: 'kept' })
    log(`✅ KEPT  score=${new_score}/16  [${proposal.target_section}] ${proposal.rationale}`)
  } else {
    // Revert to current best content
    await agent(
      `Overwrite the file at ${TEMPLATE} with the following exact content using the Write tool. Do not modify, reformat, or truncate anything — write it exactly as provided.\n\n${current_best_content}`,
      { label: `revert-r${round}`, model: 'haiku' }
    )
    history.push({ round, target_section: proposal.target_section, rationale: proposal.rationale, score: new_score, failing_cases: failing, outcome: 'reverted' })
    log(`❌ REVERTED  score dropped ${current_best_score}→${new_score}  failing: ${failing.join(',')}  [${proposal.target_section}]`)
  }
}

// ── Phase: Report ─────────────────────────────────────────────────────────────
phase('Report')

const kept     = history.filter(h => h.outcome === 'kept')
const reverted = history.filter(h => h.outcome === 'reverted')
const skipped  = history.filter(h => ['apply-failed','propose-failed','invalid-proposal'].includes(h.outcome))

log(`\n━━━ Self-Improvement Loop Complete ━━━`)
log(`Rounds: ${MAX_ROUNDS} | Kept: ${kept.length} | Reverted: ${reverted.length} | Skipped: ${skipped.length}`)
log(`Score:  ${baseline_score} → ${current_best_score} / 16`)

if (kept.length > 0) {
  log(`\nKept improvements:`)
  kept.forEach(h => log(`  [${h.target_section}] ${h.rationale}`))
  log(`\nTemplate has been modified in-place at ${TEMPLATE}.`)
  log(`Review changes with: git diff references/template-arena.md`)
  log(`Commit when satisfied: git add references/template-arena.md && git commit -m "refactor(arena): self-refinement improvements"`)
} else {
  log(`No improvements kept — template unchanged.`)
}

return {
  baseline_score,
  final_score:  current_best_score,
  delta:        current_best_score - baseline_score,
  rounds:       MAX_ROUNDS,
  kept:         kept.length,
  reverted:     reverted.length,
  improvements: kept,
  history,
}
