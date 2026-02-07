# yolobox — Product Requirements Document

Run Claude Code with `--dangerously-skip-permissions` in an isolated Docker
container. Each yolobox gets its own git worktree and branch, so multiple AI
agents can work on the same repo simultaneously without conflicts.

```bash
npx yolobox claude              # Launch Claude with skip permissions
npx yolobox run                 # Launch a bash shell
```

---

## Core Concept

When you run `yolobox claude` (or `yolobox run`) inside a git repo:

1. A human-friendly ID is generated (e.g., `swift-falcon`)
2. A git worktree is created at `.yolobox/swift-falcon/` on branch `swift-falcon`
3. A Docker container spins up with that worktree mounted as `/workspace`
4. Your chosen environment starts (Claude Code with `--dangerously-skip-permissions` or bash)

You can spin up as many yoloboxes as you want — each one works on its own
branch, so they never step on each other's toes.

---

## CLI Commands

```
yolobox run [options]       Launch a shell in a new yolobox
yolobox claude [options]    Launch Claude Code with skip permissions
yolobox ls                  List active yoloboxes
yolobox kill <id>           Stop and remove a running yolobox
yolobox attach <id>         Reattach to a running yolobox
yolobox stop <id>           Stop a running yolobox
yolobox rm <id>             Stop + remove worktree + delete branch
yolobox prune               Clean up all stopped yoloboxes
```

### `yolobox run`

Launches a bash shell in a new sandboxed container.

```
yolobox run                   Launch bash shell
yolobox run --name cool-tiger Use a specific ID instead of random
```

**Flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--name <id>` | `-n` | Use a specific name instead of random |

**Deferred flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--detach` | `-d` | Run in background, don't attach |
| `--pull` | | Force-pull the latest Docker image |
| `--base <ref>` | `-b` | Create worktree from this ref (default: HEAD) |

### `yolobox claude`

Launches Claude Code with `--dangerously-skip-permissions` in a new sandboxed container.

```
yolobox claude                       Interactive Claude session
yolobox claude -p "fix the login bug" Start Claude with a prompt
yolobox claude --name cool-tiger     Use a specific ID instead of random
```

**Flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--prompt <text>` | `-p` | Pass an initial prompt to Claude |
| `--name <id>` | `-n` | Use a specific name instead of random |

**Deferred flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--detach` | `-d` | Run in background, don't attach |
| `--pull` | | Force-pull the latest Docker image |
| `--base <ref>` | `-b` | Create worktree from this ref (default: HEAD) |

**What the user sees:**

```
$ yolobox claude

  yolobox v0.1.0

  ✓ Docker is running
  ✓ Git repo detected
  ✓ Created worktree .yolobox/swift-falcon (branch: swift-falcon)

  Launching Claude in swift-falcon...

> (Claude Code session starts with --dangerously-skip-permissions)
```

```
$ yolobox run

  yolobox v0.1.0

  ✓ Docker is running
  ✓ Git repo detected
  ✓ Created worktree .yolobox/clever-otter (branch: clever-otter)

  Launching shell in clever-otter...

dev@clever-otter:/workspace$ (bash shell)
```

### `yolobox ls`

```
$ yolobox ls

  ID              BRANCH          STATUS     CREATED
  swift-falcon    swift-falcon    running    2 min ago
  clever-otter    clever-otter    stopped    1 hour ago
```

### `yolobox attach <id>`

Reattach to a running container's Claude session. Supports tab-completion
of IDs (or an interactive picker if no ID is given).

```
$ yolobox attach
  ? Select a yolobox to attach to:
  ● swift-falcon (running, 2 min ago)
  ○ clever-otter (stopped — will restart)
```

### `yolobox stop <id>`

Stops the container but preserves the worktree and branch. The work is
still there, you can resume later with `yolobox attach`.

### `yolobox rm <id>`

Stops the container, removes the git worktree, and deletes the branch.
Prompts for confirmation if the branch has unmerged commits.

```
$ yolobox rm swift-falcon
  ⚠ Branch swift-falcon has 3 unmerged commits. Remove anyway?
  ● Yes, delete everything
  ○ No, keep it
```

### `yolobox prune`

Removes all stopped yoloboxes (containers, worktrees, branches). Prompts
with a list showing what will be removed.

---

## ID Generation

IDs follow the `adjective-noun` pattern using curated word lists:

- **Adjectives**: swift, clever, bold, bright, calm, deft, keen, apt, crisp,
  sharp, witty, lucid, agile, vivid, frank, noble, prime, sage, tidy, warm...
