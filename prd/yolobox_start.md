# `yolobox start` — Feature Requirements

## What It Does

Launches a bash shell in a new Docker container with its own git worktree and branch.

```bash
yolobox start                   # Launch bash shell
yolobox start --name cool-tiger # Use a specific ID instead of random
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
8. **Launch container** — `docker run -it --rm` with worktree mounted at `/workspace`
   and the repo's `.git` dir mounted at `/repo/.git`. The entrypoint
   rewrites the worktree's `.git` pointer to use the container path. Block until
   container exits.

## CLI Flags (MVP)

| Flag | Short | Description |
|------|-------|-------------|
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
$ yolobox start

┌   yolobox v0.0.1
│
◆  Docker is running
│
◆  Git repo detected
│
◆  Created worktree .yolobox/swift-falcon (branch: swift-falcon)
│
└  Launching shell in swift-falcon...

dev@swift-falcon:/workspace$ (bash shell)
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
| Not a git repo | Prompt: `No git repo found. Initialize one here?` If declined: `yolobox needs a git repo for worktrees.` |
| No commits | Auto-create an empty initial commit (no prompt needed) |

## Implementation Files

- `src/commands/start.ts` — Command orchestration
- `src/lib/docker.ts` — Docker check and container execution
- `src/lib/git.ts` — Git repo checks and identity
- `src/lib/worktree.ts` — Worktree creation and .gitignore management
- `src/lib/id.ts` — ID generation with word lists
- `src/lib/ui.ts` — Styled terminal output
- `docker/Dockerfile` — Container image definition
- `docker/entrypoint.sh` — Container startup script
