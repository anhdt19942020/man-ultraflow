# Ultraflow — Arena Template (smart adversarial dispatcher)

The orchestration layer adds the **adversarial structure**, themed as a Roman arena; ck: skills stay untouched and are used only as per-agent tools. The **Lanista** (router) reads the prompt and auto-decides: which ck: skill the **Gladiator** (producer) uses to make the work, which ck: skill(s) the **Challengers** (contesters) use to attack it, how many, and what to target. Then **Caesar** (judge) rules. Flow: Tuyển binh → Ra trận → Giao chiến → Phán quyết.

This is the meta-entry point: you give a plain prompt, the Lanista picks the right ck: pairing for you.

### Roles (chủ đề Đấu sĩ La Mã)

| Code role | Tên đấu trường | Phase | Vai trò |
|---|---|---|---|
| router | **Lanista** | Tuyển binh | Chọn đấu sĩ + kẻ khiêu chiến + số agent + mục tiêu công kích |
| producer | **Gladiator** | Ra trận | Tạo sản phẩm (chạy ck: skill được chọn) |
| contester | **Challenger** (`challenger-N-<skill>`) | Giao chiến | Công kích sản phẩm; nhãn giữ skill thật (vd `challenger-1-code-review`, `challenger-2-test`) |
| judge | **Caesar** | Phán quyết | Phán xử 👍 ÂN XÁ / ✊ TÁI ĐẤU / 👎 KHAI TỬ (ACCEPT/REVISE/REJECT) |

## Args

| Field | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | required | Any task/question/decision in natural language |
| `n` | number | optional | Override the number of contest agents (else the Lanista decides, 2-3; clamped to 2-4) |

## Routing table (the Lanista follows this)

| Prompt intent | PRODUCE (ck:) | CONTEST (ck:) | N | Contest what |
|---|---|---|---|---|
| implement / code / build / add feature | `ck:cook` (mutates) | `ck:code-review` + `ck:test` | 2-3 | bugs, regressions, broken contracts, missing tests |
| plan / architect / design / roadmap | `ck:plan` | `ck:predict` + `ck:scenario` | 2-3 | false assumptions, missing edge cases, over-engineering, infeasibility |
| fix bug / error / failing test | `ck:fix` (mutates) | `ck:debug` + `ck:code-review` | 2-3 | wrong root cause, regressions |
| debug / find root cause / why | `ck:debug` | additional `ck:debug` investigators (distinct hypothesis each) | 3 | competing hypotheses |
| research / find info / compare | `ck:research` | research verifiers (distinct angle each) | 2-3 | wrong/unsourced claims, missing data |
| security / audit / vulnerability | `ck:security` | red-team attackers (`ck:security`) | 3 | exploitable holes |
| review code | `ck:code-review` | `ck:code-review` + `ck:security` (if input/auth/storage) | 3 | missed bugs, exploitable holes |

## Workflow Script

