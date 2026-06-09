---
phase: 1
title: "Shared Foundation: _shared lib + .ultraflow contract"
status: pending
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Shared Foundation

## Overview
Create one `references/_shared.md` reference holding the JS helpers every later phase reuses
(git-hash, `BRANCH:` parser, scorecard schema, cache path resolver, token-probe), and pin down
the `.ultraflow/` on-disk contract. This kills duplication across P2–P5 (DRY) before they fork.

## Requirements
- Functional: a single copy-pasteable helper block templates can inline; a documented `.ultraflow/` layout.
- Non-functional: pure JS runnable inside a Workflow `agent` step or as a bash one-liner an agent issues; no new npm deps; cross-platform paths (win32 + posix); KISS.

## Architecture
The engine has no module system across templates — each `template-*.md` is a standalone script.
So `_shared.md` is a **documentation + canonical-snippet** file, not an imported module: each
template copies the small helper it needs. Helpers are written so a *measurement/cache agent*
can run them via its own shell tool (git, wc, jq) and return JSON; the engine itself never shells out.

`.ultraflow/` on-disk contract (git-ignored, repo-root relative):
```
.ultraflow/
  cache/
    <git-hash>/
      scout.json        # { target, report(md), createdAt, gitHash, dimensions }
      meta.json         # { template, n, createdAt }
  bench/
    <run-id>/
      scorecard.json    # { columns, rows[], winner, formula }
  budget/
    <run-id>/
      usage.json        # [ { label, model, inputTokens, outputTokens, estimated:bool } ]
```
- **Cache key** = `git rev-parse HEAD` + a short hash of `git status --porcelain --untracked-files=all`
  (so a dirty working tree busts the cache). Helper `cacheKey()` returns `<head>-<dirtyhash|clean>`.
  **Verified caveat (red-team):** plain `git status --porcelain` lists an untracked *directory* (`?? dir/`)
  without enumerating new files inside it, so a new file nested under an already-untracked dir would NOT
  bust the key. `--untracked-files=all` forces per-file enumeration and closes that gap. Editing a tracked
  file always busts the key (verified). Residual gap: changes outside git's view (e.g. env, generated
  artifacts in `.gitignore`) still need `--refresh-cache`.
- `<run-id>` = ISO-ish timestamp `YYYYMMDD-HHMMSS` (stateless engine has no run id; generate one).

## Related Code Files
- Create: `references/_shared.md`
- Modify: `.gitignore` (add `.ultraflow/`)
- Modify: `SKILL.md` (one line under "How to call Workflow tool" pointing at `_shared.md`)

## Implementation Steps
1. Write `references/_shared.md` with these canonical snippets, each in its own fenced block:
   - `cacheKey(cwd)` — runs `git rev-parse HEAD` + `git status --porcelain --untracked-files=all` (the `--untracked-files=all` is mandatory — see verified caveat above), hashes the status output, returns the composite key. Document the exact shell an agent runs and the JSON it returns.
   - `parseBranches(results)` — the `BRANCH:\s*(\S+)` extraction already duplicated in cook/fix/arena, centralized verbatim.
   - `SCORECARD_SCHEMA` — JSON schema object for benchmark output (columns, rows, winner, formula) so P4 imports one definition.
   - `USAGE_ROW` shape + `estimateTokens(text)` (`Math.ceil(text.length/4)`) fallback for P3/P4.
   - `cachePaths(cwd, key)` / `ensureUltraflowDir()` — path builders using forward-slash joins (work on win32 + posix).
2. Add `.ultraflow/` to `.gitignore`.
3. Add a single pointer line in `SKILL.md` so future template authors know the shared snippets exist.
4. Sanity-run the `cacheKey` shell locally (`git rev-parse HEAD` + `git status --porcelain --untracked-files=all`) to confirm: (a) stable on two clean re-reads, (b) busts on a tracked-file edit, (c) busts on a new untracked file nested under an already-untracked dir (the case plain `--porcelain` misses — already verified during planning).

## Success Criteria
- [ ] `references/_shared.md` exists with all 5 named snippets, each self-contained and copy-pasteable.
- [ ] `cacheKey` is verified: same value twice on a clean tree; different value after touching a file.
- [ ] `.ultraflow/` is git-ignored (`git check-ignore .ultraflow/x` returns the path).
- [ ] No `ck:` skill file touched; no new npm dependency added.

## Risk Assessment
- **Risk:** "shared lib" via copy-paste drifts out of sync across templates. **Mitigation:** keep snippets tiny and append a `// source: references/_shared.md#<anchor>` comment line on each copy so drift is greppable; P6 greps for divergence.
- **Risk:** git-hash key wrong on detached HEAD / no commits. **Mitigation:** `cacheKey` falls back to a literal `nogit` key (cache simply never hits, never errors).
- **Risk:** win32 path separators break path builders. **Mitigation:** always build with `/` and let git/node normalize; tested on this win32 box in step 4.
