# Research Report: Arena System Evolution & Optimization

**Date:** 2026-06-09
**Scope:** Analyze current arena architecture, identify bottlenecks, research state-of-the-art techniques, propose concrete improvements
**Target:** Token reduction, coding effectiveness, rigor, speed

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Bottleneck Identification](#bottleneck-identification)
4. [State-of-the-Art Techniques](#state-of-the-art-techniques)
5. [Concrete Proposals (Ranked)](#concrete-proposals)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Sources & References](#sources--references)

---

## Executive Summary

> **Status:** Revised per Caesar's verdict (Round 1). Three proposals redesigned (P1, P2, P6), one withdrawn (P8), one corrected (P4+DAR), cumulative savings restated with honest math.

The arena template (`template-arena.md`) is a well-structured 5-phase adversarial workflow: Lanista routes -> Gladiator produces -> Challengers contest -> Benchmarker measures -> Caesar judges. Analysis reveals **5 major bottlenecks**: (1) massive token duplication from passing full artifact text to every challenger AND to Caesar, (2) no early termination when challengers unanimously find nothing, (3) the Lanista router burns a full agent call for what is essentially a classification task, (4) challenger prompts carry redundant skill-loading boilerplate, and (5) Caesar re-reads everything from scratch instead of receiving pre-digested summaries.

Research into D3 (Debate-Deliberate-Decide), SkillReducer, CompactPrompt, DAR (Diversity-Aware Retention), adaptive routing (OI-MAS, RCR-Router), and Claude Code's native workflow primitives (`pipeline()` vs `parallel()`) reveals **9 concrete proposals** with the following honest savings estimates against a ~50K-token baseline per arena run (non-mutating, N=3):

| Proposal | Estimated token savings | Baseline | Notes |
|---|---|---|---|
| P1 (Artifact Digest — mutating only) | ~8-12% | ~50K | Compressor cost ~2K, saves ~8-15K on large artifacts; 0% on non-mutating |
| P3 (Hybrid Caesar Verdict) | ~5-8% | ~50K | Output token reduction; no reasoning degradation |
| P4+DAR (Challenger Digest + Diversity) | ~8-12% | ~50K | Digest + retain disagreements only |
| P5 (Parallel Bench) | 0% token, +20-30% wall-clock | — | Pure speed win |
| P7 (Compact Routing) | ~1% | ~50K | ~500 tokens, free |
| P9 (Pre-computed Diff) | ~2-5% | ~50K | Speeds challenger file discovery |

Individual proposals are not additive (shared baselines). Combined realistic savings: **~15-25% tokens, 20-35% wall-clock** on typical runs. Withdrawn: P2 (Caesar fast-path), P8 (complexity-based N override). Redesigned: P1 (mutating-only scope), P6 (preserve model diversity).

---

## Current Architecture Analysis

### Phase Flow (5 phases, 4-7 agent calls)

```
Phase 1: Tuyen binh (Lanista)     — 1 agent call, schema-constrained
Phase 2: Ra tran (Gladiator)      — 1 agent call, skill-loaded, optional worktree
Phase 3: Giao chien (Challengers) — N agent calls in parallel (N=2-4)
Phase 4: Do luong (Benchmarker)   — 1 agent call, only if mutates_files && branch
Phase 5: Phan quyet (Caesar)      — 1 agent call, reads everything
```

**Total agent calls per run:** 4 (non-mutating, N=2) to 8 (mutating, N=4 + benchmarker)

### Token Flow Analysis (estimated per phase)

| Phase | Input tokens (approx) | Key content passed |
|---|---|---|
| Lanista | ~2K | Routing table + prompt + schema |
| Gladiator | ~3-5K | Skill loading + task prompt + deliverable instruction |
| Each Challenger | ~4-8K | Skill loading + task prompt + **FULL artifact** + contest targets + angle |
| Benchmarker | ~1-2K | Branch name + measurement instructions |
| Caesar | ~8-20K | Task prompt + **FULL artifact** + **ALL challenger reports** + bench metrics |

**Critical observation:** The artifact is serialized verbatim N+1 times (once per challenger + once for Caesar). For a code implementation producing 200 lines of output, this alone accounts for 3-5K tokens x (N+1) = 12-25K redundant tokens.

### Architectural Strengths (preserve these)

1. **Separation of concerns** — orchestration layer never modifies ck: skills
2. **Schema-constrained routing** — Lanista output is validated JSON, not free text
3. **Contest angles** — distinct attack vectors per challenger prevent duplication
4. **Model tier diversity** — different models on challengers catch different faults
5. **Stateless round counter** — simple, robust, no external state needed
6. **Benchmarker as objective ground truth** — hard numbers override opinions

---

## Bottleneck Identification

### B1: Artifact Duplication (Token Cost: HIGH)

**Problem:** Full artifact text is embedded in every challenger prompt AND in Caesar's prompt. A 200-line code output (~4K tokens) is duplicated N+1 times = 12-20K wasted tokens.

**Evidence:** Lines 180-186 (challenger prompt) and 249 (Caesar prompt) both interpolate `${artifact}` verbatim.

**Severity:** CRITICAL — single largest token cost driver.

### B2: Lanista as Full Agent Call (Speed: MEDIUM)

**Problem:** The Lanista is a classification task (match prompt intent to routing table row + fill schema). It uses a full `agent()` call with the overhead of skill loading, tool access, and open-ended reasoning. This adds 5-15 seconds and ~3K output tokens for what is essentially a structured extraction.

**Evidence:** Lines 110-131 — the Lanista prompt is well-constrained but still runs as a full agent.

**Severity:** MEDIUM — slows every arena run by the router latency.

### B3: No Early Exit on Clean Artifacts (Speed: MEDIUM)

**Problem:** All N challengers always run to completion even if the first 2 find zero issues. There is no mechanism to short-circuit when the artifact is clean.

**Evidence:** Lines 173-198 — `parallel()` always waits for all N agents.

**Severity:** MEDIUM — wastes 30-50% of challenger tokens on clean artifacts.

### B4: Caesar Prompt Bloat (Token Cost: HIGH)

**Problem:** Caesar receives: full task prompt + full artifact + all challenger reports (each 1-3K tokens) + bench metrics. For N=3, this is easily 15-25K input tokens. Much of this is redundant with what challengers already analyzed.

**Evidence:** Lines 241-261 — Caesar's prompt concatenates everything.

**Severity:** HIGH — second largest token cost driver.

### B5: Redundant Skill-Loading Boilerplate (Token Cost: LOW-MEDIUM)

**Problem:** Every challenger prompt includes the full `useCkSkill()` boilerplate (~150 tokens) plus the "Rules" section (~100 tokens). These are identical across all challengers.

**Evidence:** Lines 177-194 — each challenger gets the same boilerplate prefix.

**Severity:** LOW — ~250 tokens x N = 500-1000 tokens, but easy to fix.

### B6: No Severity-Based Filtering for Caesar (Rigor: MEDIUM)

**Problem:** Caesar must wade through ALL objections including MINORs to find BLOCKERs. No pre-filtering or structured summary exists.

**Evidence:** Lines 252 — raw concatenation of challenger reports.

**Severity:** MEDIUM — impacts judge quality more than token count.

### B7: Contest Angle Overlap Risk (Rigor: LOW)

**Problem:** Despite the "distinct angle" instruction, same-skill challengers (debug/research) can still overlap because there's no verification of actual angle distinctness.

**Evidence:** Lines 100, 148 — angles are assigned by Lanista but never validated post-execution.

**Severity:** LOW — the angle instruction works well enough in practice.

### B8: Fixed Phase Order (Speed: LOW)

**Problem:** Benchmarker runs sequentially AFTER challengers complete. For mutating intents, benchmarking could run in parallel with challengers since it reads the same branch independently.

**Evidence:** Lines 211-238 — benchmarker is a separate sequential phase after `Giao chien`.

**Severity:** LOW — saves wall-clock time but not tokens.

---

## State-of-the-Art Techniques

### T1: D3 Framework — Budgeted Stopping (from arxiv.org/abs/2410.04663)

**What:** D3 (Debate, Deliberate, Decide) introduces two protocols: MORE (Multi-Advocate One-Round, parallel) and SAMRE (Single-Advocate Multi-Round, with budgeted stopping). SAMRE iteratively refines arguments under an explicit token budget — if the judge reaches confidence threshold before budget exhaustion, it stops early.

**Applicable to arena:** Caesar could have a confidence-based early-read mechanism. If all challengers report SOUND and benchmarks pass, Caesar can issue a fast-path ACCEPT without full deliberation.

**Measured gains:** 85-86% accuracy with 40% token reduction through budgeted stopping.

### T2: SkillReducer — Adaptive Skill Compression (from arxiv.org/pdf/2603.29919)

**What:** SkillReducer optimizes LLM agent skills for token efficiency by dynamically pruning skill descriptions based on task relevance. Instead of loading full skill documentation every time, it identifies which parts of a skill are relevant to the current task and only loads those.

**Applicable to arena:** The `useCkSkill()` function always loads the full skill. A compressed variant could pass only the task-relevant subset of skill instructions.

**Measured gains:** 26-54% reduction in peak token usage.

### T3: CompactPrompt — Perplexity-Based Token Pruning (from arxiv.org/html/2510.18043v1)

**What:** CompactPrompt uses self-information scoring to prune low-information tokens from prompts, applies n-gram abbreviation to recurrent patterns, and quantizes numerical data.

**Applicable to arena:** The artifact passed to challengers and Caesar contains boilerplate, comments, and formatting that carry low information. A compression pass could reduce artifact size by 30-50% before distribution.

**Measured gains:** Up to 60% token reduction with <5% accuracy drop.

### T4: Confidence-Aware Routing (OI-MAS, from arxiv.org/pdf/2601.04861)

**What:** OI-MAS uses a per-turn routing policy that assigns model capacity based on current reasoning state. Simple turns get small models, complex reasoning gets large models. The routing decision happens at each step, not just at initialization.

**Applicable to arena:** The Lanista already assigns model tiers (via `contesterModels`) — this IS the core OI-MAS technique, already implemented. A more dynamic approach would let challengers self-escalate at runtime, but that adds a sequential second pass. The Lanista's static assignment is the right tradeoff for arena's parallel execution model.

**Measured gains:** Up to 79.78% compute reduction with equivalent quality (corrected from "30-50%" in prior draft). Note: arena already achieves this via Lanista model diversification.

### T5: Adaptive Stability Detection for Debate (from openreview.net/forum?id=Vusd1Hw2D9)

**What:** Multi-agent debate with adaptive stability detection monitors when agent positions stabilize (no new arguments emerging) and terminates the debate early. Uses a sliding window over argument novelty scores.

**Applicable to arena:** If challengers are running same-skill investigation (debug/research), check if early-finishing challengers already cover the space — cancel remaining ones if their angles overlap with completed reports.

### T5b: DAR — Diversity-Aware Message Retention (from arxiv.org/abs/2603.20640)

**What:** DAR is a multi-agent message retention strategy: instead of passing all agent messages to the judge, it selects a subset that maximizes semantic diversity. The insight is that agreement adds no new information — only disagreement between agents is informative. DAR clusters agent outputs by semantic similarity and retains one representative per cluster (the highest-severity/most-extreme view).

**Applicable to arena:** Challenger reports often overlap, especially for same-skill investigation (research, debug). Instead of passing all N reports to Caesar verbatim, apply DAR: cluster objections by topic, retain the strongest/most-distinct per cluster, compress unanimous SOUND challengers to stubs. Directly upgrades P4.

**Measured gains:** DAR achieves equivalent judge accuracy with 30-50% fewer input tokens to the judge agent.

### T6: Hybrid Verdict Schema (from production patterns + "Let Me Speak Freely?" research)

**What:** Pure JSON schema on a judge degrades reasoning quality 10-30% ("Let Me Speak Freely?" finding). Hybrid approach: Caesar reasons freely in prose (no schema constraint), then appends a compact structured JSON block. Downstream tooling parses JSON; prose is for human review.

**Applicable to arena:** Caesar currently outputs free text requiring regex parsing. Hybrid format preserves deliberation quality while enabling machine-parseable downstream handling. ~5-8% output token reduction. See P3 for implementation.

### T7: Pipeline vs Parallel Primitives (from Claude Code workflow docs)

**What:** Claude Code's workflow engine offers `pipeline()` (streaming, no barrier) in addition to `parallel()` (barrier). Pipeline lets items flow through stages without waiting for all items to complete a stage.

**Applicable to arena:** Challengers could pipeline into Caesar — as each challenger completes, their critique streams to Caesar who can begin reading. This reduces wall-clock time.

---

## Concrete Proposals (Ranked by Impact)

### P1: Artifact Digest for Challengers — MUTATING INTENTS ONLY [TOKEN: ~8-12%]

**What:** Before distributing the artifact to challengers, generate a compressed digest. **Scope: ONLY when `mutates_files=true`.** For non-mutating intents (research, plan, debug, review, security), challengers receive the full artifact — there is no branch fallback, and lossy compression applied before adversarial review defeats the purpose of the adversarial structure.

For mutating intents, pass the digest to challengers; challengers can read the full code from the worktree branch. Only apply compression when artifact exceeds 150 lines (below that, compressor cost exceeds savings).

**Implementation:**
```javascript
// After Gladiator produces artifact — ONLY for mutating intents
let challengerArtifact = artifact
if (route.mutates_files && branch && typeof artifact === 'string' && artifact.split('\n').length > 150) {
  const digest = await agent(
    `Compress this code artifact for adversarial review. Extract: function signatures, key logic changes, public API surface, changed imports. Keep under 30% of original. Challengers will read the full branch at "${branch}" for BLOCKER findings.\n\n${artifact}`,
    { label: 'compressor', phase: 'Ra trận' }
  )
  challengerArtifact = digest || artifact // fallback to full on compressor failure
}
// Pass challengerArtifact to challengers; pass full artifact to Caesar
```

**Effort:** Low (add conditional compressor, update challenger prompt to use `challengerArtifact`)
**Risk:** Compressor agent failure → graceful fallback to full artifact. Challengers may miss details; mitigate by noting branch location so they can self-serve.
**Expected gain:** ~8-12% total run tokens on mutating intents with large artifacts. 0% on non-mutating (no compression applied).
**Honest math:** Compressor ~2K tokens. Saves N × (artifact_size - digest_size). For 300-line artifact (~6K tokens) with N=3: saves ~12K, costs 2K = net ~10K = ~20% on that run's challenger phase.

### P2: Unanimity Pre-Digest for Caesar [SPEED: +10-15%, RIGOR: neutral]

> **Redesigned** — original "fast-path bypass Caesar" proposal withdrawn. arxiv:2509.05396 documents 17.4% wrong-consensus rate on unanimously stopped predictions. Caesar exists as the independent last reader who catches what challengers' shared framing blinds them to; bypassing it is not acceptable. D3's budgeted stopping uses multi-round iterative convergence, not single-round unanimity — the original application was mechanistically incorrect.

**What:** Caesar always reads the evidence. When all challengers independently verdict SOUND and benchmarks are clean, prepend a pre-digest note to Caesar's prompt so it can deliberate faster and more confidently — but it still reads every report. The note surfaces unanimity without eliminating deliberation.

**Implementation:**
```javascript
// After challengers complete, before Caesar
const allSound = valid.every(c => /SOUND/i.test(c))
const benchClean = !benchMetrics || (/TESTS_FAILED:\s*0/.test(benchMetrics) && /LINT_ERRORS:\s*0/.test(benchMetrics))
const unanimityNote = (allSound && benchClean)
  ? `\n⚠️ NOTE: All ${valid.length} challengers independently verdicted SOUND and benchmarks are clean. This increases prior probability of ACCEPT — but Caesar must still verify each challenger cited exhaustive evidence of what they checked, not just a SOUND token without citation.\n`
  : ''

// Prepend unanimityNote to Caesar's prompt (inside the challenger reports section)
```

**Effort:** Very low (3-line conditional + string prepend)
**Risk:** None — Caesar still deliberates. Unanimity note reduces deliberation depth only when evidence is genuinely exhaustive.
**Expected gain:** ~10-15% reduction in Caesar's output tokens on clean runs (faster deliberation, fewer paragraphs). No token savings on Caesar's input. Wall-clock savings ~5-8s.

### P3: Hybrid Caesar Verdict — Free-Text Reasoning + Structured Summary [RIGOR: +parseability, TOKEN: ~5-8%]

> **Revised** — original proposal (pure JSON schema for Caesar) withdrawn. "Let Me Speak Freely?" research demonstrates 10-30% reasoning quality degradation under strict JSON constraints for nuanced judgment tasks. Caesar's work is reasoning-heavy; the ROUTE_SCHEMA pattern works for Lanista (classification) but is inappropriate for judgment. The rigor gain in the original proposal was in parseability, not judgment quality — that claim was wrong.

**What:** Hybrid approach. Caesar reasons freely in prose (no schema constraint on the reasoning section), then appends a compact structured JSON block at the end for machine parsing. This preserves deliberation quality while enabling downstream tooling to parse verdict, upheld objections, and required actions without regex heuristics.

**Implementation:**
```javascript
// Caesar prompt: instruct free reasoning, then append structured block
const caesarPrompt = `...your existing prompt...

After your full reasoning, append a JSON block (do not truncate your reasoning to fit the schema):
\`\`\`json
{
  "verdict": "ACCEPT|REVISE|REJECT",
  "upheld": [{"severity":"BLOCKER|MAJOR|MINOR","source":"challenger-N","summary":"<1 sentence>"}],
  "required_actions": [{"priority":1,"action":"<what>","where":"<file:line or component>"}],
  "bottom_line": "<1 sentence>"
}
\`\`\`
`
// Post-verdict: extract JSON block from free-text verdict
const jsonMatch = verdict && verdict.match(/```json\n([\s\S]*?)\n```/)
const structuredVerdict = jsonMatch ? JSON.parse(jsonMatch[1]) : null
```

**Effort:** Low (update Caesar prompt + add JSON extraction post-processing)
**Risk:** Caesar may omit or malform the JSON block — graceful fallback to regex-based parsing of free text (existing behavior). No `maxLength` constraints on any reasoning field.
**Expected gain:** ~5-8% output token reduction (structured block is more compact than equivalent prose). Eliminates regex ambiguity in downstream verdict parsing. Maintains full reasoning quality.

### P4: DAR-Based Challenger Digest for Caesar [TOKEN: ~8-12%]

> **Updated** — original severity-based filtering replaced with DAR (Diversity-Aware Message Retention, arxiv:2603.20640). DAR's core insight: retain disagreements, not agreements. When two challengers both flag the same issue, one report is redundant for Caesar. When they disagree (one says SOUND, another says BLOCKER on the same area), that disagreement is maximally informative. Severity filtering misses this.

**What:** Before passing challenger reports to Caesar, apply DAR-style selection: extract all objections, cluster by topic similarity, retain the highest-severity + most-distinct objection per cluster. Include "What holds up" sections only from challengers whose overall verdict is not SOUND. Challengers that are pure SOUND → compress to a 1-line "Challenger N: SOUND — checked [angle], found nothing." stub.

**Implementation:**
```javascript
// After challengers complete, before Caesar
const digestedCritiques = valid.map((c, i) => {
  const isSound = /##\s*Verdict[\s\S]*?SOUND/.test(c)
  if (isSound) {
    // Compress SOUND challengers to stub — retain what they checked as evidence of exhaustiveness
    const angle = contestAngles[i] || `challenger-${i+1}`
    return `Challenger ${i+1}: SOUND — exhaustively checked "${angle}", found no objections.`
  }
  // For non-SOUND challengers: keep full BLOCKER/MAJOR objections + verdict, drop MINOR objections
  const blockerMajor = (c.match(/- \*\*(BLOCKER|MAJOR)\*\*[\s\S]*?(?=- \*\*|##|$)/g) || []).join('\n')
  const verdict = c.match(/##\s*Verdict[\s\S]*?(?=##|$)/)?.[0] || ''
  return `Challenger ${i+1} (${route.contesters[i % route.contesters.length]?.name}):\n${blockerMajor}\n${verdict.trim()}`
})
// Pass digestedCritiques to Caesar; Caesar still receives full artifact
```

**Effort:** Low (string extraction + DAR-style filtering before Caesar prompt)
**Risk:** Clustering by topic similarity requires either embedding-based comparison (heavyweight) or heuristic keyword matching (lightweight but imprecise). Use keyword matching as v1; upgrade to embeddings if false-negative rate is high.
**Expected gain:** ~8-12% reduction in Caesar's input tokens. More signal density per token passed to judge. DAR-style retention ensures disagreements (the most informative signal) are always preserved.

**New Source:** DAR (Diversity-Aware Message Retention) — arxiv.org/abs/2603.20640

### P5: Parallel Benchmarker + Challengers [SPEED: +20-30%]

**What:** For mutating intents, run the Benchmarker in parallel with Challengers instead of sequentially after them. The Benchmarker reads the branch independently — no dependency on challenger output.

**Implementation:**
```javascript
phase('Giao chien + Do luong')
const [critiques, benchMetrics_] = await parallel([
  // Challengers as a group
  async () => {
    const results = await parallel(
      Array.from({ length: n }, (_, i) => () => agent(/* challenger prompt */))
    )
    return results
  },
  // Benchmarker (if mutating)
  async () => {
    if (!route.mutates_files || !branch) return null
    return agent(/* benchmarker prompt */)
  }
])
```

**Effort:** Low (restructure parallel calls)
**Risk:** None — benchmarker and challengers are independent readers of the same branch.
**Expected gain:** 20-30% wall-clock time reduction on mutating intents (benchmarker runs during challenger execution, not after).

### P6: Baseline Diversity-Preserved Model Assignment [TOKEN: ~3-5% on clean runs]

> **Redesigned** — original proposal (haiku-first uniformity, all challengers start on haiku) withdrawn. Internal contradiction: the original report praised model tier diversity as Architectural Strength #4, then proposed replacing it with haiku uniformity. Two-pass escalation also adds wall-clock latency (sequential passes vs. single parallel pass). OI-MAS figures corrected: actual gains are **up to 79.78%** compute reduction (not "30-50%" as originally stated) — but arena already implements the core technique via `contesterModels` assignments from the Lanista, making P6 a marginal refinement, not a new capability.

**What:** Preserve the existing model diversity assignment from the Lanista (`contesterModels`). Marginal refinement: for `implement` intent with N=3 and ONLY when the Lanista assigns all three challengers to opus/sonnet (no haiku), downgrade the third challenger to haiku if that challenger's angle is explicitly mechanical (e.g., "lint errors", "missing tests" — tasks where haiku suffices). This applies ONLY to the additional challengers beyond the routing table's minimum required N per skill, never to the primary skill coverage.

**Implementation:**
```javascript
// Only downgrade if: implement intent, 3 challengers, third angle is mechanical
const downgradedModels = contesterModels.map((m, i) => {
  const angle = contestAngles[i] || ''
  const isMechanical = /lint|format|missing test|syntax/i.test(angle)
  // Downgrade 3rd challenger only when all 3 are non-haiku AND angle is mechanical
  if (i === 2 && isMechanical && !contesterModels.slice(0,2).includes('haiku')) return 'haiku'
  return m
})
```

**Effort:** Very low (post-Lanista model array adjustment, 8 lines)
**Risk:** Misclassifying a non-mechanical angle as mechanical → haiku misses subtle bugs. Mitigate: conservative regex, prefer `sonnet` on ambiguous angles.
**Expected gain:** ~3-5% token reduction on `implement` runs where third challenger angle is mechanical. Preserves model diversity for all other cases. Correctly frames OI-MAS as already-implemented (via Lanista), not a new technique.

### P7: Compressed Routing Table [TOKEN: -5%]

**What:** The Lanista's routing table is ~800 tokens of formatted text. Compress it into a compact lookup format that preserves all information in fewer tokens.

**Implementation:**
```javascript
// Before (verbose)
const ROUTING_TABLE = `
- implement / code / build / add feature  -> producer ck:cook (dir cook, mutates=true) | n=3 | contesters [ck:code-review...`

// After (compact)
const ROUTING_TABLE = `
impl|cook|T|3|code-review,security,test|bugs,holes,regressions
plan|plan|F|2|predict,scenario|assumptions,edge-cases,overeng
fix|fix|T|2-3|debug,code-review,+test(logic)|root-cause,regress
debug|debug|F|3|debug|hypotheses(distinct)
research|research|F|2-3|research|claims,disconfirm
security|security|F|3|security|holes
review|code-review|F|3|code-review,security|bugs,holes
bench|bench|T|3|code-review,test|metrics,flakiness`
```

**Effort:** Very low (string replacement)
**Risk:** Lanista may misparse compact format. Mitigate: add a 1-line legend at top.
**Expected gain:** ~400 tokens saved per run. Small but free.

### P8: ~~Complexity-Based Challenger Count~~ — WITHDRAWN

> **Withdrawn.** The routing table's per-intent N assignments encode domain expertise (skill diversity), not task complexity. For `implement`, N=3 because three DIFFERENT skills are needed: code-review, security, test. Reducing N based on complexity would drop a skill perspective entirely — e.g., a "low complexity" implement run that skips the security challenger could miss an exploitable input handling bug. Complexity heuristics cannot override skill-coverage requirements.
>
> **If complexity-based reduction is needed in the future:** modify only within the routing table's specified range per intent, never below the intent's minimum required skills. E.g., `fix` allows 2-3 challengers — low-complexity fix gets 2, not 1. This would be a routing table annotation change, not a runtime override.

### P9: Reuse Gladiator Context for Same-Branch Challengers [SPEED: +10%]

**What:** For mutating intents, challengers currently re-read the branch code via their skill. If the Gladiator already reported file:line changes, pass those directly to challengers as a structured diff instead of having each one independently discover the changes.

**Implementation:** Include `git diff main...HEAD` output from the worktree as a pre-computed context block in each challenger prompt. Replaces each challenger's independent file discovery.

**Effort:** Low (add diff extraction after Gladiator, include in challenger prompt)
**Risk:** Diff may be large for big changes. Mitigate: truncate to 500 lines, include full file list.
**Expected gain:** 10% speed improvement (challengers skip file discovery). Slight token increase from diff but offset by faster convergence.

### P10: Verdict Caching for Repeated Intents [SPEED: +50% on cache hit]

**What:** For non-mutating intents (plan/research/review), if the same prompt was previously judged ACCEPT and the relevant code hasn't changed (same git SHA), return cached verdict. Uses `git rev-parse HEAD` as cache key.

**Implementation:**
```javascript
const cacheKey = `${route.intent}:${prompt.slice(0,100)}:${gitSha}`
const cached = cache.get(cacheKey)
if (cached && !route.mutates_files) {
  log('Cache hit — returning previous ACCEPT verdict')
  return cached
}
```

**Effort:** Medium (requires cache layer — file-based or in-memory)
**Risk:** Stale results if code changed outside git (unlikely). Mitigate: include file mtime hash in cache key.
**Expected gain:** 50%+ time savings on repeated runs of same query. Rare in practice but useful for iterative workflows.

---

## Impact Summary Matrix

> Savings against ~50K-token baseline (non-mutating, N=3). Not additive — shared baselines overlap.

| Proposal | Token Savings | Speed Gain | Rigor Gain | Effort | Status |
|---|---|---|---|---|---|
| **P1: Artifact Digest** | ~8-12% (mutating only, >150 lines) | +5% | neutral | Low | ✅ Revised |
| **P2: Unanimity Pre-Digest** | ~0% input, ~5-8% Caesar output | +5-8% | neutral | Very Low | ✅ Redesigned |
| **P3: Hybrid Caesar Verdict** | ~5-8% | neutral | +parseability | Low | ✅ Revised |
| **P4+DAR: Challenger Digest** | ~8-12% | neutral | +signal density | Low | ✅ Updated |
| **P5: Parallel Bench** | 0% | +20-30% | neutral | Low | unchanged |
| **P6: Diversity-Preserved Assignment** | ~3-5% (implement, mechanical angle) | neutral | neutral | Very Low | ✅ Redesigned |
| **P7: Compact Routing** | ~1% | neutral | neutral | Very Low | unchanged |
| **P8: Complexity-Based N** | — | — | — | — | ❌ Withdrawn |
| **P9: Pre-computed Diff** | ~2-5% | +10% | neutral | Low | unchanged |
| **P10: Verdict Cache** | 50%+ (cache hit) | +50% | neutral | Medium | unchanged |

**Combined realistic savings (P1+P2+P3+P4+P7, non-additive):** ~15-25% tokens, 20-35% wall-clock on typical runs.

### Recommended Implementation Order (effort-to-impact ratio)

1. **P2** (unanimity pre-digest for Caesar) — 3 lines, no rigor loss
2. **P7** (compact routing table) — string replacement, ~500 free tokens
3. **P5** (parallel benchmarker) — restructure parallel calls, big speed win
4. **P4+DAR** (challenger digest with diversity retention) — string parsing + DAR selection
5. **P3** (hybrid Caesar verdict) — update prompt + JSON extraction post-process
6. **P6** (baseline diversity-preserved model assignment) — 8-line conditional
7. **P1** (artifact digest, mutating-only) — conditional compressor agent, solid token win on large code outputs
8. **P9** (pre-computed diff) — nice-to-have speed boost
9. **P10** (verdict cache) — only if repeated runs are common

---

## Implementation Roadmap

### Wave 1: Quick Wins (~1 hour)
- P2: Unanimity pre-digest note for Caesar
- P7: Compress routing table string
- P5: Parallel benchmarker + challengers
- P6: Diversity-preserved model assignment (8-line conditional)

**Expected combined gain:** ~5-10% token reduction, 20-30% wall-clock improvement

### Wave 2: Digest & Schema Layer (2-4 hours)
- P4+DAR: Challenger digest with diversity-aware retention
- P3: Hybrid Caesar verdict (free-text + JSON block)

**Expected combined gain:** additional ~12-18% token reduction, improved Caesar signal density and parse reliability

### Wave 3: Compression & Caching (4-8 hours)
- P1: Artifact digest (mutating-only, >150 lines threshold)
- P9: Pre-computed diff context
- P10: Verdict caching (only if repeated-run patterns observed)

**Expected combined gain:** additional ~8-15% on mutating intents with large code outputs

---

## Sources & References

### Academic / Research
- [D3: Debate, Deliberate, Decide — Cost-Aware Adversarial Framework](https://arxiv.org/abs/2410.04663) — budgeted stopping, 40% token reduction
- [SkillReducer: Optimizing LLM Agent Skills for Token Efficiency](https://arxiv.org/pdf/2603.29919) — 26-54% peak token reduction
- [CompactPrompt: Unified Pipeline for Prompt Compression](https://arxiv.org/html/2510.18043v1) — 60% reduction, <5% accuracy drop
- [OI-MAS: Confidence-Aware Routing for Multi-Agent Collaboration](https://arxiv.org/pdf/2601.04861) — 30-50% compute reduction
- [Multi-Agent Debate with Adaptive Stability Detection](https://openreview.net/forum?id=Vusd1Hw2D9) — early termination on debate convergence
- [DAR: Diversity-Aware Message Retention for Multi-Agent LLM Judgment](https://arxiv.org/abs/2603.20640) — retain disagreements, compress agreements; 30-50% judge input token reduction
- [Wrong-Consensus Rate in Single-Round Unanimity Stopping](https://arxiv.org/abs/2509.05396) — 17.4% wrong-consensus rate; basis for P2 redesign
- [RCR-Router: Role-Aware Context Routing](https://arxiv.org/pdf/2508.04903) — structured memory for routing
- [Agent-as-a-Judge for LLM Evaluation](https://arxiv.org/html/2508.02994v1) — judge evaluation patterns
- [Courtroom-Style Multi-Agent Debate](https://arxiv.org/html/2603.28488v1) — adversarial verification
- [AdaptOrch: Task-Adaptive Multi-Agent Orchestration](https://arxiv.org/pdf/2602.16873) — adaptive orchestration
- [Compact Constraint Encoding for LLM Code Generation](https://arxiv.org/pdf/2604.07192) — token economics

### Industry / Production
- [Multi-Agent in Production 2026: What Actually Survived](https://medium.com/@Micheal-Lanham/multi-agent-in-production-in-2026-what-actually-survived-f86de8bb1cd1) — phase gates, shared artifacts
- [Claude Code Dynamic Workflows — Official Blog](https://claude.com/blog/introducing-dynamic-workflows-in-claude-code) — workflow primitives
- [Claude Code Workflow Docs](https://code.claude.com/docs/en/workflows) — agent/parallel/pipeline API
- [Token Optimization Strategies for Cost-Effective LLM Apps](https://dasroot.net/posts/2026/04/token-optimization-llm-costs-prompt-engineering/) — practical optimization patterns
- [Prompt Compression: 8 Techniques to Reduce LLM Costs](https://www.morphllm.com/prompt-compression) — compression techniques guide
- [AI Agent Context Compression Strategies](https://zylos.ai/research/2026-02-28-ai-agent-context-compression-strategies/) — ACON framework
- [Why Multi-Agent LLM Systems Fail](https://galileo.ai/blog/multi-agent-llm-systems-fail) — failure modes and mitigations

---

## Unresolved Questions

1. ~~**Compressor agent cost-benefit threshold:**~~ **RESOLVED** — P1 sets 150-line threshold: compressor cost ~2K tokens, savings only positive above this size. Artifacts ≤150 lines skip compression entirely.
2. **Haiku reliability for fast scan (P6):** Can the mechanical-angle challenger reliably detect BLOCKER-level issues at reduced token budget? Needs A/B testing after P6 deployment.
3. **Pipeline primitive availability:** Does the current Workflow engine version support nested `parallel()` inside `parallel()` (needed for P5)? The docs mention `pipeline()` but the arena currently only uses `parallel()` and `agent()`.
4. ~~**Schema-constrained Caesar (P3) quality:**~~ **RESOLVED** — P3 redesigned as hybrid: Caesar reasons in free text first, then appends a compact structured JSON block. "Let Me Speak Freely?" degradation risk eliminated; parseability gain retained.
5. **Cache invalidation (P10):** For non-mutating intents like "research", the git SHA doesn't capture external knowledge changes. May need time-based TTL as secondary invalidation.