- **Nouns**: falcon, otter, cedar, ember, flint, heron, maple, pebble,
  quartz, raven, spark, tiger, basin, coral, delta, forge, grove, knoll,
  latch, ridge...

~400 adjectives × ~400 nouns = ~160,000 unique combinations. Enough to
avoid collisions in any reasonable scenario. IDs are checked against existing
worktrees before use.

Word lists are bundled in the package (a few KB). No external dependency.

---

## Git Worktree Strategy

```
my-project/                     ← user's repo (cwd)
├── .yolobox/                   ← created by yolobox, gitignored
│   ├── swift-falcon/           ← git worktree (branch: swift-falcon)
│   │   └── ... (project files)
│   └── clever-otter/           ← another worktree
│       └── ...
├── src/
├── package.json
└── .gitignore                  ← .yolobox/ added here
```

**On `yolobox run`:**
```bash
mkdir -p .yolobox
git worktree add .yolobox/<id> -b <id>    # branch from HEAD (or --base)
```

**On `yolobox rm`:**
```bash
git worktree remove .yolobox/<id>
git branch -d <id>                         # -D if --force
```

The CLI automatically adds `.yolobox/` to `.gitignore` if not already there.

**State is derived, not stored.** We don't keep a state file. Active yoloboxes
are determined by combining `docker ps --filter name=yolobox-*` with
`git worktree list`. This avoids stale state bugs.

---

## Docker Container

### What Gets Mounted

| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| `.yolobox/<id>/` | `/workspace` | Git worktree (read/write) |

**Not mounted:**
- `~/.claude` — user authenticates inside the container each time
- `~/.gitconfig` — git identity is configured via entrypoint

### Container Naming

Containers are named `yolobox-<id>` (e.g., `yolobox-swift-falcon`). This
makes them easy to identify in `docker ps` and avoids conflicts.

### Docker Image

**Registry:** `ghcr.io/roginn/yolobox`
**Tags:** `latest` + semver on release

Based on the existing enclaude Dockerfile:
- Debian bookworm-slim base
- Node.js 22 LTS
- Python 3.11
- GitHub CLI (`gh`)
- Build tools (gcc, g++, make, cmake)
- Utilities (git, curl, wget, jq, ripgrep, fd-find, vim)
- Claude Code (preinstalled via native installer)
- Non-root `dev` user with passwordless sudo

### Entrypoint

The entrypoint script:
1. Configures git identity (from env vars passed by the CLI)
2. Execs into the requested command (claude or bash)

---

## Tech Stack

### Runtime Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `citty` | CLI framework (commands, arg parsing) | ~15 KB |
| `@clack/prompts` | Terminal UI (selectors, spinners, styled output) | ~30 KB |
| `picocolors` | Terminal colors | ~3 KB |

**Total: ~50 KB of dependencies.** All three are modern, fast, zero-bloat
libraries from the current generation of Node.js tooling.

### Why These

- **citty** (UnJS): Type-safe `defineCommand`, elegant API, modern. Used by
  Nuxt/Nitro ecosystem. Beats commander (legacy API) and yargs (bloated).
- **@clack/prompts**: Beautiful terminal UI out of the box. `select`,
  `confirm`, `spinner`, `text` — all styled consistently. Used by SvelteKit,
  Astro, and other modern CLIs. The closest thing to Claude Code's terminal
  polish without building a full TUI.
- **picocolors**: 15x smaller than chalk, faster. Does one thing well.

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | Type safety |
| `tsup` | Bundle TypeScript → JS (esbuild-powered) |
| `vitest` | Testing |
| `@types/node` | Node.js type definitions |

### Why TypeScript

A CLI with subcommands, Docker orchestration, platform detection, and git
worktree management benefits from type safety. `tsup` makes the build
step invisible — one command, produces a single bundled JS file.

---

## Project Structure

