# man:ultraflow

Multi-agent **Workflow** orchestration for Claude Code — run parallel agents through the Workflow engine (no env var, works on Sonnet & Opus) using ready-made templates.

`/man:ultraflow <template> <args> [--agents N]`

## Templates

| Template | What it does | Default agents |
|---|---|---|
| `arena` | **Router auto-picks** the producer ck: skill + adversary ck: skill(s) from your prompt, then PRODUCE → adversarial CONTEST → JUDGE | router (2-3) |
| `scout` | Parallel codebase search across 4 dimensions (files, patterns, contracts, risks) → merged context map | 3 |
| `brainstorm` | N agents propose solutions from distinct angles → judge panel → synthesis | 3 |
| `plan` | Scout + N parallel researchers → planner synthesizes a phased plan (`--mode fast\|hard\|deep`) | 2 |
| `cook` | Scout → plan → N parallel devs in isolated worktrees → test | 2 |
| `fix` | Diagnose root cause → N competing fix hypotheses in worktrees → verify best | 3 |
| `debug` | N competing hypotheses, adversarial root-cause investigation | 3 |
| `research` | N parallel researchers → synthesis | 3 |
| `review` | Security / performance / coverage dimensions → merged findings | 3 |

## Usage

```
/man:ultraflow --arena <prompt> [--agents N]   ← router auto-picks ck: skills + adversaries
/man:ultraflow scout <target> [--agents N]
/man:ultraflow brainstorm <topic> [--agents N]
/man:ultraflow plan <task> [--agents N] [--mode fast|hard|deep]
/man:ultraflow cook <task> [--agents N] [--plan <path>]
/man:ultraflow fix <issue> [--agents N]
/man:ultraflow debug <issue> [--agents N]
/man:ultraflow research <topic> [--agents N]
/man:ultraflow review <scope> [--agents N]
```

### Typical chain

```
/man:ultraflow scout <target>          → understand the codebase
/man:ultraflow brainstorm <topic>      → explore solution options
/man:ultraflow plan <task> --mode hard → produce a phased plan
/man:ultraflow cook <plan-path>        → parallel implementation
/man:ultraflow fix <issue>             → diagnose + fix
/man:ultraflow review <scope>          → quality audit
```

## How it works

Each template is a JavaScript Workflow script (in `references/`). When invoked, the skill:

1. Parses the template type and arguments
2. Reads the matching `references/template-<name>.md`
3. Calls the Workflow tool with the script, passing `args`

### Source of truth: the original `ck:` skills

The templates are **orchestrators only** — they do not reimplement workflow logic. Every spawned agent loads and follows the corresponding original `ck:` skill verbatim (via the Skill tool, or by reading `~/.claude/skills/<dir>/SKILL.md` and its references). Workflow handles the parallel fan-out, worktree isolation, and synthesis; the `ck:` skill provides the method, gates, and output format.

| Template | Delegates to | Skill dir |
|---|---|---|
| `scout` | `ck:scout` | `scout` |
| `brainstorm` | `ck:brainstorm` | `brainstorm` |
| `plan` | `ck:research` + `ck:plan` | `research`, `ck-plan` |
| `cook` | `ck:scout` + `ck:plan` + `ck:cook` + `ck:test` | `scout`, `ck-plan`, `cook`, `test` |
| `fix` | `ck:fix` | `fix` |
| `debug` | `ck:debug` | `ck-debug` |
| `research` | `ck:research` | `research` |
| `review` | `ck:code-review` | `ck-code-review` |

Templates that mutate files in parallel (`cook`, `fix`) run each agent in an **isolated git worktree** so there are no conflicts. After completion, merge the winning branch:

```bash
git worktree list
git merge <branch>
```

## Installation

The skill **is** this repository (`SKILL.md` lives at the root), so installing it means placing the repo at `<skills-dir>/man-ultraflow`. Pick a scope:

- **Global** — available in every project: `~/.claude/skills/man-ultraflow`
- **Project-local** — only this project, commit it with the repo: `.claude/skills/man-ultraflow`

### Option A — git clone (recommended, easy updates)

**macOS / Linux**

```bash
# global
git clone https://github.com/anhdt19942020/man-ultraflow.git ~/.claude/skills/man-ultraflow

# or project-local (run from your project root)
git clone https://github.com/anhdt19942020/man-ultraflow.git .claude/skills/man-ultraflow
```

**Windows (PowerShell)**

```powershell
# global
git clone https://github.com/anhdt19942020/man-ultraflow.git "$env:USERPROFILE\.claude\skills\man-ultraflow"

# or project-local (run from your project root)
git clone https://github.com/anhdt19942020/man-ultraflow.git ".claude\skills\man-ultraflow"
```

> Using SSH instead of HTTPS? Swap the URL for `git@github.com:anhdt19942020/man-ultraflow.git`.

### Option B — manual download (no git)

Download the repo ZIP from GitHub (**Code → Download ZIP**), then extract it so the layout is:

```
~/.claude/skills/man-ultraflow/
├── SKILL.md
├── README.md
└── references/
```

The folder **must** be named `man-ultraflow` and `SKILL.md` must sit directly inside it.

### Activate

Restart Claude Code (or reload skills). The `/man:ultraflow` command is now available.

### Verify

```bash
# the skill manifest should print "name: man:ultraflow"
cat ~/.claude/skills/man-ultraflow/SKILL.md | head -3
```

Then in Claude Code, run `/man:ultraflow scout README.md` — if the workflow launches, you're set.

### Update

```bash
cd ~/.claude/skills/man-ultraflow && git pull
```

(Manual installs: re-download the ZIP and overwrite the folder.)

### Uninstall

```bash
rm -rf ~/.claude/skills/man-ultraflow
```

## Requirements

- Claude Code with the **Workflow** tool available
- Git (for `cook` / `fix` worktree isolation)
- The **ClaudeKit `ck:` skills** the templates delegate to (see the table above). A template degrades gracefully if its `ck:` skill is missing, but full fidelity needs them installed.

## License

MIT — see [LICENSE](./LICENSE).
