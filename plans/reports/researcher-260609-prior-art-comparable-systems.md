# Research Report: Có mô hình nào đang làm như Ultraflow Arena không?

**Conducted:** 2026-06-09 | **Method:** 5 parallel WebSearches | **Verdict:** Có — rất nhiều. Không có cái nào trùng khít, nhưng MỌI thành phần của chúng ta đều đã có prior art.

## TL;DR (brutal)

Ultraflow Arena = **router → producer → adversarial critics + benchmarker → LLM judge**, themed Roman arena, có thể tự tiến hoá (self-evolution rounds). Không phát minh mới về *cơ chế* — đây là sự kết hợp của 4 dòng nghiên cứu đã chín muồi:

1. **Generator–Discriminator / Producer-Critic-Judge** → ChatEval, DEBATE, CAMF, Agent-as-a-Judge.
2. **Multi-agent debate + LLM-as-judge** → AutoGen, MetaGPT, ChatDev, CAMEL, ChatEval.
3. **Self-evolving agents** → Darwin Gödel Machine, ADAS, SICA, DARWIN, OpenEvolve/AlphaEvolve.
4. **Confidence-aware routing / skill selection** → RouteLLM, SkillRouter, CARGO, Mixture-of-Agents.

Điểm khác biệt thật sự của chúng ta KHÔNG nằm ở thuật toán mà ở **packaging**: chạy trong Claude Code Workflow engine, dùng ck: skills làm "vũ khí" (separation of concerns), benchmarker đo số liệu thật trên git branch làm ground-truth cho judge. Đó là engineering, không phải research novelty.

## Bản đồ đối chiếu (cái nào làm giống phần nào)

