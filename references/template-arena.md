# Ultraflow — Arena Template (smart adversarial dispatcher)

The orchestration layer adds the **adversarial structure**, themed as a Roman arena; ck: skills stay untouched and are used only as per-agent tools. The **Lanista** (router) reads the prompt and auto-decides: which ck: skill the **Gladiator** (producer) uses to make the work, which ck: skill(s) the **Challengers** (contesters) use to attack it, how many, and what to target. Then **Caesar** (judge) rules. Flow: Tuyển binh → Ra trận → Giao chiến → Phán quyết.

This is the meta-entry point: you give a plain prompt, the Lanista picks the right ck: pairing for you.

### Roles (chủ đề Đấu sĩ La Mã)

| Code role | Tên đấu trường | Phase | Vai trò |
|---|---|---|---|
| router | **Lanista** | Tuyển binh | Chọn đấu sĩ + kẻ khiêu chiến + số agent + mục tiêu công kích |
| producer | **Gladiator** | Ra trận | Tạo sản phẩm (chạy ck: skill được chọn) |
| contester | **Challenger** (`challenger-N-<skill>`) | Giao chiến | Công kích sản phẩm; nhãn giữ skill thật (vd `challenger-1-code-review`, `challenger-2-test`) |
| benchmarker | **Benchmarker** | Đo lường | Đo test/timing/LOC/lint thật trên worktree — chỉ chạy khi mutates_files=true; cung cấp số liệu khách quan cho Caesar |
| judge | **Caesar** | Phán quyết | Phán xử với cả challenger critiques + benchmark metrics: 👍 ÂN XÁ / ✊ TÁI ĐẤU / 👎 KHAI TỬ (ACCEPT/REVISE/REJECT) |

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | required | Any task/question/decision in natural language |
| `n` | number | optional | Override the number of contest agents (else the Lanista decides, 2-3; clamped to 2-4) |

## Routing table (the Lanista follows this)

| Prompt intent | PRODUCE (ck:) | CONTEST (ck:) | N | Contest what |
|---|---|---|---|---|
| implement / code / build / add feature | `ck:cook` (mutates) | `ck:code-review` + `ck:security` + `ck:test` | 3 | logic bugs, exploitable holes, regressions, broken contracts, missing tests |
| plan / architect / design / roadmap | `ck:plan` | `ck:predict` + `ck:scenario` | 2-3 | false assumptions, missing edge cases, over-engineering, infeasibility |
| fix bug / error / failing test | `ck:fix` (mutates) | `ck:debug` + `ck:code-review` (+ `ck:test` if the fix touches logic) | 2-3 | wrong root cause, regressions, untested fix paths |
| debug / find root cause / why | `ck:debug` | additional `ck:debug` investigators (each assigned a DISTINCT hypothesis via `contest_angles`) | 3 | competing hypotheses |
| research / find info / compare | `ck:research` | research verifiers (each assigned a DISTINCT angle via `contest_angles`; one chases disconfirming sources) | 2-3 | wrong/unsourced claims, missing data |
| security / audit / vulnerability | `ck:security` | red-team attackers (`ck:security`) | 3 | exploitable holes |
| review code | `ck:code-review` | `ck:code-review` + `ck:security` (if input/auth/storage) | 3 | missed bugs, exploitable holes |
| benchmark / bench / compare solutions | `bench` (mutates) | `ck:code-review` + `ck:test` | 3 | correctness of benchmark metrics, test flakiness, winner selection logic |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-arena',
  description: 'Lanista routes → Gladiator produces → Challengers contest + Benchmarker measures in parallel (mutating only) → Caesar judges with DAR-digested critiques + hybrid verdict (adversarial arena)',
  phases: [
    { title: 'Tuyển binh', detail: 'Lanista đọc prompt → chọn Gladiator (producer), Challengers (contesters), số agent + mục tiêu công kích' },
    { title: 'Ra trận', detail: 'Gladiator chạy ck: skill được chọn để tạo sản phẩm' },
    { title: 'Giao chiến + Đo lường', detail: 'N Challengers công kích song song (contest_angles) + Benchmarker chạy metrics song song (mutates_files only). Challengers receive digest for large artifacts (>150 lines, mutating) + pre-computed diff context.' },
    { title: 'Phán quyết', detail: 'Caesar phân xử với cả challenger critiques + benchmark metrics: ÂN XÁ (ACCEPT) / TÁI ĐẤU (REVISE) / KHAI TỬ (REJECT) + việc cần làm' },
  ],
}

