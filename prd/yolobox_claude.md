# `yolobox claude` — Feature Requirements

## What It Does

Launches Claude Code with `--dangerously-skip-permissions` in a new Docker container with its own git worktree and branch.

```bash
yolobox claude                              # Interactive Claude session
yolobox claude cool-tiger                   # Use a specific name instead of random
yolobox claude cool-tiger -p "fix the bug"  # Name + prompt
yolobox claude -p "fix the login bug"       # Prompt with random name
```

## Flow

1. **Check Docker** — `docker info` silently. Fail with clear message if not running.
2. **Check git repo** — `git rev-parse --is-inside-work-tree`. If not in a repo,
   prompt the user to `git init` (via `@clack/prompts` confirm). If declined, exit.
3. **Ensure HEAD exists** — If the repo has no commits (`git rev-parse HEAD` fails),
   create an empty initial commit. Worktrees require a valid HEAD.
4. **Generate ID** — `adjective-noun` pattern (e.g., `swift-falcon`). Check against
   existing branches and worktrees. Retry on collision (max 100 attempts).
5. **Create worktree** — `git worktree add .yolobox/<id> -b <id>` from HEAD.
6. **Ensure .gitignore** — Add `.yolobox/` if not already present.
7. **Git identity** — Read `user.name` and `user.email` from host's git config.
   Pass as env vars (`GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`,
   `GIT_COMMITTER_EMAIL`).
8. **Launch container** — Start container in detached mode, then exec into it with
   `claude --dangerously-skip-permissions` (optionally with `-p <prompt>`). Block until
   Claude session exits.

## CLI Arguments & Flags (MVP)

| Argument/Flag | Required | Description |
|---------------|----------|-------------|
| `[name]` | No | Use a specific name instead of random (positional) |
| `--prompt <text>` / `-p` | No | Pass an initial prompt to Claude |

## Deferred Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--detach` | `-d` | Run in background, don't attach |
| `--pull` | | Force-pull the latest Docker image |
| `--base <ref>` | `-b` | Create worktree from this ref (default: HEAD) |

## Docker Image

**MVP:** Build locally with `npm run docker:build` (tags as `yolobox:local`).
Override via `YOLOBOX_IMAGE` env var.

**Later:** Pull from `ghcr.io/roginn/yolobox:latest` by default.

## User-Visible Output

```
$ yolobox claude

┌   yolobox v0.0.1
│
◆  Docker is running
│
◆  Git repo detected
│
◆  Created worktree .yolobox/swift-falcon (branch: swift-falcon)
│
└  Launching Claude in swift-falcon...

> (Claude Code session starts with --dangerously-skip-permissions)
```

## Error Messages

| Condition | Message |
|-----------|---------|
| Docker not running | `Docker is not running. Start Docker Desktop and try again.` |
| Not a git repo | Prompt: `No git repo found. Initialize one here?` If declined: `yolobox needs a git repo for worktrees.` |
| No commits | Auto-create an empty initial commit (no prompt needed) |

## Implementation Files

- `src/commands/claude.ts` — Command implementation
- `src/lib/container-setup.ts` — Shared container setup logic
- `src/lib/docker.ts` — Docker check and container execution
- `src/lib/git.ts` — Git repo checks and identity
- `src/lib/worktree.ts` — Worktree creation and .gitignore management
- `src/lib/id.ts` — ID generation with word lists
- `src/lib/ui.ts` — Styled terminal output