```
yolobox/
├── src/                          # TypeScript source
│   ├── index.ts                  # CLI entry point (command routing)
│   ├── commands/
│   │   ├── run.ts                # yolobox run (shell)
│   │   ├── claude.ts             # yolobox claude (skip permissions)
│   │   ├── ls.ts                 # yolobox ls
│   │   ├── kill.ts               # yolobox kill
│   │   ├── attach.ts             # yolobox attach (planned)
│   │   ├── stop.ts               # yolobox stop (planned)
│   │   ├── rm.ts                 # yolobox rm (planned)
│   │   └── prune.ts              # yolobox prune (planned)
│   └── lib/
│       ├── container-setup.ts    # Shared setup logic for run/claude
│       ├── docker.ts             # Docker interactions (run, ps, stop, pull)
│       ├── worktree.ts           # Git worktree operations
│       ├── id.ts                 # ID generation (adjective-noun)
│       ├── git.ts                # Git helpers (identity, branch status)
│       └── ui.ts                 # Styled output, banners, formatters
│
├── docker/                       # Docker image source
│   ├── Dockerfile                # Image definition
│   └── entrypoint.sh             # Container startup script
│
├── bin/
│   └── yolobox.js                # Thin shebang wrapper → dist/index.js
│
├── test/
│   ├── id.test.ts                # ID generation tests
│   ├── worktree.test.ts          # Worktree logic tests
│   └── docker.test.ts            # Docker command construction tests
│
├── .github/
│   └── workflows/
│       ├── ci.yml                # Lint + test on PR
│       ├── docker-publish.yml    # Build + push image to GHCR
│       └── release.yml           # npm publish + docker tag on version tag
│
├── dist/                         # Built output (gitignored)
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── CLAUDE.md
├── TODO.md
├── PRD.md
├── LICENSE
└── README.md
```

### What Goes Where

- **npm package** (`files` field): `bin/` + `dist/` only. The docker/
  directory, tests, and config files are excluded. The published package
  is tiny — just the bundled CLI.
- **Docker image** (GHCR): Built from `docker/Dockerfile` in CI. Not part
  of the npm package. Users never build the image themselves.
- **GitHub Actions**: Three workflows covering CI, Docker image publishing,
  and npm releases.

---

## Build & Development

### Local Development

```bash
# Install dependencies
npm install

# Build (one-shot)
npm run build

# Watch mode (rebuild on change)
npm run dev

# Link globally for testing
npm link

# Now test it:
yolobox run
```

### Building the Docker Image Locally

```bash
# Build image locally (for testing)
npm run docker:build

# This builds docker/Dockerfile and tags it as yolobox:local
# The CLI can be told to use a local image via:
YOLOBOX_IMAGE=yolobox:local yolobox run
```

### package.json Scripts

```json
{
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest",
    "docker:build": "docker build -t yolobox:local -f docker/Dockerfile docker/",
    "prepublishOnly": "npm run build"
  }
}
```

---

## CI/CD

### On Pull Request (`ci.yml`)
- Install deps
- Lint (if we add a linter later)
- Run tests (`vitest`)
- Build (`tsup`) — verify it compiles

### On Push to Main (`docker-publish.yml`)
- Build multi-arch Docker image (`linux/amd64` + `linux/arm64`)
- Push to GHCR as `ghcr.io/roginn/yolobox:latest`

### On Version Tag `v*` (`release.yml`)
- Build + push Docker image tagged with version (e.g., `:0.1.0`)
- Also push as `:latest`
- `npm publish` with provenance

### Release Flow

```bash
# Bump version, create tag, push
npm version patch    # or minor/major
git push --follow-tags

# GitHub Actions takes it from there:
# → builds docker image with version tag
# → publishes to npm
```

---

## Image Update Strategy

The CLI does **not** auto-update the Docker image (surprise downloads are
bad UX). Instead:

- `yolobox run --pull` explicitly pulls the latest image
- If the cached image is >30 days old, print a hint:
  ```
  hint: image is 42 days old. run yolobox run --pull to update
  ```
- On first run (no cached image), the pull happens automatically with a
  progress indicator

---

## Error Handling

The CLI should fail gracefully with clear, actionable messages:

| Condition | Message |
|-----------|---------|
| Docker not installed | `Docker is not installed. Get it at https://docker.com/get-started` |
| Docker not running | `Docker is not running. Start Docker Desktop and try again.` |
| Not a git repo | `Not a git repo. yolobox needs git worktrees — run this inside a repo.` |
| Image not cached | Shows pull progress with spinner |
| Worktree name conflict | Generates a new ID and retries |

---

## Open Questions

1. **Should `yolobox run` keep you attached (interactive) by default, or
   detach and let you `attach` later?** Current plan: interactive by default,
   `--detach` flag for background. This matches the "just run it" philosophy.

2. **Should we pass the host's git identity (name/email) into the container?**
   Claude Code needs this for commits. We can read it from `git config` and
   pass as env vars. Seems like the right call.

3. **What happens when a yolobox's branch gets merged?** The worktree is
   still there. `yolobox prune` should detect merged branches and offer to
   clean them up.

4. **Multi-arch image build time.** QEMU-based arm64 builds on GitHub Actions
   can be slow (~15 min). We could use native arm64 runners if available, or
   accept the build time.

5. **Should the docker image be configurable?** Power users might want to use
   a custom image with additional tools. An env var
   (`YOLOBOX_IMAGE=my-image:tag`) or config file could support this.