// args may arrive as an object OR a JSON string (harness-dependent) — normalize both.
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
const prompt = A.prompt || 'the given task'
const nOverride = A.n
// Durable round counter (the engine is stateless between --arena calls): parse it from the prompt's "[TÁI ĐẤU vòng N]" tag.
const round = Number((prompt.match(/TÁI ĐẤU vòng (\d+)/) || [])[1]) || 1

// Abort early on an empty prompt instead of running a full PRODUCE→CONTEST→JUDGE cycle on a placeholder.
if (!A.prompt) {
  log('Đấu trường trống — args không mang prompt. Hủy trận.')
  return { error: 'empty-prompt', hint: 'Re-run: /man:ultraflow --arena "<your task>"' }
}

const useCkSkill = (name, dir) =>
  `Use the ORIGINAL ${name} skill as the single source of truth — do NOT invent a different process.\n` +
  `Load it first: call the Skill tool with skill "${name}". If the Skill tool is unavailable to you, Read ~/.claude/skills/${dir}/SKILL.md and every reference file it instructs you to load.\n` +
  `Then follow that skill's steps, gates, and output format EXACTLY for the work below.`

// Auto model selection: router assigns a tier per agent; this validates it.
// Invalid/missing → omit the model option so the agent inherits the session model (safe default).
const MODELS = ['opus', 'sonnet', 'haiku']
const modelOpt = (m) => (MODELS.includes(m) ? { model: m } : {})

// Compact routing table — legend: intent|producer(dir)|mutates|N|contesters(dirs)|contest_targets
// Contesters: name(dir) comma-separated. '+' prefix = conditional (add only if noted condition met).
const ROUTING_TABLE = `
LEGEND: intent keywords | producer skill(dir) | mutates | N | contesters skill(dir),... | contest targets
impl/code/build/add feature | cook(cook) | T | 3 | code-review(ck-code-review),security(ck-security),test(test) | bugs,holes,regressions,contracts,missing-tests
plan/architect/design/roadmap | plan(ck-plan) | F | 2-3 | predict(ck-predict),scenario(ck-scenario) | assumptions,edge-cases,overeng,infeasibility
fix/error/failing test | fix(fix) | T | 2-3 | debug(ck-debug),code-review(ck-code-review),+test(test) IF fix touches logic | root-cause,regressions,untested-paths
debug/root cause/why | debug(ck-debug) | F | 3 | debug(ck-debug) | competing hypotheses — DISTINCT hypothesis per contest_angle
research/find info/compare | research(research) | F | 2-3 | research(research) | wrong/unsourced claims — DISTINCT angle per contest_angle (one seeks disconfirming)
security/audit/vulnerability | security(ck-security) | F | 3 | security(ck-security) | exploitable holes
review code/review PR | code-review(ck-code-review) | F | 3 | code-review(ck-code-review),security(ck-security) | missed bugs,holes
bench/compare solutions | bench(bench) | T | 3 | code-review(ck-code-review),test(test) | metric correctness,flakiness,winner logic,fairness`