```javascript
export const meta = {
  name: 'ultraflow-arena',
  description: 'Lanista routes → Gladiator produces → Challengers contest → Caesar judges (adversarial arena)',
  phases: [
    { title: 'Tuyển binh', detail: 'Lanista đọc prompt → chọn Gladiator (producer), Challengers (contesters), số agent + mục tiêu công kích' },
    { title: 'Ra trận', detail: 'Gladiator chạy ck: skill được chọn để tạo sản phẩm' },
    { title: 'Giao chiến', detail: 'N Challengers, mỗi người chạy một ck: skill để công kích sản phẩm' },
    { title: 'Phán quyết', detail: 'Caesar phân xử: ÂN XÁ (ACCEPT) / TÁI ĐẤU (REVISE) / KHAI TỬ (REJECT) + việc cần làm' },
  ],
}

// args may arrive as an object OR a JSON string (harness-dependent) — normalize both.
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
const prompt = A.prompt || 'the given task'
const nOverride = A.n

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

const ROUTING_TABLE = `
- implement / code / build / add feature  → producer ck:cook (dir cook, mutates=true) | contesters [ck:code-review (ck-code-review), ck:test (test)] | contest: bugs, regressions, broken contracts, missing tests
- plan / architect / design / roadmap     → producer ck:plan (dir ck-plan, mutates=false) | contesters [ck:predict (ck-predict), ck:scenario (ck-scenario)] | contest: false assumptions, missing edge cases, over-engineering, infeasibility
- fix bug / error / failing test          → producer ck:fix (dir fix, mutates=true) | contesters [ck:debug (ck-debug), ck:code-review (ck-code-review)] | contest: wrong root cause, regressions
- debug / find root cause / why           → producer ck:debug (dir ck-debug, mutates=false) | contesters [ck:debug (ck-debug)] | contest: competing hypotheses — each investigator MUST pursue a DISTINCT hypothesis
- research / find info / compare          → producer ck:research (dir research, mutates=false) | contesters [ck:research (research)] | contest: wrong/unsourced claims, missing data — each verifier MUST take a DISTINCT angle (one seeks disconfirming sources)
- security / audit / vulnerability        → producer ck:security (dir ck-security, mutates=false) | contesters [ck:security (ck-security)] | contest: exploitable holes
- review code / review PR                 → producer ck:code-review (dir ck-code-review, mutates=false) | contesters [ck:code-review (ck-code-review), ck:security (ck-security)] | contest: missed bugs, exploitable holes`

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
    complexity: { type: 'string', enum: ['low', 'medium', 'high'], description: 'reasoning difficulty of this task' },
    producer_model: { type: 'string', enum: ['opus', 'sonnet', 'haiku'], description: 'model tier for the producer' },
    judge_model: { type: 'string', enum: ['opus', 'sonnet', 'haiku'], description: 'model tier for the judge' },
    contester_models: { type: 'array', items: { type: 'string', enum: ['opus', 'sonnet', 'haiku'] }, description: 'one model tier per contest agent (length = n_agents); DIVERSIFY across tiers for broader adversarial coverage' },
  },
  required: ['intent', 'producer_skill', 'producer_dir', 'mutates_files', 'deliverable', 'contesters', 'n_agents', 'contest_targets', 'complexity', 'producer_model', 'judge_model', 'contester_models'],
}

phase('Tuyển binh')
const route = await agent(
  `You are the LANISTA (arena master). Read the prompt and decide the adversarial setup using the routing table. Pick the SINGLE best-matching row.

Prompt: ${prompt}

Routing table:
${ROUTING_TABLE}

Return the producer ck: skill (+dir), whether it mutates files, the concrete deliverable, the contester ck: skills (+dirs), how many contest agents (2-3), and the specific contest targets for THIS prompt.

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
log(`⚔️ Lanista điểm binh: ${route.intent} (${route.complexity}) → Gladiator ${route.producer_skill} [${route.producer_model || 'inherit'}], ${n} Challengers ${route.contesters.map(c => c.name).join(', ')}, Caesar [${route.judge_model || 'inherit'}]`)

phase('Ra trận')
const artifact = await agent(
  `You are the GLADIATOR stepping into the arena. ${useCkSkill(route.producer_skill, route.producer_dir)}

Task: ${prompt}

Produce this deliverable: ${route.deliverable}

Report exactly what you produced. ${route.mutates_files ? 'Commit your changes with a conventional commit message, report the file:line changes so reviewers can inspect them, and end your report with the branch name on its own final line in the EXACT form `BRANCH: <branch-name>`.' : 'Output the full artifact so reviewers can scrutinize it.'}`,
  { label: 'gladiator', phase: 'Ra trận', ...modelOpt(route.producer_model), ...(route.mutates_files ? { isolation: 'worktree' } : {}) }
)

if (!artifact) {
  log('Gladiator gục ngã — không tạo được sản phẩm. Hủy trận (không có gì để công kích).')
  return { prompt, intent: route.intent, producer: route.producer_skill, error: 'producer failed' }
}

// Extract the worktree branch (when the producer mutated files) so the caller can merge it structurally.
const branchMatch = route.mutates_files && typeof artifact === 'string' ? artifact.match(/BRANCH:\s*(\S+)/) : null
const branch = branchMatch ? branchMatch[1] : null

