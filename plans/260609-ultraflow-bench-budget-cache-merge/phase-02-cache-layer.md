---
phase: 2
title: "Cache Layer — persist & reuse scout context maps"
status: pending
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Cache Layer

## Overview
scout re-scans the codebase from scratch every run. Persist the merged scout context map to
`.ultraflow/cache/<git-hash>/scout.json` and have `scout`, `plan`, and `cook` read it back on a
cache hit instead of spawning scout agents — saving the entire scout fan-out when the repo is
unchanged.

## Requirements
- Functional: write scout output to cache after a successful merge; on the next run, if `cacheKey`
  matches and the file exists, skip the scout phase and load the cached report.
- Functional: `--no-cache` flag to force a fresh scan; `--refresh-cache` to scan and overwrite.
- Non-functional: a stale cache must never silently mislead — key includes the dirty-tree hash from
  P1 so any uncommitted change busts it. KISS: plain JSON, no eviction policy beyond "key changed".

## Architecture
A cache **gate agent** runs first in scout/cook's scout phase:
1. Compute `cacheKey` (P1 helper).
2. Check `.ultraflow/cache/<key>/scout.json`. If present and `--no-cache` not set → return its
   `report` verbatim and set `cacheHit=true`; the template **skips** spawning scout agents.
3. On miss → run the existing scout fan-out unchanged, then a final write-back step persists the
   merged report + `meta.json`.

Touch points:
- `template-scout.md`: wrap the `phase('Scout')` block in a cache check; add a `phase('Cache')`
  write-back after merge. Return `{ ..., cacheHit, cacheKey, cachePath }`.
- `template-cook.md`: its internal scout (`template-cook.md:54`) reads cache first; on hit, feed the
  cached report straight into the planner prompt, skipping the scout agent.
- `template-plan.md`: same — if a cached scout report exists for the key, pass it into the
  research/planner agents instead of re-scouting.

Data flow:
```
run → cacheKey ──hit──► load scout.json ──► feed planner/dev (0 scout agents)
                 └─miss─► scout fan-out ──► merge ──► write scout.json + meta.json
```

## Related Code Files
- Modify: `references/template-scout.md`
- Modify: `references/template-cook.md`
- Modify: `references/template-plan.md`
- Read for context: `references/_shared.md` (P1)
- Create (runtime, git-ignored): `.ultraflow/cache/<key>/scout.json`

## Implementation Steps
1. In `template-scout.md`, before `phase('Scout')`: add a cache-gate agent that computes the key and reads `scout.json`. Parse `A.noCache` / `A.refreshCache` from args.
2. On hit (and not refresh): `log('cache hit <key> — skipping N scout agents')`, set `report` from cache, jump to return. On miss: run existing fan-out + merge unchanged.
3. After a successful merge on a miss: write `scout.json` (`{ target, report, gitHash, dimensions, createdAt }`) + `meta.json`. Use `ensureUltraflowDir`.
4. In `template-cook.md`, replace the unconditional scout agent with the same gate; on hit, set `scoutReport` from cache and skip the scout agent (planner still runs).
5. In `template-plan.md`, add the same cache read; pass cached report into the planner/research agents when present.
6. Thread `--no-cache` / `--refresh-cache` through `SKILL.md` arg parsing (`args.noCache`, `args.refreshCache`) for scout/plan/cook.
7. Update each template's `## Notes` to document cache behavior + flags.

## Success Criteria
- [ ] First `scout <target>` writes `.ultraflow/cache/<key>/scout.json`; the log shows a cache miss.
- [ ] Immediate re-run on the unchanged tree logs a **cache hit** and spawns **0 scout agents** (verified in workflow log).
- [ ] Touching any tracked file changes `cacheKey` → next run is a miss (no stale reuse). Verified during planning that this holds for tracked edits; the P1 `--untracked-files=all` key also busts on new untracked files nested in untracked dirs.
- [ ] `--no-cache` forces a miss even when a valid entry exists.
- [ ] `cook`/`plan` consume the cached report (planner prompt contains it) when present.

## Risk Assessment
- **Risk:** stale cache feeds wrong context after a code change the key didn't capture (e.g. submodule, generated file). **Mitigation:** key = HEAD + `git status --porcelain` hash; document that out-of-tree changes need `--refresh-cache`; default TTL-free but key-busting is aggressive.
- **Risk:** corrupt/partial JSON on an interrupted write. **Mitigation:** write to `scout.json.tmp` then rename; on parse error treat as a miss (self-heals).
- **Risk:** cache hit masks a genuinely better fresh scan. **Mitigation:** `--refresh-cache` is documented as the escape hatch; hit only when key is byte-identical.