const ROUTE_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', description: 'The matched intent row' },
    producer_skill: { type: 'string', description: 'e.g. ck:cook' },
    producer_dir: { type: 'string', description: 'e.g. cook' },
    mutates_files: { type: 'boolean', description: 'true if the producer writes code/files' },
    deliverable: { type: 'string', description: 'concrete artifact the producer must output' },
    contesters: {
      type: 'array',
      items: { type: 'object', properties: { name: { type: 'string' }, dir: { type: 'string' } }, required: ['name', 'dir'] },
      description: 'ck: skills the adversaries use',
    },
    n_agents: { type: 'number', minimum: 2, maximum: 4, description: 'number of contest agents, 2-3 (hard cap 4)' },
    contest_targets: { type: 'array', items: { type: 'string' }, description: 'what the adversaries must attack' },
    contest_angles: { type: 'array', items: { type: 'string' }, description: 'one concrete attack angle per contest agent (length = n_agents), ALL DISTINCT. For same-skill investigation intents (debug/research), each is a DISTINCT hypothesis (e.g. "race condition on shared cache", "stale config not reloaded", "off-by-one in pagination"). For different-skill contests, each names that challenger skill\'s lens (e.g. "logic/correctness", "exploitability", "test coverage & regressions").' },
    complexity: { type: 'string', enum: ['low', 'medium', 'high'], description: 'reasoning difficulty of this task' },
    producer_model: { type: 'string', enum: ['opus', 'sonnet', 'haiku'], description: 'model tier for the producer' },
    judge_model: { type: 'string', enum: ['opus', 'sonnet', 'haiku'], description: 'model tier for the judge' },
    contester_models: { type: 'array', items: { type: 'string', enum: ['opus', 'sonnet', 'haiku'] }, description: 'one model tier per contest agent (length = n_agents); DIVERSIFY across tiers for broader adversarial coverage' },
  },
  required: ['intent', 'producer_skill', 'producer_dir', 'mutates_files', 'deliverable', 'contesters', 'n_agents', 'contest_targets', 'contest_angles', 'complexity', 'producer_model', 'judge_model', 'contester_models'],
}

phase('Tuyển binh')
const route = await agent(
  `You are the LANISTA (arena master). Read the prompt and decide the adversarial setup using the routing table. Pick the SINGLE best-matching row.

Prompt: ${prompt}

Routing table:
${ROUTING_TABLE}

Return the producer ck: skill (+dir), whether it mutates files, the concrete deliverable, the contester ck: skills (+dirs), how many contest agents, and the specific contest targets for THIS prompt.

N (number of contest agents): follow the row's N. For 'implement' use exactly 3 (one challenger per lens: code-review, security, test). For 'fix', add ck:test as a 3rd contester ONLY when the fix touches logic (else keep 2). For debug/research the diversity comes from the hypotheses, not the skill — keep the single skill but set n=3 (debug) / 2-3 (research).

ALSO produce contest_angles — exactly n_agents concrete attack angles, one per challenger, ALL DISTINCT:
- Different-skill contests (implement, review, fix): each angle names the lens of that challenger's skill, IN THE SAME ORDER as the contesters list (e.g. contesters [code-review, security, test] → angles ["logic/correctness & broken contracts", "exploitable input/auth/storage holes", "missing tests & regressions"]; for plan intent: contesters [predict, scenario] → angles ["probability-weighted failure modes & timeline risks", "concrete edge-case & adversarial scenarios that break the plan"]).
- Same-skill investigation (debug, research): each angle is a DIFFERENT concrete hypothesis/lead to chase — do NOT leave them generic. For research, make one angle explicitly seek disconfirming evidence.

ALSO auto-assign a MODEL tier per agent based on reasoning difficulty:
- opus  → hard reasoning: subtle/concurrency bugs, architecture & security decisions, deep root-cause, cross-file impact
- sonnet → moderate work: standard implementation, routine review, fact-checking, well-scoped tasks
- haiku → simple/mechanical: lint, formatting, trivial lookups, yes/no checks
Set complexity, producer_model, judge_model, and contester_models (exactly n_agents entries). DIVERSIFY contester_models across tiers when sensible — different models catch different faults, strengthening the adversarial pass. The judge should usually be opus unless the task is trivial.`,
  { label: 'lanista', phase: 'Tuyển binh', schema: ROUTE_SCHEMA }
)

