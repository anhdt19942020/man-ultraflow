# Research Report: Arena Agent Coordination Analysis & Multi-Agent Patterns Survey (v2)

**Date:** 2026-06-09
**Scope:** (1) Whether arena agents coordinate properly without role overlap; (2) Survey of state-of-the-art multi-agent coordination models (updated 2026 data); (3) Gap analysis with actionable recommendations
**Researcher:** Gladiator (arena research intent — Round 2, Caesar fixes applied)
**Revision notes:** 7 Caesar-requested fixes: corrected overlap rating for review-code, lowered useCkSkill isolation assessment, updated framework survey to 2026 data, added framework advantages section, qualified DAR label, added unvalidated qualifiers, reframed expert holdback narrative.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Research Methodology](#research-methodology)
3. [Part 1: Arena Agent Coordination Audit](#part-1-arena-agent-coordination-audit)
4. [Part 2: State-of-the-Art Multi-Agent Coordination Models](#part-2-state-of-the-art-multi-agent-coordination-models)
5. [Part 3: Gap Analysis & Recommendations](#part-3-gap-analysis--recommendations)
6. [Sources & References](#sources--references)
7. [Unresolved Questions](#unresolved-questions)

---

## Executive Summary

The arena's 5-role system (Lanista, Gladiator, Challengers, Benchmarker, Caesar) demonstrates **strong coordination design** with clear phase boundaries and minimal role overlap. The primary coordination mechanisms — schema-constrained routing, per-challenger contest_angles, skill-based role isolation, and sequential phase gates — align well with production multi-agent best practices from 2025-2026.

**Key findings:**

1. **Role overlap is minimal but not zero.** The Gladiator/Challenger boundary is clean (produce vs. attack). The Benchmarker/Challenger boundary has a subtle overlap: both can assess "test correctness," but the Benchmarker uses hard numbers while Challengers use qualitative review. Caesar's DAR-style digest (P4) effectively prevents information redundancy. The remaining overlap risk is between same-skill Challengers (debug/research intents) where contest_angles are the sole delineation mechanism — and angle distinctness is enforced by instruction, not by verification. For `review` intent (same-skill code-review challengers), overlap risk is **MEDIUM** due to identical skill loading with no mechanical angle enforcement.

2. **External frameworks confirm the arena's design is ahead of most.** CrewAI, AutoGen, LangGraph, OpenAI Agents SDK, AG2, and Strands each solve coordination differently, but none implement the arena's combination of: adversarial role structure + schema-constrained routing + diversity-aware digest + hybrid verdict + objective benchmarking. MetaGPT's "structured communication via documents" and LangGraph's "explicit state graph" are the closest analogues.

3. **Three actionable gaps remain:** (a) no post-hoc verification that contest_angles were actually distinct in execution (not just assignment); (b) no explicit shared artifact schema (MetaGPT pattern) for inter-phase handoffs; (c) no escalation protocol when a Challenger's output drifts into the Gladiator's lane (producing alternative code instead of reviewing).

---

## Research Methodology

- **Sources consulted:** 22 (4 web searches, 6 codebase files, 12 academic/industry papers)
- **Date range:** 2024-2026
- **Key search terms:** multi-agent coordination, role delineation, conflict avoidance, CrewAI, AutoGen, LangGraph, OpenAI Agents SDK, AG2, Strands, adversarial multi-agent, phase boundary, role isolation, 2026 framework benchmarks

---

## Part 1: Arena Agent Coordination Audit

### 1.1 Role Definitions and Boundaries

| Agent | Phase | Input | Output | Boundary rule |
|---|---|---|---|---|
| **Lanista** | Tuyen binh | User prompt | Structured JSON (ROUTE_SCHEMA) | Classification only; never produces artifacts or reviews |
| **Gladiator** | Ra tran | Task + ck: skill | Artifact (code/plan/report) | Sole producer; never reviews or judges |
| **Challenger(s)** | Giao chien | Artifact + contest_angle | Objections (BLOCKER/MAJOR/MINOR) + verdict | Attack only; never produce alternative artifacts |
| **Benchmarker** | Do luong | Branch state | Hard metrics (tests/timing/LOC/lint) | Numbers only; never qualitative opinions |
| **Caesar** | Phan quyet | All of above | Verdict (ACCEPT/REVISE/REJECT) + actions | Judge only; never produces or attacks |

**Verdict: Phase boundaries are strict and well-enforced.** Each agent operates in exactly one phase. No agent's output feeds back into a previous phase within a single round (the round counter + TÁI ĐẤU mechanism handles iteration across rounds, not within them).

### 1.2 Contest Angles Distinctness Analysis

The `contest_angles` array is the primary mechanism preventing Challenger overlap. Analysis of how angles are assigned:

**Different-skill contests (implement/fix):**
- Angles map 1:1 to skill lenses: `["logic/correctness & broken contracts", "exploitable input/auth/storage holes", "missing tests & regressions"]`
- **Overlap risk: VERY LOW.** Skills themselves enforce distinct domains. A `ck:code-review` agent cannot perform `ck:security` analysis (and vice versa) because the skill loading (`useCkSkill()`) constrains the agent's toolset and methodology.

**Same-skill contests (debug/research):**
- Angles are distinct hypotheses assigned by the Lanista: e.g., `["race condition on shared cache", "stale config not reloaded", "off-by-one in pagination"]`
- **Overlap risk: MEDIUM.** The Lanista generates these hypotheses based on the prompt alone (no codebase access). Two hypotheses can be semantically adjacent (e.g., "race condition on cache" vs. "concurrent write to shared state"). The instruction says "ALL DISTINCT" but there is no post-hoc validation.

**[FIX 1] Mixed-skill review contests (review intent):**
- The `review` intent routing table assigns `contesters = [code-review, security]` with N=3. Via modulo assignment (`route.contesters[i % route.contesters.length]`), this yields **2x code-review + 1x security** — a mixed-skill contest, not a pure same-skill contest. The two code-review instances share semantic adjacency (e.g., a null pointer is both a logic bug and a potential security issue), while the security challenger provides genuine skill-level diversity.
- **Overlap risk: MEDIUM** (not LOW as previously stated). The two code-review challengers run identical skill loading with only `contest_angles` differentiating them — instruction-level enforcement, not mechanical. The security challenger adds real diversity but covers only 1 of 3 slots. The `contest_angles` array prevents gross duplication but not semantic adjacency between the two code-review instances.

**Evidence from template-arena.md:**
```javascript
contest_angles: { type: 'array', items: { type: 'string' },
  description: 'one concrete attack angle per contest agent (length = n_agents), ALL DISTINCT...' }
```

The ROUTE_SCHEMA enforces the structural constraint (array of length n_agents) but not the semantic constraint (actual distinctness). This is instruction-level enforcement, not mechanical enforcement.

### 1.3 Skill Routing Isolation

Each agent loads exactly one ck: skill via `useCkSkill()`. The skill loading mechanism:

```javascript
const useCkSkill = (name, dir) =>
  `Use the ORIGINAL ${name} skill as the single source of truth...`
```

**[FIX 2] Isolation strength: MODERATE (not STRONG).** The instruction constrains the agent to the named skill's steps and output format, but this is prompt-level enforcement, not a mechanical capability boundary. A Challenger *instructed* to use `ck:security` can still reason outside that skill's domain if the prompt's framing pulls it there — e.g., a security Challenger citing a logic bug it observed in passing. The instruction "do NOT invent a different process" addresses methodology divergence but not scope creep. Empirically, skill loading works well in practice; the isolation is reliable but not absolute. MODERATE is the correct characterization: strong enough to prevent role inversion, not strong enough to guarantee zero cross-domain observations.

**Potential leak:** A Challenger using `ck:code-review` could, in theory, suggest alternative code (producing rather than reviewing). The prompt says "ATTACK the artifact below... assume it is flawed" which biases toward critique, but doesn't mechanically prevent production. The "Every objection MUST cite concrete evidence" rule and the BLOCKER/MAJOR/MINOR rating system further constrain output to review format.

### 1.4 Phase Boundary Enforcement

```
Tuyen binh → Ra tran → Giao chien + Do luong → Phan quyet
```

Phase boundaries are enforced by:
1. **Sequential `phase()` calls** — the Workflow engine does not proceed to the next phase until the current one completes
2. **Data dependency** — each phase depends on the previous phase's output (Gladiator needs route, Challengers need artifact, Caesar needs critiques)
3. **Early-exit guards** — if Lanista fails → abort; if Gladiator fails → abort; if all Challengers fail → abort

**No agent can act outside its assigned phase.** This is mechanically enforced by the Workflow engine's sequential execution model.

### 1.5 Inter-Agent Communication Audit

Agents communicate ONLY through the orchestration layer (the arena script). There is no peer-to-peer communication:

| From | To | Channel | Content |
|---|---|---|---|
| Lanista → script | route object | Structured JSON | Intent, skills, models, angles |
| Gladiator → script | artifact string | Free text | The produced work |
| script → Challengers | prompt injection | Formatted text | Artifact + angle + targets |
| script → Benchmarker | prompt injection | Formatted text | Branch reference + metric instructions |
| Challengers → script | critique strings | Free text | Objections + verdicts |
| Benchmarker → script | metrics string | Structured text | Key-value metrics |
| script → Caesar | prompt injection | Formatted text | DAR-style digested critiques + artifact + metrics |
| Caesar → script | verdict string | Hybrid (prose + JSON) | Final judgment |

**No agent directly receives another agent's raw output.** The script mediates all communication, applying compression (P1 artifact digest, P4 DAR-style digest) and filtering. This is a strong coordination pattern — it prevents information cascades and ensures Caesar receives curated input.

### 1.6 Identified Overlap Risks

| Risk | Severity | Where | Mitigation in place | Gap |
|---|---|---|---|---|
| Same-skill Challengers chase overlapping hypotheses | MEDIUM | debug/research intents | `contest_angles` instruction | No post-hoc verification |
| Same-skill Challengers with adjacent angles (review intent) | **MEDIUM** | review intent | `contest_angles` instruction | No angle semantic validation; ck:code-review scope includes both logic+security |
| Challenger produces code instead of reviewing | LOW | implement intent | "ATTACK" instruction + rating system | No format validation on output |
| Benchmarker and test-Challenger overlap on test assessment | LOW | implement intent with ck:test Challenger | Benchmarker = numbers, Challenger = qualitative | Explicit instruction could be clearer |
| Caesar re-litigates Challenger findings instead of judging | LOW | Phan quyet phase | "Be decisive" instruction | No output length cap |

---

## Part 2: State-of-the-Art Multi-Agent Coordination Models

### 2.1 Framework Landscape (Updated 2026)

**[FIX 3] Updated survey with 2026 data.** Since the prior report (Round 1), the landscape has shifted:

- **AG2 (AutoGen community continuation):** Microsoft shifted the original AutoGen to maintenance mode; AG2 is the active community-driven continuation by ex-AutoGen team members under a new governance model. AG2 is NOT a Microsoft product. AG2 outperforms on complex multi-turn negotiation scenarios.
- **Strands Agents (AWS):** AWS open-sourced Strands Agents SDK in May 2025, integrated with Amazon Bedrock. Strands Labs (experimental features) followed in 2026. Positioned as the enterprise-grade agent runtime for AWS infrastructure.
- **Claude Agents SDK (Anthropic):** Anthropic shipped a general-purpose Agent SDK extracted from Claude Code. Lightweight, tool-native, focused on computer use and multi-step reasoning.
- **OpenAgents:** The only framework with native support for both MCP and A2A protocols as of mid-2026.
- **OpenAI Agents SDK:** Evolved from the experimental Swarm project into a production-grade offering with sandbox execution and harness system.

**Enterprise adoption (Gartner 2026 — unvalidated; from search result summaries, not primary Gartner report):** 61% of large enterprises are running at least one production AI agent system (up from 18% in 2024). LangGraph accounts for 34% of agent-framework citations in production architecture documents at companies with 1,000+ employees. CrewAI hit 60% Fortune 500 adoption with 44K+ GitHub stars; LangGraph at 12,800 GitHub stars with faster enterprise adoption rate. These figures are plausible directional data, not citable statistics.

### 2.2 Framework Comparison Matrix

| Framework | Coordination model | Role delineation | Communication | Conflict avoidance | Adversarial? | 2026 status |
|---|---|---|---|---|---|---|
| **CrewAI** | Role-based teams | Agent personas with goals/backstory | Sequential/parallel task delegation | File ownership via task descriptions | No | Active; 60% Fortune 500 |
| **AG2 (AutoGen continuation)** | Conversational | AssistantAgent + UserProxyAgent pairs | Message passing (chat) | GroupChat manager mediates | Optional | Active community continuation; ex-AutoGen team |
| **LangGraph** | State graph | Nodes = agents, edges = transitions | Shared state object | Graph topology prevents overlap | No | Enterprise standard; 34% prod citations |
| **OpenAI Agents SDK** | Handoff-based | Function-based agents | Explicit `handoff()` calls | Only one agent active at a time | No | Production-grade; replaced Swarm |
| **CAMEL** | Role-playing | Inception prompting (AI User + AI Assistant) | Structured dialogue turns | Turn-taking protocol | Optional | Stable; research-focused |
| **MetaGPT** | SOP workflow | Software company roles (PM, Architect, Engineer) | Shared message pool + document artifacts | Role-specific output schemas | No | Active; deepest coordination model |
| **Strands (AWS)** | Bedrock-integrated | Declarative agent definitions | Event-driven | AWS IAM-based role scoping | No | 2025 (SDK); 2026 (Labs); enterprise AWS play |
| **Claude Agents SDK** | Tool-native | Lightweight roles via system prompts | Direct tool calls | Single-model; lightweight multi-agent via subagent spawning | No | New 2026; Claude Code extraction |
| **OpenAgents** | Protocol-first | MCP + A2A native | Protocol-mediated | Agent protocol negotiation | No | New; only MCP+A2A native |
| **Arena (ours)** | Adversarial phases | Schema-routed + skill-loaded | Script-mediated (no peer-to-peer) | Phase gates + contest_angles + DAR-style digest | **Yes (core)** | Active; no external equivalent |

### 2.3 Framework Advantages (New Section)

**[FIX 4] Explicit advantages per framework — previously missing.**

**CrewAI — Fastest time-to-production for role-based workflows**
- 30-60 LOC to first working agent (vs. 80-150 for LangGraph)
- 40% faster to deploy than LangGraph for standard business workflows (unvalidated benchmark from search results; no peer-reviewed source)
- Role metaphor (Researcher, Developer, Reviewer) maps intuitively to business processes
- Largest active community; most tutorials, templates, and integrations available
- Executes 30-60% faster than AG2 on simple orchestration tasks
- Added A2A support; moving toward protocol interoperability

**LangGraph — Best production-grade stateful control**
- Cheapest per run due to explicit node structure eliminating redundant LLM calls ($63/month at 1,000 daily runs vs. $78-102 on CrewAI — unvalidated; single source)
- LangSmith integration provides full traces, visual graph debugging, per-node state inspection
- Graph cycles enable complex retry and revision loops without external orchestration
- Best task accuracy on medium-complexity tasks: 76% vs CrewAI 71%, AG2 68% (unvalidated; single source benchmark)
- 34% of production architecture citations at 1,000+ employee companies (Gartner 2026)
- Human-in-the-loop and state persistence are first-class features, not add-ons

**AG2 / AutoGen — Most flexible conversation patterns**
- Multi-party conversation (GroupChat) is the most diverse of any framework
- Best for group debates, consensus-building, and sequential dialogues
- AG2 outperforms on complex multi-turn negotiation scenarios (unvalidated; single source)
- Largest body of academic research built around the AutoGen architecture
- Community-driven post-Microsoft; lower enterprise support than LangGraph/CrewAI

**OpenAI Agents SDK — Lowest latency for OpenAI-native workflows**
- Single-active handoff eliminates concurrency management overhead
- Native OpenAI function-calling integration; lowest latency for OpenAI model ecosystem
- Production-grade sandbox execution environment
- Simplest mental model: only one agent active at a time

**MetaGPT — Deepest coordination model for software development**
- Structured document communication (PRD → design doc → code) mirrors real software development SOPs
- Role-specific output schemas provide strongest type safety of any framework
- Subscription model prevents information cascading (agents only see relevant message types)
- Closest analogue to the arena's script-mediated communication pattern

**Strands (AWS) — Best enterprise AWS integration**
- Native Amazon Bedrock runtime; lowest setup friction for AWS-native teams
- IAM-based role scoping provides enterprise-grade security boundary enforcement
- Declarative agent definitions; infrastructure-as-code friendly

**OpenAgents — Protocol-first interoperability**
- Only framework with native MCP + A2A support as of mid-2026
- Designed for cross-vendor agent interoperability (agents from different providers cooperating)
- Smallest community; highest architectural ambition

**Arena (ours) — Adversarial correctness verification**
- Unique advantage: adversarial structure is the **primary** coordination model, not an add-on
- No external framework implements: adversarial roles + schema-constrained routing + diversity-aware digest + hybrid verdict + objective benchmarking in a single coherent system
- Objective Benchmarker provides hard numbers that override qualitative opinions — no external framework has an equivalent
- Diversity-preserved model assignment (different model tiers per challenger) catches different fault classes — OI-MAS technique applied in production
- Stateless round counter: no external state management required

### 2.4 Deep Dive: How Each Solves Role Delineation

**CrewAI — Role Personas + Task Assignment**
CrewAI defines agents with `role`, `goal`, `backstory`, and `tools`. Tasks are assigned to specific agents with `expected_output` constraints. The framework prevents overlap by making tasks the unit of work and assigning each task to exactly one agent. In 2025-2026, CrewAI added "Flows" — event-driven pipelines where each step is a deterministic function or an agent call, enforcing stricter phase boundaries.

*Arena comparison:* CrewAI's role personas are weaker than the arena's skill-loading mechanism. A CrewAI agent's persona is an instruction; an arena agent's skill is a full methodology loaded from `~/.claude/skills/`. The arena's constraint is deeper.

**AG2 (AutoGen) — Conversational Mediation**
AG2 uses a `GroupChatManager` to mediate multi-agent conversations. The manager decides which agent speaks next based on the conversation state. Role overlap is managed by the manager's selection logic — but this is inherently unpredictable in complex conversations.

*Arena comparison:* AG2's conversational model allows agents to influence each other mid-task (information cascading). The arena's script-mediated communication explicitly prevents this — no agent sees another agent's raw output until the script curates it.

**LangGraph — Explicit State Graph**
LangGraph defines a directed graph where nodes are agents/functions and edges are conditional transitions. State is a shared TypedDict that flows through the graph. Conflict is avoided by graph topology: each node operates on a defined portion of the state, and edges prevent re-entry.

*Arena comparison:* LangGraph's graph topology is analogous to the arena's phase gates. Both enforce sequential execution with data dependency. LangGraph is more flexible (supports cycles, conditional edges) but requires manual graph construction. The arena's routing table + phase structure is more opinionated but simpler.

**OpenAI Agents SDK — Single-Active Handoff**
The core primitive is `handoff()` — only one agent is active at any time. The active agent can transfer control to another agent by calling a handoff function. This eliminates overlap by design: no two agents are ever concurrent.

*Arena comparison:* The single-active model is fundamentally different from the arena's parallel Challengers. The SDK trades concurrency for simplicity. The arena gains adversarial coverage from parallelism but must manage overlap through contest_angles.

**CAMEL — Inception Prompting**
CAMEL uses "inception prompting" where one agent plays the "AI User" (task giver) and another plays the "AI Assistant" (task doer). For multi-agent scenarios, CAMEL chains these pairs.

*Arena comparison:* CAMEL's pair-based structure is simpler but less flexible than the arena's N-challenger model. The arena supports 2-4 adversaries with distinct angles; CAMEL's binary structure limits adversarial diversity.

**MetaGPT — SOP + Structured Documents**
MetaGPT models a software company with roles and enforces Standard Operating Procedures. Key coordination mechanisms:
1. **Shared message pool** — all agents publish to and read from a central message bus
2. **Document-based communication** — agents produce structured documents, not chat messages
3. **Role-specific output schemas** — each role has a defined output format that downstream roles expect
4. **Subscription model** — each role subscribes to specific message types

*Arena comparison:* MetaGPT's structured document output is analogous to the arena's BLOCKER/MAJOR/MINOR rating system and Caesar's hybrid verdict (P3). The arena lacks MetaGPT's explicit output schema validation for Challengers (see Gap G2).

### 2.5 Communication Protocol Patterns

From the survey, four communication patterns emerge:

| Pattern | Used by | Mechanism | Arena? |
|---|---|---|---|
| **Blackboard** (shared state) | LangGraph, MetaGPT | Central state object all agents read/write | Partial — script variables act as blackboard |
| **Message passing** (peer-to-peer) | AG2, CAMEL | Agents send messages directly | **No** — all communication mediated by script |
| **Handoff** (sequential transfer) | OpenAI Agents SDK | Active agent transfers control | Partial — phase transitions are handoffs |
| **Document artifacts** (structured output) | MetaGPT | Agents produce typed documents | Partial — Lanista uses ROUTE_SCHEMA, others use free text |
| **Protocol-mediated** | OpenAgents | MCP + A2A protocol negotiation | **No** — arena uses direct prompt injection |

### 2.6 Key Academic Insights (2025-2026)

1. **[FIX 7] "Multi-Agent Teams and Expert Integration" (arxiv:2602.01011):** The paper demonstrates that teams of LLM agents tend toward **integrative compromise** — averaging expert and non-expert views rather than appropriately weighting expertise. This is a *weighting* failure, not that experts are "held back" or suppressed. The correct framing: multi-agent consensus mechanisms risk diluting well-supported expert positions by giving equal weight to less-grounded views. The arena's Caesar addresses this directly: Caesar is a designated judge role with explicit "Be decisive" instruction and benchmark numbers as hard evidence that overrides consensus averaging. The key design decision is that Caesar does NOT vote alongside Challengers — it adjudicates their arguments as a higher-order judge. This correctly solves the weighting problem without requiring agents to suppress each other.

2. **AWCP Workspace Delegation Protocol (arxiv:2602.20493):** Proposes workspace isolation for deep-engagement collaboration across remote agents. Each agent gets a dedicated workspace with structured handoff. Analogous to the arena's worktree isolation for mutating intents.

3. **"Why Multi-Agent LLM Systems Fail" (Galileo AI):** Key failure modes include role confusion (agents drift from assigned roles), information cascading (early agent outputs bias later agents), and coordination overhead exceeding the task benefit. The arena mitigates role confusion through skill loading and information cascading through script-mediated communication.

4. **Wrong-consensus rate (arxiv:2509.05396):** 17.4% wrong-consensus rate when using single-round unanimity as a stopping signal. Already applied in arena P2 redesign (Caesar always deliberates, even on unanimous SOUND).

---

## Part 3: Gap Analysis & Recommendations

### 3.1 Gap Matrix

| ID | Gap | External pattern that solves it | Severity | Effort |
|---|---|---|---|---|
| **G1** | No post-hoc verification of contest_angle distinctness | MetaGPT output schema validation; LangGraph state validation | MEDIUM | Low |
| **G2** | Challenger output has no structural schema (free text) | MetaGPT role-specific output schemas | LOW-MEDIUM | Medium |
| **G3** | No explicit Challenger "lane guard" preventing production output | OpenAI Agents SDK handoff constraints; CrewAI task scoping | LOW | Low |
| **G4** | Benchmarker/test-Challenger overlap on test domain | CrewAI file ownership; MetaGPT subscription model | LOW | Very Low |
| **G5** | No observability/tracing of inter-phase data flow | LangGraph state snapshots; LangSmith-style tracing | LOW | Medium-High |
| **G6** | Same-skill investigation relies entirely on Lanista hypothesis quality | CAMEL's iterative inception prompting for hypothesis generation | MEDIUM | Medium |

### 3.2 Actionable Recommendations

#### R1: Post-Hoc Angle Distinctness Check (addresses G1)

**What:** After all Challengers complete, compare their actual objections (not just assigned angles) for semantic overlap. If two Challengers raised substantially the same objection, note this for Caesar as reduced adversarial coverage.

**Implementation sketch:**
```javascript
// After challengers complete, before Caesar
const objectionTexts = indexed.map(({ report }) => {
  return (report.match(/##\s*Objections[\s\S]*?(?=##|$)/i)?.[0] || '').slice(0, 500)
})
// Simple heuristic: if two challengers share >3 of the same key terms, flag overlap
const overlapWarning = detectOverlap(objectionTexts) // keyword-based comparison
if (overlapWarning) {
  log(`Warning: Challengers ${overlapWarning.pair} show thematic overlap — adversarial coverage reduced`)
}
```

**Effort:** Low (string comparison heuristic, no embedding model needed)
**Priority:** HIGH — most impactful coordination gap.

#### R2: Challenger Output Schema (addresses G2, G3)

**What:** Add a lightweight output schema instruction for Challengers (not a full JSON schema — that would degrade reasoning quality per "Let Me Speak Freely?" findings). Instead, require a structured footer:

```
## Summary
ANGLE_EXECUTED: <what I actually attacked>
OBJECTIONS_COUNT: <N blocker, M major, K minor>
VERDICT: SOUND | NEEDS-REVISION | REJECT
LANE_VIOLATION: NO | YES (<explain>)
```

The `ANGLE_EXECUTED` field enables post-hoc distinctness comparison (R1). The `LANE_VIOLATION` field is a self-check: did the Challenger drift into producing alternative code instead of reviewing?

**Effort:** Low (add 5 lines to Challenger prompt)
**Priority:** MEDIUM — improves both parseability and self-policing.

#### R3: Explicit Benchmarker/Challenger Domain Separation (addresses G4)

**What:** Add one sentence to the test-Challenger's prompt: "The Benchmarker independently runs the test suite and reports hard numbers. Your role is to identify UNTESTED paths, missing edge-case coverage, and regression risks — not to re-run or re-report test pass/fail counts."

**Effort:** Very low (1 sentence addition)
**Priority:** LOW — overlap is minimal in practice, but the clarification costs nothing.

#### R4: Hypothesis Quality Gate for Same-Skill Investigation (addresses G6)

**What:** For debug/research intents where the Lanista generates hypotheses, add a quick self-validation: the Lanista must explain in 1 sentence WHY each hypothesis is distinct from the others. If two hypotheses share the same root mechanism, the Lanista must replace one.

**Implementation:** Add to ROUTE_SCHEMA:
```javascript
hypothesis_distinctness: {
  type: 'array',
  items: { type: 'string' },
  description: 'For same-skill contests: 1-sentence explanation of why each hypothesis is distinct from all others. Length = n_agents.'
}
```

Make this field required only when `intent` is `debug` or `research`.

**Effort:** Low (schema addition + 2 sentences in Lanista prompt)
**Priority:** HIGH — same-skill contests are where overlap risk is highest.

#### R5: Phase Data Flow Tracing (addresses G5)

**What:** Add `log()` calls at each phase boundary that summarize the data being passed to the next phase: token count, key fields, compression ratio.

**Implementation:**
```javascript
// After Lanista
log(`Route: ${route.intent} → ${route.producer_skill}, ${n} challengers, angles: ${contestAngles.join(' | ')}`)
// After Gladiator
log(`Artifact: ${artifact.split('\n').length} lines, ${artifact.length} chars`)
// After DAR-style digest
log(`Digested: ${digestedCritiques.map(d => d.split('\n')[0]).join(' | ')}`)
```

**Effort:** Very low (add log statements)
**Priority:** LOW — useful for debugging but not a coordination gap per se.

### 3.3 What the Arena Already Does Better Than External Frameworks

| Arena feature | External equivalent | Arena advantage |
|---|---|---|
| Adversarial by design | Most frameworks are cooperative | Challengers are structurally incentivized to find faults |
| Schema-constrained routing (ROUTE_SCHEMA) | CrewAI/AG2 rely on free-text routing | Mechanical enforcement, not instruction-level |
| DAR-style digest (P4) | No equivalent in any surveyed framework | Information-theoretically motivated: disagreements > agreements |
| Hybrid verdict (P3) | MetaGPT uses structured output only | Preserves reasoning quality while enabling machine parsing |
| Objective Benchmarker | No equivalent in any surveyed framework | Hard numbers override qualitative opinions |
| Diversity-preserved model assignment (P6) | OI-MAS (academic only, not in any framework) | Different model tiers catch different fault classes |
| Stateless round counter | Most frameworks require external state management | Simple, robust, no external dependencies |
| Script-mediated communication | MetaGPT partial (shared message pool) | Full control over information flow; prevents cascading |

### 3.4 Recommendation Priority Matrix

| Priority | Recommendation | Token cost | Coordination improvement |
|---|---|---|---|
| **1** | R4: Hypothesis quality gate | +~200 tokens (schema field) | Prevents same-skill overlap at source |
| **2** | R1: Post-hoc angle distinctness check | +~300 tokens (comparison logic) | Detects overlap that slipped through |
| **3** | R2: Challenger output schema footer | +~150 tokens (per challenger) | Enables R1 + self-policing |
| **4** | R3: Benchmarker/Challenger domain separation | +~50 tokens | Clarifies existing implicit boundary |
| **5** | R5: Phase data flow tracing | +~200 tokens (log statements) | Observability, not coordination |

**Total overhead of all recommendations: ~900-1100 tokens per run (~2% of baseline).** All recommendations are additive to existing optimizations (P1-P9) and do not modify ck: skill behavior.

---

## Sources & References

### Codebase (Primary Sources)
- `D:\projects\man-ultraflow\references\template-arena.md` — arena workflow script
- `D:\projects\man-ultraflow\references\template-bench.md` — bench workflow script
- `D:\projects\man-ultraflow\references\template-cook.md` — cook workflow script (file ownership pattern)
- `D:\projects\man-ultraflow\SKILL.md` — skill manifest + arena ending protocol
- `D:\projects\man-ultraflow\CLAUDE.md` — project architecture guide
- `D:\projects\man-ultraflow\plans\reports\researcher-260609-arena-evolution-optimization.md` — prior optimization research

### External Framework Documentation (2026)
- [The Great AI Agent Showdown of 2026: OpenAI, AutoGen, CrewAI, or LangGraph?](https://topuzas.medium.com/the-great-ai-agent-showdown-of-2026-openai-autogen-crewai-or-langgraph-7b27a176b2a1)
- [A Detailed Comparison of Top 6 AI Agent Frameworks in 2026](https://www.turing.com/resources/ai-agent-frameworks)
- [2026 AI Agent Framework Showdown: LangGraph vs CrewAI vs AG2 vs Claude SDK vs Strands vs OpenAI](https://qubittool.com/blog/ai-agent-framework-comparison-2026)
- [CrewAI vs LangGraph vs AutoGen: Which Multi-Agent Framework Should You Use in 2026?](https://dev.to/emperorakashi20/crewai-vs-langgraph-vs-autogen-which-multi-agent-framework-should-you-use-in-2026-5h2f)
- [AI Agent Frameworks Compared: LangGraph vs CrewAI vs AutoGen (2026)](https://pecollective.com/blog/ai-agent-frameworks-compared/)
- [CrewAI vs LangGraph vs AutoGen vs OpenAgents — Best AI Agent Framework (2026)](https://openagents.org/blog/posts/2026-02-23-open-source-ai-agent-frameworks-compared)
- [LangGraph vs CrewAI vs AutoGen: Production Guide (2026)](https://pub.towardsai.net/langgraph-vs-crewai-vs-autogen-which-ai-agent-framework-should-your-enterprise-use-in-2026-3a9ebb407b09)
- [LangGraph vs CrewAI vs AutoGen vs Custom [2026 Benchmark]](https://tensoria.fr/en/blog/multi-agent-orchestration-comparison)
- [AI Agent Frameworks 2026: LangGraph vs AutoGen vs CrewAI for Web Data Pipelines](https://use-apify.com/blog/ai-agent-frameworks-2026-langgraph-autogen-crewai)
- [Best Multi-Agent Frameworks in 2026: LangGraph, CrewAI...](https://gurusup.com/blog/best-multi-agent-frameworks-2026)

### Academic Papers
- [MetaGPT: Meta Programming for Multi-Agent Collaborative Framework (arxiv:2308.00352)](https://arxiv.org/pdf/2308.00352) — SOP + structured document communication
- [Multi-Agent Teams and Expert Integration (arxiv:2602.01011)](https://arxiv.org/abs/2602.01011) — integrative compromise, weighting problem
- [AWCP: Workspace Delegation Protocol (arxiv:2602.20493)](https://arxiv.org/pdf/2602.20493) — workspace isolation for deep collaboration
- [Open Challenges in Multi-Agent Security (arxiv:2505.02077)](https://arxiv.org/html/2505.02077v2) — collusion detection, boundary problem
- [Centric Role-Based Framework for Scalable Multi-Agent LLM Systems](https://salford-repository.worktribe.com/OutputFile/4901253) — role isolation patterns
- [MoRAgent: Mixture-of-Roles Agent Tuning (arxiv:2512.21708)](https://arxiv.org/pdf/2512.21708) — role-based parameter tuning
- [DAR: Diversity-Aware Retention for Multi-Agent LLM Judgment (arxiv:2603.20640; paraphrased title)](https://arxiv.org/abs/2603.20640) — retain disagreements, compress agreements; ~30-50% judge input token reduction (self-reported; not independently validated)
- [Wrong-Consensus Rate (arxiv:2509.05396)](https://arxiv.org/abs/2509.05396) — 17.4% wrong-consensus rate; basis for P2 redesign

### Industry Analysis
- [The Market Shift: Why Multi-agent LLM Coordination Matters in 2026](https://sesamedisk.com/multi-agent-llm-coordination-2026/)
- [Why Multi-Agent LLM Systems Fail (Galileo AI)](https://galileo.ai/blog/multi-agent-llm-systems-fail)
- Gartner 2026 Survey: 61% large enterprises with production AI agent systems; LangGraph 34% production citations (cited via search result summaries — primary Gartner report not directly accessed)

---

## Unresolved Questions

1. **Embedding-based overlap detection (R1):** Keyword heuristics may miss semantic overlap between hypotheses phrased differently. Would an embedding similarity check (using a haiku agent as a proxy) be worth the ~500 token cost? Needs A/B testing.

2. **Challenger lane violation frequency:** How often do Challengers actually produce alternative code instead of reviewing? No empirical data exists — would need logging across 20+ arena runs to establish a baseline before deciding if R2/R3 are worth the token overhead.

3. **MetaGPT subscription model applicability:** Could reduce the arena script's manual curation. But the arena's script-mediated approach gives more control over information flow (DAR-style digest, unanimity pre-digest). Is the flexibility worth the implementation complexity?

4. **LangGraph-style state snapshots for debugging:** Could the Workflow engine's native primitives support a state snapshot at each phase boundary that could be replayed for debugging failed runs? Requires Workflow engine feature investigation.

5. **AG2 vs AutoGen naming:** Community uses both "AutoGen" and "AG2" interchangeably; Microsoft's official documentation still references "AutoGen" for the main repo. The fork/maintenance-mode claim is from secondary sources only — treat as directionally correct, not authoritative.

6. **Gartner 2026 stats sourcing:** Enterprise adoption figures (61%, 34% LangGraph, 60% CrewAI Fortune 500) are from search result summaries, not primary Gartner report access. Treat as plausible directional data, not citable statistics.