phase('Giao chiến')
const critiques = await parallel(
  Array.from({ length: n }, (_, i) => {
    const adv = route.contesters[i % route.contesters.length]
    return () =>
      agent(
        `${useCkSkill(adv.name, adv.dir)}

You are CHALLENGER #${i + 1} of ${n}, wielding the ${adv.name} skill as your weapon. Your job: ATTACK the artifact below produced for this task — assume it is flawed until proven otherwise. Use your ${adv.name} skill as the tool to find concrete faults. When other challengers share your weapon, attack from an angle distinct to your index (challenger-${i + 1}) — breadth across challengers beats duplicated objections.

Original task: ${prompt}

Artifact produced (by ${route.producer_skill}):
${artifact}

Contest targets (attack these specifically): ${route.contest_targets.join('; ')}

Rules:
- Every objection MUST cite concrete evidence (file:line, a specific claim, a reproducible scenario). No vague "could be better".
- Rate each objection: BLOCKER / MAJOR / MINOR.
- If you genuinely find nothing in your area, say so explicitly (do not invent issues).

Report: ## Objections (rated, with evidence) / ## What holds up / ## Verdict (artifact is: SOUND / NEEDS-REVISION / REJECT)`,
        { label: `challenger-${i + 1}-${adv.name.replace('ck:', '')}`, phase: 'Giao chiến', ...modelOpt(contesterModels[i]) }
      )
  })
)

const valid = critiques.filter(Boolean)
log(`${valid.length}/${n} Challengers đã giao chiến`)

if (valid.length === 0) {
  log('Toàn bộ Challenger gục ngã — hủy trước khi Caesar phán quyết (không có công kích nào để cân nhắc)')
  return { prompt, intent: route.intent, producer: route.producer_skill, artifact, branch, error: 'all contesters failed' }
}

phase('Phán quyết')
const verdict = await agent(
  `You are CAESAR, the impartial judge presiding over the arena. Weigh the gladiator's artifact against the challengers' objections and rule.

Contest coverage: ${valid.length} of ${n} challengers reported — weight partial rounds accordingly (fewer reports means thinner adversarial coverage, NOT implicit approval).

Original task: ${prompt}

Artifact (by ${route.producer_skill}):
${artifact}

Challenger reports:
${valid.map((c, i) => `=== Challenger ${i + 1} ===\n${c}`).join('\n\n')}

Rule:
1. **Verdict** (👑 the thumb): ACCEPT (👍 ÂN XÁ — ship as-is) / REVISE (✊ TÁI ĐẤU — fix listed items first) / REJECT (👎 KHAI TỬ — approach is wrong). Output the canonical token ACCEPT/REVISE/REJECT so downstream tooling can parse it.
2. **Upheld objections**: which BLOCKER/MAJOR objections are real (dismiss any that are wrong or non-issues — say why)
3. **Required actions** (numbered, prioritized): exactly what to fix, where, how
4. **One-line bottom line**

Be decisive. A challenger being loud does not make an objection valid — judge on evidence.`,
  { label: 'caesar', phase: 'Phán quyết', ...modelOpt(route.judge_model) }
)

return {
  prompt,
  intent: route.intent,
  complexity: route.complexity,
  producer: route.producer_skill,
  producerModel: route.producer_model,
  contesters: route.contesters.map(c => c.name),
  contesterModels,
  judgeModel: route.judge_model,
  agents: n,
  mutatedFiles: route.mutates_files,
  branch,
  verdict,
}
```

## Notes

- **Trigger:** `/man:ultraflow --arena "<prompt>"` (or `arena <prompt>`). The Lanista decides everything else.
- **`--agents N`** overrides the Lanista's challenger count (clamped 2-4).
- **Auto model selection:** the Lanista assigns a model tier per agent (opus/sonnet/haiku) based on task complexity, and diversifies the challengers' models so different tiers catch different faults. Invalid/missing tiers fall back to the inherited session model (safe). The `agent()` `model` option is what makes this work.
- **Challenger labels keep their weapon:** each challenger is labelled `challenger-<N>-<skill>` (e.g. `challenger-1-code-review`, `challenger-2-test`) — the number tells them apart, the skill suffix shows what each is actually doing.
- The adversarial structure lives entirely here; every agent still uses the original ck: skills as tools — ck: is never modified.
- If the Gladiator mutated files (`ck:cook` / `ck:fix`), it ran in an isolated worktree and the branch is returned in the `branch` field. Merge depends on Caesar's verdict: on **ACCEPT** merge as-is (`git merge <branch>`); on **REVISE** apply the required actions on the branch first, then merge; on **REJECT** discard. Clean up afterward with `git worktree remove <path>` (resolve any merge conflicts manually).
- Requires the ck: skills the router routes to (cook, ck-code-review, test, ck-plan, ck-predict, ck-scenario, fix, ck-debug, research, ck-security).