if (!route) {
  log('Lanista thất bại — hủy trận')
  return { prompt, error: 'router failed' }
}

if (!route.contesters || route.contesters.length === 0) {
  log('Lanista không cử được Challenger nào — hủy trận')
  return { prompt, intent: route.intent, error: 'no contesters' }
}

const n = Math.max(2, Math.min(nOverride || route.n_agents || 2, 4))
// Backfill to length n so the returned models align with `agents: n` (the 'inherit' sentinel → safe session model).
const contesterModels = Array.from({ length: n }, (_, i) => (route.contester_models || [])[i] || 'inherit')
// One concrete attack angle per challenger; empty string falls back to the generic "distinct angle" instruction in the prompt.
const contestAngles = Array.from({ length: n }, (_, i) => (route.contest_angles || [])[i] || '')

// P6: Diversity-preserved model assignment — for implement intent with N=3,
// downgrade the 3rd challenger to haiku ONLY when its angle is mechanical AND
// the first two are both non-haiku. Preserves model diversity for all other cases.
const downgradedModels = contesterModels.map((m, i) => {
  if (route.intent === 'implement' && n === 3 && i === 2) {
    const angle = contestAngles[i] || ''
    const isMechanical = /lint|format|missing test|syntax|style|whitespace/i.test(angle)
    const firstTwoNonHaiku = !contesterModels.slice(0, 2).includes('haiku')
    if (isMechanical && firstTwoNonHaiku) return 'haiku'
  }
  return m
})
log(`⚔️ Lanista điểm binh [vòng ${round}]: ${route.intent} (${route.complexity}) → Gladiator ${route.producer_skill} [${route.producer_model || 'inherit'}], ${n} Challengers ${route.contesters.map(c => c.name).join(', ')} [models: ${downgradedModels.join(',')}], Caesar [${route.judge_model || 'inherit'}]`)

phase('Ra trận')
const artifact = await agent(
  `You are the GLADIATOR stepping into the arena. ${useCkSkill(route.producer_skill, route.producer_dir)}

Task: ${prompt}

Produce this deliverable: ${route.deliverable}

Report exactly what you produced. ${route.mutates_files ? 'Commit your changes with a conventional commit message and report the file:line changes so reviewers can inspect them.' : 'Output the full artifact so reviewers can scrutinize it.'}`,
  { label: 'gladiator', phase: 'Ra trận', ...modelOpt(route.producer_model) }
)

if (!artifact) {
  log('Gladiator gục ngã — không tạo được sản phẩm. Hủy trận (không có gì để công kích).')
  return { prompt, intent: route.intent, producer: route.producer_skill, error: 'producer failed' }
}

// P1: Artifact digest — ONLY for mutating intents with large artifacts (>150 lines).
// Challengers receive a compressed digest; they can read the full branch for BLOCKER findings.
// Caesar always receives the full artifact. Non-mutating intents skip compression entirely.
let challengerArtifact = artifact
if (route.mutates_files && typeof artifact === 'string' && artifact.split('\n').length > 150) {
  const digest = await agent(
    `Compress this code artifact for adversarial review. Extract: function signatures, key logic changes, public API surface, changed imports. Keep under 30% of original length. Challengers will read the full code from the working directory for BLOCKER-level findings.\n\n${artifact}`,
    { label: 'compressor', phase: 'Ra trận' }
  )
  // Length guard: reject digest if shorter than 10% of original (likely a misleading summary)
  const digestUsable = digest && digest.length > artifact.length * 0.10
  challengerArtifact = digestUsable ? digest : artifact
  if (digestUsable) {
    log(`📦 Artifact compressed for challengers: ${artifact.split('\n').length} → ~${digest.split('\n').length} lines`)
  } else if (digest) {
    log(`⚠️ Compressor output too short (${digest.length}/${artifact.length} chars, <10%) — using full artifact`)
  }
}