| Thành phần của ta | Vai trò arena | Prior art gần nhất | Giống / Khác |
|---|---|---|---|
| **Lanista** (router auto-pick skill + model tier) | Tuyển binh | **RouteLLM** (ICLR'25), **SkillRouter**, **CARGO** (confidence-aware), **AgentRouter** (KG-guided) | Giống: chọn model/skill theo task + confidence. Khác: ta route sang *skill* (ck:) lẫn *model tier* (opus/sonnet/haiku) cùng lúc — ít framework gộp cả hai. |
| **Gladiator** (producer chạy ck: skill) | Ra trận | **Generator** trong Generator-Discriminator self-play; producer agent trong AutoGen/MetaGPT | Giống hệt khái niệm generator. |
| **Challengers** (N critics, distinct attack angles) | Giao chiến | **ChatEval**, **DEBATE**, **CAMF** (generator-mimic vs detector-enhancer), metaswarm 3 adversarial reviewers | Giống: critics đa góc tấn công. Khác: ta gán *distinct contest_angles* + diversify model tier để tăng phủ — đúng hướng "diversity beats redundancy" của debate research. |
| **Benchmarker** (test/lint/LOC số thật) | Đo lường | **SICA / DGM / OpenEvolve** dùng metric thật làm fitness; **D3 budgeted stopping** | Đây là điểm MẠNH & tương đối hiếm: nhiều framework debate chỉ dựa opinion, ta neo bằng số đo khách quan. |
| **Caesar** (judge, hybrid verdict + JSON) | Phán quyết | **LLM-as-judge**, **Agent-as-a-Judge** (arxiv 2508.02994), **Multi-Agent Debate for LLM Judges w/ Adaptive Stability** | Giống: judge tổng hợp critiques. Khác: ta ép verdict thành JSON parse được + benchmark override opinion. |
| **Self-evolution rounds** (arena tự tối ưu chính nó) | Meta | **Darwin Gödel Machine**, **ADAS**, **SICA**, **DARWIN**, **Group-Evolving Agents** | Khái niệm giống (agent sửa chính mình theo metric). KHÁC LỚN: ta vẫn human-in-the-loop, không tự sửa code tự động. DGM/SICA tự rewrite code của chính nó — ta KHÔNG. |

## Các hệ gần nhất, đáng xem

### 1. Framework đã hoàn chỉnh (head-to-head closest)
- **metaswarm** (Claude Code) — 3 adversarial reviewers (Feasibility/Completeness/Scope) phải đồng thuận trước Design Review Gate. **Đây là cái GIỐNG ta nhất về spirit + cùng nền Claude Code.** Khác: ta có judge tập trung (Caesar) + benchmarker, họ dùng unanimity gate.
- **ruflo (ruvnet)** — "agent meta-harness for Claude": swarm tự tổ chức, self-learning, memory across sessions. Tham vọng self-evolution hơn ta, nhưng kém adversarial-judge structure.
- **AutoGen / MetaGPT / ChatDev / CAMEL** — multi-agent orchestration kinh điển. MetaGPT/ChatDev nhúng SDLC workflow; CAMEL role-play. Không cái nào có *router→adversarial→benchmark-judged* pipeline như ta.

### 2. Pattern competitive y hệt "arena" của ta
Search trả về mô tả gần như nguyên văn arena: *"N agents each attempt the same task using different approaches, with a judging agent ranking pairwise until a winner emerges."* → đây chính là `bench` template + arena của ta. Pattern này đã được Anthropic ghi nhận trong **dynamic workflows blog**.

### 3. Self-evolution (phần ta non nhất so với SOTA)
- **Darwin Gödel Machine** (Sakana AI, arxiv 2505.22954) — agent tự sửa code đề xuất sửa đổi, giữ archive theo quality+diversity. SOTA circle-packing với ~150 evals.
- **SICA** (Bristol) — xoá ranh giới meta-agent/target-agent, tự sửa script chính nó, giữ thay đổi nếu metric tăng.
- **ADAS** — chỉ ra bottleneck: meta-agent cố định = blind spot vĩnh viễn. **Cảnh báo này áp thẳng vào ta**: template arena của ta do người viết, tự nó không học.

## Đánh giá thẳng: ta đứng đâu?

**Không trùng ai 100%**, nhưng cũng **không có gì là novel về thuật toán**. Giá trị thật của Ultraflow:
- ✅ **Integration engineering tốt**: ck: skills as pluggable weapons (separation of concerns) — ít prior art làm sạch như vậy.
- ✅ **Benchmarker làm ground-truth** cho judge — mạnh hơn phần lớn debate framework chỉ dựa opinion.
- ✅ **Token/speed optimizations** (P1-P9) có cơ sở research (đã cite đúng: DAR, D3, OI-MAS...).
- ⚠️ **"Self-evolution" của ta yếu** so với DGM/SICA: ta human-in-loop, không tự rewrite. Nếu muốn dùng đúng từ "self-evolving", cần archive of variants + auto-keep-if-metric-improves (giống ck:loop + DGM).
- ⚠️ **Lanista (router) chưa học**: tĩnh, đúng cảnh báo ADAS. RouteLLM/SkillRouter học từ data; ta route bằng prompt cứng.

## Khuyến nghị (next steps)

1. **Định vlại marketing**: đừng bán là "novel" — bán là *"adversarial arena orchestration tích hợp sâu Claude Code, neo bằng benchmark thật"*. Đó là thật và đủ mạnh.
2. **Nếu muốn self-evolution thật**: thêm archive variants + auto-select theo benchmark (mượn DGM/SICA/OpenEvolve MAP-Elites). Hiện `plans/reports/...arena-evolution...` mới là human-driven round, chưa phải DGM-style.
3. **Router học được**: log (prompt → route → verdict outcome) rồi fine-tune/few-shot Lanista (kiểu SkillRouter retrieve-and-rerank). Gỡ blind spot ADAS cảnh báo.
4. **Đọc kỹ metaswarm** — đối thủ trực tiếp cùng nền, học cách họ làm gate đồng thuận.

## RESOLVED (260609 — 2 deep investigations)

### Q1 — "Self-evolution arena round 1" là DGM-style hay human-in-loop? → **HUMAN-IN-LOOP (98%)**
Bằng chứng (git + repo files):
- `SKILL.md:123`: *"Safety rule (always): ASK before any mutate/merge/commit/push … never auto-ACCEPT."* → mọi bước mutating đều dừng hỏi người. Không thể là autonomous.
- Engine **stateless between calls**, round counter parse từ tag người gõ `[TÁI ĐẤU vòng N]` — không có persistent loop, không archive variants, không auto-keep-if-metric-improves.
- Commit wording: `6c6dbb3` "resolve 5 **Caesar-upheld** bugs" (human sửa), `2b1aee7` "implement proposals **from the research report**" (human implement). Grep `archive|auto-keep|auto-apply|self-rewrite` → chỉ thấy trong prose nghiên cứu, KHÔNG có implementation.
- **Round 1 thực chất là:** human chĩa arena vào chính template của arena → Gladiator đề xuất optimization → Challengers/Benchmarker/Caesar phán → **human đọc verdict rồi tự tay viết fix** vào file. Meta nhưng không tự động.
- **Marketing:** KHÔNG được gọi "self-evolving" theo nghĩa DGM. Từ đúng: **"human-in-the-loop self-improvement" / "arena-assisted self-refinement."**
- **Gap tới DGM thật:** (1) archive variants + benchmark scores qua các vòng; (2) auto-keep-if-metric-improves thay cho human gate; (3) driver loop — **`ck:loop` skill** (auto-keep/discard theo mechanical metric) chính là mảnh ghép #2; chưa được wire vào arena.

### Q2 — Có ai làm "adversarial critics + objective benchmarker → LLM judge" trên Claude Code chưa? → **KHOẢNG TRỐNG THẬT (high confidence)**
Quét primary sources (metaswarm, ruflo, agent-review-panel, council-review, adversarial-review, DGM, AlphaEvolve, SICA, AutoGen/MetaGPT/ChatDev, LangGraph/CrewAI, OpenHands/SWE-agent):

| System | Adversarial critics | Benchmarker → judge input | Judge fuses cả 2 | Self-evolving |
|---|---|---|---|---|
| **man-ultraflow arena** | ✅ N song song, distinct angles | ✅ test/lint/LOC thật | ✅ test fail override critic | ❌ |
| metaswarm | ✅ multi-model tuần tự | ⚠️ hard gate phase RIÊNG | ❌ 2 tín hiệu KHÔNG hợp nhất | ❌ |
| dementev-dev/adversarial-review | ⚠️ 1 cross-model critic | ⚠️ critic tự chạy test | ❌ không có judge layer riêng | ❌ |
| agent-review-panel / council-review | ✅ 4-6 critics | ❌ "no runtime analysis" | ❌ | ❌ |
| DGM / AlphaEvolve / SICA | ❌ | ✅ nhưng là *evolutionary fitness* | ❌ deterministic selection | ✅ |
| AutoGen/MetaGPT/ChatDev | ❌ | ❌ | ❌ | ❌ |
| LangGraph/CrewAI | buildable | buildable | buildable (không built-in) | ❌ |
| ruflo | ❌ | ❌ (chỉ system benchmark) | ❌ | ⚠️ RAG retrieval |

**Kết luận:** Không có hệ public Claude-Code-native nào hợp nhất đủ 3: (a) N critics song song mỗi người 1 góc + (b) Benchmarker riêng chạy test/lint thật ra số + (c) judge riêng nhận [critic opinions + số benchmark] rồi phán, với test-fail-override. **Đây là white space ta đang chiếm.**
- **Gần nhất:** `dementev-dev/adversarial-review` (cross-model, critic chạy test thật) — nhưng thiếu Benchmarker riêng + thiếu N-critic fan-out + thiếu judge tách biệt.
- **Nhì:** metaswarm — nhưng VALIDATE (test gate) và ADVERSARIAL REVIEW là 2 phase TÁCH RỜI, không hợp nhất vào 1 judge.
- **Phân biệt quan trọng:** DGM/AlphaEvolve dùng metric như *fitness chọn lọc qua nhiều vòng tiến hoá* — KHÁC hẳn "metric như input cho LLM judge trong 1 vòng adversarial."

## Unresolved questions (còn lại)
- `dementev-dev/adversarial-review`: khi chạy test, nó truyền *số liệu thô* vào prompt reviewer hay chỉ pass/fail? (nếu truyền số → gần ta hơn mô tả).
- Anthropic có tooling nội bộ làm pattern này không? (blog multi-agent không mô tả; nội bộ không kiểm chứng được).
- Có paper học thuật 2025-26 nào mô tả single-round multi-critic + deterministic metric → LLM judge cho code gating trong ngữ cảnh agentic-coding chưa? (chưa thấy index).

## Sources
- [Agent-as-a-Judge Evaluation for LLMs (arxiv 2508.02994)](https://arxiv.org/html/2508.02994v1)
- [Multi-Agent Debate for LLM Judges w/ Adaptive Stability (arxiv 2510.12697)](https://arxiv.org/html/2510.12697v1)
- [Multi_Agent_LLM_Debater (GitHub)](https://github.com/mjsushanth/Multi_Agent_LLM_Debater)
- [A Survey of Self-Evolving Agents (arxiv 2507.21046)](https://arxiv.org/html/2507.21046v2)
- [Darwin Gödel Machine (arxiv 2505.22954)](https://arxiv.org/html/2505.22954v3)
- [DARWIN: Dynamic Agentically Rewriting Self-Improving Network (arxiv 2602.05848)](https://arxiv.org/pdf/2602.05848)
- [Group-Evolving Agents (arxiv 2602.04837)](https://arxiv.org/pdf/2602.04837)
- [AutoGen (arxiv 2308.08155)](https://ar5iv.labs.arxiv.org/html/2308.08155)
- [RouteLLM / SkillRouter (arxiv 2603.22455)](https://arxiv.org/html/2603.22455v1)
- [AgentRouter KG-guided (arxiv 2510.05445)](https://arxiv.org/pdf/2510.05445)
- [metaswarm — Multi-Agent Orchestration for Claude Code](https://dsifry.github.io/metaswarm/)
- [ruflo (GitHub)](https://github.com/ruvnet/ruflo)
- [Anthropic — dynamic workflows in Claude Code](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code)
