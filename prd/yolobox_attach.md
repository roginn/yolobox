# `yolobox attach` — Feature Requirements

## What It Does

Attaches a bash shell to an already-running yolobox container. Unlike `run` (which creates a new container with its own worktree), `attach` reconnects to an existing one.

```bash
yolobox attach                   # Pick from running containers
yolobox attach swift-falcon      # Attach to a specific container
```

## Flow

1. **Check Docker** — `docker info` silently. Fail with clear message if not running.
2. **Resolve target container:**
   - **ID provided** — Look up the container in `listContainers()`. Validate it exists
     and has `status === 'running'`. Fail with clear message otherwise.
   - **No ID provided** — List all yolobox containers, filter to running only:
     - If none running → error message, exit.
     - If exactly one → use it automatically (skip the picker).
     - If multiple → show `@clack/prompts select` interactive picker.
3. **Attach** — `docker exec -it yolobox-<id> bash`. Block until session exits.
4. **Exit** — Forward the container's exit code.

## CLI Args

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `id` | positional | no | The yolobox ID to attach to. If omitted, shows interactive picker. |

## User-Visible Output

### With ID provided

```
$ yolobox attach swift-falcon

└  Attaching to swift-falcon...

dev@swift-falcon:/workspace$
```

### No ID, one running container

```
$ yolobox attach

└  Attaching to swift-falcon...

dev@swift-falcon:/workspace$
```

### No ID, multiple running containers

```
$ yolobox attach

◆  Pick a container to attach to
│  ● swift-falcon  ~/projects/myapp
│  ○ bold-otter    ~/projects/myapp
└

└  Attaching to swift-falcon...

dev@swift-falcon:/workspace$
```

## Error Messages

| Condition | Message |
|-----------|---------|
| Docker not running | `Docker is not running.` |
| ID not found | `No yolobox container found with ID "<id>".` |
| ID exists but stopped | `Container "<id>" is not running (status: stopped).` |
| No running containers (no ID) | `No running yolobox containers found.` |
| User cancels picker | Exit silently with code 0. |

## Implementation Files

- `src/commands/attach.ts` — Command orchestration (new)
- `src/index.ts` — Register subcommand (modify)
- `src/lib/docker.ts` — Container listing and exec (reuse, no changes)
- `src/lib/ui.ts` — Styled terminal output and prompts (reuse, no changes)
- `test/attach.test.ts` — Unit tests (new)
