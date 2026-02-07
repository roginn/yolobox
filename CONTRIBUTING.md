# Contributing to yolobox

## Prerequisites

- Node.js 22+
- Docker (for building/testing the container image)

## Setup

```sh
git clone https://github.com/roginn/yolobox.git
cd yolobox
npm install
```

## Development

```sh
npm run dev      # watch mode — rebuilds on file changes
npm run build    # one-off production build (tsup → dist/index.js)
npm test         # vitest in watch mode
npm test -- --run  # single run (CI mode)
npm run lint     # biome check (lint + format)
npm run lint:fix # auto-fix lint and format issues
```

To test the CLI locally after building:

```sh
node bin/yolobox.js --help
```

## Project structure

```
src/
  index.ts              # CLI entrypoint — citty main command with subcommands
  commands/
    run.ts              # yolobox run — bash shell in container
    claude.ts           # yolobox claude — Claude with --dangerously-skip-permissions
    ls.ts               # yolobox ls — list running containers
    kill.ts             # yolobox kill — stop and remove a container
    nuke.ts             # yolobox nuke — kill all containers
    help.ts             # yolobox help — usage examples
  lib/
    container-setup.ts  # shared setup logic (worktree, docker run)
    docker.ts           # docker CLI wrappers (buildDockerArgs, runContainer, etc.)
    git.ts              # git CLI wrappers
    worktree.ts         # git worktree management
    id.ts               # container ID generation
    ui.ts               # @clack/prompts wrappers
test/
  docker.test.ts        # buildDockerArgs tests
  id.test.ts            # ID generation tests
docker/
  Dockerfile            # container image (Debian + Node 22 + Claude Code)
  entrypoint.sh         # container entrypoint
bin/
  yolobox.js            # npm bin shebang wrapper → dist/index.js
```

## Key conventions

- **ESM only** — `"type": "module"` in package.json, tsup outputs ESM
- **No semicolons**, single quotes, 2-space indent — enforced by Biome
- **Pure functions for testability** — `buildDockerArgs` is pure, `runContainer` is the thin IO wrapper. Prefer this pattern for new code
- **No state files** — state is derived from `docker ps` + `git worktree list`
- **Dependency injection for OS APIs** — `os.platform()` etc. can't be spied on; pass them as parameter defaults instead

## Docker image

Build locally:

```sh
npm run docker:build    # builds yolobox:local
```

The image is also published to `ghcr.io/roginn/yolobox` on every push to main and on version tags.

## CI/CD

Three GitHub Actions workflows:

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| **CI** | push to `main`, all PRs | lint, test, build |
| **Docker** | push to `main`, `v*` tags | build and push image to GHCR |
| **Publish** | `v*` tags | publish to npm |

CI cancels in-progress runs when you push again to the same PR branch.

## Releasing

Releases are driven by git tags. The tag is the source of truth for versioning — no need to update `package.json` manually.

```sh
# 1. Make sure main is clean and CI is green
git checkout main
git pull

# 2. Tag the release
git tag v0.1.0

# 3. Push the tag — triggers Docker push + npm publish
git push --tags
```

This will:
- Build and push `ghcr.io/roginn/yolobox:0.1.0` and `:latest`
- Publish `yolobox@0.1.0` to npm (version derived from tag)

### Required secrets

| Secret | Where | Purpose |
|--------|-------|---------|
| `GITHUB_TOKEN` | automatic | GHCR authentication |
| `NPM_TOKEN` | repo settings → Secrets | npm publish (generate at npmjs.com → Access Tokens) |