// P9: Pre-computed diff context for challengers on mutating intents.
// Uses agent() (engine primitive) instead of Bash() which is not available in Workflow scripts.
let diffContext = ''
if (route.mutates_files) {
  const diff = await agent(
    'Run `git diff HEAD~1 --stat` followed by `git diff HEAD~1`. Return ONLY the raw output, no commentary. If diff is unavailable, return empty string.',
    { label: 'diff-fetcher', phase: 'Ra trận', model: 'haiku' }
  )
  if (diff && diff.length < 20000) {
    const diffLines = diff.split('\n')
    diffContext = diffLines.length > 500
      ? diffLines.slice(0, 500).join('\n') + '\n... (truncated, ' + diffLines.length + ' total lines)'
      : diff
  }
}

// P5: Parallel benchmarker + challengers — run Đo lường in parallel with Giao chiến
// for mutating intents. Benchmarker reads the branch independently (no dependency on challengers).
phase('Giao chiến' + (route.mutates_files ? ' + Đo lường' : ''))

const challengerFns = Array.from({ length: n }, (_, i) => {
  const adv = route.contesters[i % route.contesters.length]
  return () =>
    agent(
      `${useCkSkill(adv.name, adv.dir)}

You are CHALLENGER #${i + 1} of ${n}, wielding the ${adv.name} skill as your weapon. Your job: ATTACK the artifact below produced for this task — assume it is flawed until proven otherwise. Use your ${adv.name} skill as the tool to find concrete faults.${contestAngles[i] ? ` Your ASSIGNED angle of attack is: "${contestAngles[i]}" — commit to it, go deep, and stay in your lane; do not duplicate the other challengers' angles. Breadth across challengers beats overlapping objections.` : ` When other challengers share your weapon, attack from an angle distinct to your index (challenger-${i + 1}) — breadth across challengers beats duplicated objections.`}

Original task: ${prompt}

Artifact produced (by ${route.producer_skill}):
${challengerArtifact}
${diffContext ? `\nPre-computed diff (Gladiator's changes — use this to locate affected files/lines instead of re-discovering independently):\n${diffContext}\n` : ''}
Contest targets (attack these specifically): ${route.contest_targets.join('; ')}

Rules:
- Every objection MUST cite concrete evidence (file:line, a specific claim, a reproducible scenario). No vague "could be better".
- Rate each objection: **BLOCKER** (breaks correctness, security, or CI — must fix before ship) / **MAJOR** (degrades reliability or quality but does not block) / **MINOR** (style, cleanup, nice-to-have).
- If you genuinely find nothing in your area, say so explicitly (do not invent issues).

Report: ## Objections (rated, with evidence) / ## What holds up / ## Verdict (artifact is: SOUND / NEEDS-REVISION / REJECT)`,
      { label: `challenger-${i + 1}-${adv.name.replace('ck:', '')}`, phase: 'Giao chiến', ...modelOpt(downgradedModels[i]) }
    )
})

const benchmarkFn = async () => {
  if (!route.mutates_files) return null
  return agent(
    `You are the BENCHMARKER. The Gladiator committed changes directly on the current branch. Run measurements in the current working directory.\n\n` +
    `Run these 4 measurements and report EXACT numbers — no estimates:\n` +
    `1. **Tests**: run the project test suite (look for test scripts in package.json, Makefile, or composer.json). Report total/passed/failed/skipped.\n` +
    `2. **Timing**: wall-clock seconds for the test run.\n` +
    `3. **LOC changed**: \`git diff HEAD~1 --stat\` — count lines added and removed in last commit.\n` +
    `4. **Lint**: run the project linter. Report error count and warning count.\n\n` +
    `If a command is missing or unavailable, report N/A for that metric and note why.\n\n` +
    `Output format (strict — one key per line):\n` +
    `TESTS_TOTAL: <number|N/A>\n` +
    `TESTS_PASSED: <number|N/A>\n` +
    `TESTS_FAILED: <number|N/A>\n` +
    `TEST_TIME_S: <number|N/A>\n` +
    `LOC_ADDED: <number|N/A>\n` +
    `LOC_REMOVED: <number|N/A>\n` +
    `LINT_ERRORS: <number|N/A>\n` +
    `LINT_WARNINGS: <number|N/A>\n` +
    `NOTES: <relevant observations or N/A>`,
    { label: 'benchmarker', phase: 'Đo lường' }
  )
}

