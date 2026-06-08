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
| implement / code / build / add feature | `ck:cook` (mutates) | `ck:code-review` + `ck:security` + `ck:test` | 3 | logic bugs, exploitable holes, regressions, broken contracts, missing tests |
| plan / architect / design / roadmap | `ck:plan` | `ck:predict` + `ck:scenario` | 2-3 | false assumptions, missing edge cases, over-engineering, infeasibility |
| fix bug / error / failing test | `ck:fix` (mutates) | `ck:debug` + `ck:code-review` (+ `ck:test` if the fix touches logic) | 2-3 | wrong root cause, regressions, untested fix paths |
| debug / find root cause / why | `ck:debug` | additional `ck:debug` investigators (each assigned a DISTINCT hypothesis via `contest_angles`) | 3 | competing hypotheses |
| research / find info / compare | `ck:research` | research verifiers (each assigned a DISTINCT angle via `contest_angles`; one chases disconfirming sources) | 2-3 | wrong/unsourced claims, missing data |
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

const ROUTING_TABLE = `
- implement / code / build / add feature  → producer ck:cook (dir cook, mutates=true) | n=3 | contesters [ck:code-review (ck-code-review), ck:security (ck-security), ck:test (test)] | contest: logic bugs, exploitable holes, regressions, broken contracts, missing tests
- plan / architect / design / roadmap     → producer ck:plan (dir ck-plan, mutates=false) | contesters [ck:predict (ck-predict), ck:scenario (ck-scenario)] | contest: false assumptions, missing edge cases, over-engineering, infeasibility
- fix bug / error / failing test          → producer ck:fix (dir fix, mutates=true) | contesters [ck:debug (ck-debug), ck:code-review (ck-code-review), + ck:test (test) ONLY if the fix touches logic] | contest: wrong root cause, regressions, untested fix paths
- debug / find root cause / why           → producer ck:debug (dir ck-debug, mutates=false) | contesters [ck:debug (ck-debug)] | contest: competing hypotheses — each investigator pursues a DISTINCT hypothesis assigned via contest_angles
- research / find info / compare          → producer ck:research (dir research, mutates=false) | contesters [ck:research (research)] | contest: wrong/unsourced claims, missing data — each verifier takes a DISTINCT angle assigned via contest_angles (one seeks disconfirming sources)
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
- Different-skill contests (implement, review, fix): each angle names the lens of that challenger's skill, IN THE SAME ORDER as the contesters list (e.g. contesters [code-review, security, test] → angles ["logic/correctness & broken contracts", "exploitable input/auth/storage holes", "missing tests & regressions"]).
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
log(`⚔️ Lanista điểm binh [vòng ${round}]: ${route.intent} (${route.complexity}) → Gladiator ${route.producer_skill} [${route.producer_model || 'inherit'}], ${n} Challengers ${route.contesters.map(c => c.name).join(', ')}, Caesar [${route.judge_model || 'inherit'}]`)

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
  round,
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
- If the Gladiator mutated files (`ck:cook` / `ck:fix`), it ran in an isolated worktree and only the branch NAME is returned (`branch` field) — the worktree PATH is not, so resolve it at runtime with `git worktree list` (filter by the branch) before any `git worktree remove`. Merge depends on Caesar's verdict: on **ACCEPT** merge as-is (`git merge <branch>`); on **REVISE** apply the required actions first, then merge; on **REJECT** discard (resolve conflicts manually). If `mutatedFiles` is true but `branch` is null (Gladiator dropped the `BRANCH:` footer), recover it via `git worktree list`.
- **Post-verdict "ending":** after reporting the verdict, follow the closing protocol in `SKILL.md` → "Arena ending (post-verdict next steps)". Engine caveats it relies on: (1) round count = the returned `round` field (parsed from the prompt's `[TÁI ĐẤU vòng N]` tag — the engine is stateless between calls); (2) a follow-up `--arena` prompt MUST anchor the original intent (`[TÁI ĐẤU vòng <N+1> — intent: <intent>] …`) so the Lanista does not re-route to a different (mutating) producer; (3) there is no `--branch` arg — "same branch" is advisory, a mutating re-run may create a NEW branch.
- Requires the ck: skills the router routes to (cook, ck-code-review, test, ck-plan, ck-predict, ck-scenario, fix, ck-debug, research, ck-security).
