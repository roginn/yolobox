# `yolobox run` — Feature Requirements

## What It Does

Launches a new sandboxed Claude Code session in a Docker container with its own
git worktree and branch.

```bash
yolobox run                          # Interactive Claude session
yolobox run -p "fix the login bug"   # Start Claude with a prompt
yolobox run --shell                  # Drop into bash instead of Claude
yolobox run --name cool-tiger        # Use a specific ID instead of random
```

## Flow

1. **Check Docker** — `docker info` silently. Fail with clear message if not running.
2. **Check git repo** — `git rev-parse --is-inside-work-tree`. Fail if not in a repo.
3. **Generate ID** — `adjective-noun` pattern (e.g., `swift-falcon`). Check against
   existing branches and worktrees. Retry on collision (max 100 attempts).
4. **Create worktree** — `git worktree add .yolobox/<id> -b <id>` from HEAD.
5. **Ensure .gitignore** — Add `.yolobox/` if not already present.
6. **Git identity** — Read `user.name` and `user.email` from host's git config.
   Pass as env vars (`GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`,
   `GIT_COMMITTER_EMAIL`).
7. **Launch container** — `docker run -it --rm` with worktree mounted at `/workspace`
   and the repo's `.git` dir mounted at `/repo/.git`. The entrypoint
   rewrites the worktree's `.git` pointer to use the container path. Block until
   container exits.

## CLI Flags (MVP)

| Flag | Short | Description |
|------|-------|-------------|
| `--prompt <text>` | `-p` | Pass an initial prompt to Claude |
| `--shell` | `-s` | Open bash shell instead of Claude |
| `--name <id>` | `-n` | Use a specific name instead of random |

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
$ yolobox run

┌   yolobox v0.0.1
│
◆  Docker is running
│
◆  Git repo detected
│
◆  Created worktree .yolobox/swift-falcon (branch: swift-falcon)
│
└  Launching swift-falcon...

> (Claude Code session starts)
```

## Git Worktree Path Fixup

Git worktrees use a `.git` *file* (not directory) that contains an absolute path
back to the main repo's `.git/worktrees/<id>` directory. Inside the container,
that host path doesn't exist.

**Solution:** The container mounts two volumes:
- `.yolobox/<id>/` → `/workspace` (the worktree, read-write)
- `.git/` → `/repo/.git` (the main git dir, read-write)

The entrypoint rewrites both pointers on startup:
1. `/workspace/.git` → `gitdir: /repo/.git/worktrees/<id>`
2. `/repo/.git/worktrees/<id>/gitdir` → `/workspace`

The `YOLOBOX_ID` env var is passed to the container so the entrypoint knows
which worktree to fix up.

## Error Messages

| Condition | Message |
|-----------|---------|
| Docker not running | `Docker is not running. Start Docker Desktop and try again.` |
| Not a git repo | `Not a git repo. yolobox needs git worktrees — run this inside a repo.` |

## Implementation Files

- `src/commands/run.ts` — Command orchestration
- `src/lib/docker.ts` — Docker check and container execution
- `src/lib/git.ts` — Git repo checks and identity
- `src/lib/worktree.ts` — Worktree creation and .gitignore management
- `src/lib/id.ts` — ID generation with word lists
- `src/lib/ui.ts` — Styled terminal output
- `docker/Dockerfile` — Container image definition
- `docker/entrypoint.sh` — Container startup script