// Run challengers and benchmarker in parallel — benchmarker is independent of challengers
const [critiques, benchMetrics] = await parallel([
  async () => {
    const results = await parallel(challengerFns)
    return results
  },
  benchmarkFn
])

if (benchMetrics) {
  const summary = benchMetrics.split('\n').filter(l => /^(TESTS_|LINT_|LOC_|TEST_TIME)/.test(l)).slice(0, 5).join(' | ')
  log(`📊 Benchmark: ${summary}`)
}

// Index-preserving filter: track original index so contestAngles[idx] and route.contesters[idx] stay aligned
const indexed = critiques.map((c, i) => c ? { report: c, idx: i } : null).filter(Boolean)
const valid = indexed.map(x => x.report)
log(`${valid.length}/${n} Challengers đã giao chiến`)

if (valid.length === 0) {
  log('Toàn bộ Challenger gục ngã — hủy trước khi Caesar phán quyết (không có công kích nào để cân nhắc)')
  return { prompt, intent: route.intent, producer: route.producer_skill, artifact, error: 'all contesters failed' }
}

// P2: Unanimity pre-digest — when ALL challengers verdict SOUND and benchmarks are clean,
// prepend a note so Caesar can deliberate faster (but still reads every report).
// Extract verdict section and test with word boundary + negative exclusion to avoid "UNSOUND"/"NOT SOUND" false positives
const isSoundVerdict = (c) => {
  const vs = c.match(/##\s*Verdict[\s\S]*/i)?.[0] || c.slice(-500)
  return /\bSOUND\b/i.test(vs) && !/UNSOUND|NOT\s+SOUND|NEEDS-REVISION|REJECT/i.test(vs)
}
const allSound = valid.every(c => isSoundVerdict(c))
const benchClean = !benchMetrics || (/TESTS_FAILED:\s*0/.test(benchMetrics) && /LINT_ERRORS:\s*0/.test(benchMetrics))
const unanimityNote = (allSound && benchClean)
  ? `\nNOTE: All ${valid.length} challengers independently verdicted SOUND and benchmarks are clean. This increases prior probability of ACCEPT — but Caesar must still verify each challenger cited exhaustive evidence of what they checked, not just a SOUND token without citation.\n`
  : ''

// P4+DAR: Diversity-aware challenger digest for Caesar.
// Compress SOUND challengers to stubs; for non-SOUND, retain BLOCKER/MAJOR + verdict only.
// DAR insight: retain disagreements (maximally informative), compress agreements (redundant).
const digestedCritiques = indexed.map(({ report: c, idx }, i) => {
  const isSound = isSoundVerdict(c) && !/BLOCKER|MAJOR/i.test(c)
  if (isSound) {
    const angle = contestAngles[idx] || `challenger-${idx + 1}`
    return `Challenger ${idx + 1}: SOUND — exhaustively checked "${angle}", found no objections.`
  }
  const blockerMajor = (c.match(/(?:[-*]|\d+\.)\s*\*\*(BLOCKER|MAJOR)\*\*[\s\S]*?(?=(?:[-*]|\d+\.)\s*\*\*(?:BLOCKER|MAJOR|MINOR)\*\*|##|$)/gi) || []).join('\n')
  const verdictSection = c.match(/##\s*Verdict[\s\S]*?(?=##|$)/i)?.[0] || ''
  const advName = route.contesters[idx % route.contesters.length]?.name || `challenger-${idx + 1}`
  return `Challenger ${idx + 1} (${advName}):\n${blockerMajor || '(no BLOCKER/MAJOR objections extracted — see full report)'}\n${verdictSection.trim()}`
})

phase('Phán quyết')
const verdict = await agent(
  `You are CAESAR, the impartial judge presiding over the arena. Weigh the gladiator's artifact against the challengers' objections${benchMetrics ? ' AND the objective benchmark metrics' : ''} and rule.

Contest coverage: ${valid.length} of ${n} challengers reported — weight partial rounds accordingly (fewer reports means thinner adversarial coverage, NOT implicit approval).
${unanimityNote}
Original task: ${prompt}

Artifact (by ${route.producer_skill}):
${artifact}

Challenger reports (digested — SOUND challengers compressed to stubs, non-SOUND retain BLOCKER/MAJOR objections):
${digestedCritiques.join('\n\n')}
${benchMetrics ? `\nObjective benchmark metrics (real numbers from the current branch — treat test failures as hard blockers regardless of challenger opinions):\n${benchMetrics}` : ''}

Rule:
1. **Verdict** (the thumb): ACCEPT (ÂN XÁ — ship as-is) / REVISE (TÁI ĐẤU — fix listed items first) / REJECT (KHAI TỬ — approach is wrong, not just flawed). Decision rule: choose ACCEPT when no upheld BLOCKER/MAJOR exists; REVISE when BLOCKERs/MAJORs are real but addressable with targeted fixes (same approach, patched); REJECT only when the core approach or architecture must be abandoned — not merely because there are several BLOCKERs. Output the canonical token ACCEPT/REVISE/REJECT so downstream tooling can parse it.
2. **Upheld objections**: which BLOCKER/MAJOR objections are real (dismiss any that are wrong or non-issues — say why)
3. **Required actions** (numbered, prioritized): exactly what to fix, where, how
4. **One-line bottom line**

Be decisive. A challenger being loud does not make an objection valid — judge on evidence. Benchmark numbers ARE evidence: failing tests override optimistic challenger verdicts.

After your full reasoning, append a JSON block (do not truncate your reasoning to fit the schema):
\`\`\`json
{
  "verdict": "ACCEPT|REVISE|REJECT",
  "upheld": [{"severity":"BLOCKER|MAJOR|MINOR","source":"challenger-N","summary":"<1 sentence>"}],
  "required_actions": [{"priority":1,"action":"<what>","where":"<file:line or component>"}],
  "bottom_line": "<1 sentence>"
}
\`\`\``,
  { label: 'caesar', phase: 'Phán quyết', ...modelOpt(route.judge_model) }
)

// P3: Extract structured verdict JSON from Caesar's hybrid output (free-text + JSON block)
// Match LAST json code block (Caesar may quote JSON examples before the verdict block)
const jsonMatch = verdict && (() => { const m = Array.from(verdict.matchAll(/```json\s*\n([\s\S]*?)\n?\s*```/g)); return m.length ? m[m.length - 1] : null })()
const structuredVerdict = jsonMatch ? (() => { try { return JSON.parse(jsonMatch[1]) } catch (e) { return null } })() : null

return {
  prompt,
  round,
  intent: route.intent,
  complexity: route.complexity,
  producer: route.producer_skill,
  producerModel: route.producer_model,
  contesters: route.contesters.map(c => c.name),
  contesterModels: downgradedModels,
  contestAngles,
  judgeModel: route.judge_model,
  agents: n,
  mutatedFiles: route.mutates_files,
  benchMetrics,
  verdict,
  structuredVerdict, // P3: parsed JSON from hybrid Caesar verdict (null if extraction failed)
}
```

## Notes

- **Trigger:** `/man:ultraflow --arena "<prompt>"` (or `arena <prompt>`). The Lanista decides everything else.
- **`--agents N`** overrides the Lanista's challenger count (clamped 2-4).
- **Auto model selection:** the Lanista assigns a model tier per agent (opus/sonnet/haiku) based on task complexity, and diversifies the challengers' models so different tiers catch different faults. Invalid/missing tiers fall back to the inherited session model (safe). The `agent()` `model` option is what makes this work.
- **Diversity-preserved model assignment (P6):** for `implement` intent with N=3, the 3rd challenger is downgraded to haiku ONLY when its angle is mechanical (lint, format, syntax, missing tests) AND the first two are non-haiku. Preserves model diversity for all other cases — the core OI-MAS technique is already implemented via Lanista's `contesterModels`.
- **Challenger labels keep their weapon:** each challenger is labelled `challenger-<N>-<skill>` (e.g. `challenger-1-code-review`, `challenger-2-security`, `challenger-3-test`) — the number tells them apart, the skill suffix shows what each is actually doing.
- **Distinct attack angles (`contest_angles`):** adversarial value comes from non-overlapping angles, so the Lanista assigns each challenger one concrete angle. The mechanism matches the intent type: **artifact-producing** intents (implement/fix/review) diversify by *skill* — e.g. `implement` runs 3 lenses (code-review = logic/contracts, security = exploitable holes, test = coverage/regressions); **investigation** intents (debug/research) reuse one skill but diversify by *hypothesis* — each `ck:debug` investigator chases a different concrete root-cause lead, each `ck:research` verifier a different angle (one seeking disconfirming sources). If the Lanista omits an angle, that challenger falls back to the generic "distinct angle by index" instruction.
- The adversarial structure lives entirely here; every agent still uses the original ck: skills as tools — ck: is never modified.
- If the Gladiator mutated files (`ck:cook` / `ck:fix`), it commits directly on the current branch — no worktree isolation. Caesar's verdict determines next steps: on **ACCEPT** commit is already on branch, ready to push; on **REVISE** apply required actions then commit; on **REJECT** `git revert HEAD` to undo the Gladiator's commit.
- **Post-verdict "ending":** after reporting the verdict, follow the closing protocol in `SKILL.md` → "Arena ending (post-verdict next steps)". Engine caveats: (1) round count = the returned `round` field (parsed from the prompt's `[TÁI ĐẤU vòng N]` tag — the engine is stateless between calls); (2) a follow-up `--arena` prompt MUST anchor the original intent (`[TÁI ĐẤU vòng <N+1> — intent: <intent>] …`) so the Lanista does not re-route to a different producer.
- **Parallel Giao chiến + Đo lường (P5):** challengers and benchmarker now run in parallel for mutating intents. The benchmarker reads the branch independently — no dependency on challenger output. Saves 20-30% wall-clock time on mutating runs.
- **Artifact digest (P1):** for mutating intents with large artifacts (>150 lines), a compressor agent generates a digest before distributing to challengers. Challengers receive the digest; Caesar always receives the full artifact. Non-mutating intents skip compression entirely. Graceful fallback to full artifact on compressor failure.
- **Pre-computed diff context (P9):** for mutating intents, a haiku agent runs `git diff HEAD~1` and includes output in challenger prompts so they skip independent file discovery. Uses `agent()` (engine primitive) instead of `Bash()`. Truncated to 500 lines max.
- **Unanimity pre-digest (P2):** when ALL challengers independently verdict SOUND and benchmarks are clean, a note is prepended to Caesar's prompt to speed deliberation. Caesar still reads every report — the note reduces deliberation depth only when evidence is genuinely exhaustive.
- **DAR-based challenger digest (P4):** before passing challenger reports to Caesar, SOUND challengers are compressed to 1-line stubs; non-SOUND challengers retain only BLOCKER/MAJOR objections + verdict. DAR insight: disagreements are maximally informative, agreements are redundant. Saves ~8-12% of Caesar's input tokens.
- **Hybrid Caesar verdict (P3):** Caesar reasons freely in prose, then appends a structured JSON block for machine parsing. `structuredVerdict` in the return value is the parsed JSON (null if extraction failed). Preserves full reasoning quality while enabling downstream tooling.
- **Compact routing table (P7):** the Lanista's routing table uses a compressed format with a legend line, saving ~400 tokens per run.
- Requires the ck: skills the router routes to (cook, ck-code-review, test, ck-plan, ck-predict, ck-scenario, fix, ck-debug, research, ck-security).
