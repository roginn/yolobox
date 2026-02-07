# ~~Add `yolobox shell` command~~ → SUPERSEDED

**Status:** This feature request has been superseded by the command refactoring.

- `yolobox run` now launches a bash shell by default (was the original intent of this PRD)
- For attaching to *existing* containers, a future `yolobox attach` command will handle that use case

## Original Context
Users need a way to attach a bash shell to an already-running yolobox container for debugging or manual work. The plumbing already exists (`docker.execInContainer` with interactive TTY), we just need a new command to expose it.

## Plan

### 1. Create `src/commands/shell.ts`
New command following the same pattern as `kill.ts`:
- **Positional arg**: `id` (optional — if omitted, list running containers and prompt with `@clack/prompts select`)
- Validate Docker is running
- Validate container exists and is running (filter `listContainers()` results)
- Call `docker.execInContainer(id, ['bash'])` to attach
- Exit with the container's exit code

**UX when no ID provided:**
- Call `docker.listContainers()`, filter to `status === 'running'`
- If none running → error message, exit
- If exactly one → use it automatically
- If multiple → show `@clack/prompts select` picker

### 2. Register in `src/index.ts`
Import and add `shell` to `subCommands`.

## Files to modify
- `src/commands/shell.ts` (new)
- `src/index.ts` (add import + subcommand)

## Reuse
- `docker.listContainers()` — container discovery (`src/lib/docker.ts:84`)
- `docker.execInContainer()` — interactive attach (`src/lib/docker.ts:58`)
- `docker.isDockerRunning()` — preflight check (`src/lib/docker.ts:3`)
- `ui.error()`, `ui.success()` — output (`src/lib/ui.ts`)
- `@clack/prompts` select — interactive picker (via `ui.prompts`)

## Verification
1. `npm run build` — compiles
2. Start a container: `yolobox run --shell`, then exit
3. `yolobox shell <id>` — should attach bash to the running container
4. `yolobox shell` (no args, one running) — should auto-select
5. `yolobox shell` (no args, multiple running) — should show picker
6. `yolobox shell` (none running) — should show error
