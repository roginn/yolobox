# `yolobox kill` — Feature Requirements

## What It Does

Stops and removes a yolobox container. Unlike `attach` (which only works with running containers), `kill` can target both running and stopped containers. The worktree and branch are preserved.

```bash
yolobox kill                   # Pick from all containers
yolobox kill swift-falcon      # Kill a specific container
```

## Flow

1. **Check Docker** — `docker info` silently. Fail with clear message if not running.
2. **Resolve target container:**
   - **ID provided** — Look up the container in `listContainers()`. Validate it exists. Fail with clear message if not found.
   - **No ID provided** — Always show interactive picker for safety (even if only one container exists):
     - If none exist → error message, exit.
     - Show `@clack/prompts select` interactive picker with status and path hints.
3. **Kill** — `docker stop yolobox-<id>` then `docker rm yolobox-<id>`.
4. **Confirm** — Show success message or error if kill operation failed.

## CLI Args

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `id` | positional | no | The yolobox ID to kill. If omitted, shows interactive picker. |

## User-Visible Output

### With ID provided

```
$ yolobox kill swift-falcon

✔  Killed yolobox-swift-falcon
```

### No ID, one container

```
$ yolobox kill

◆  Pick a container to kill
│  ● swift-falcon  running • ~/projects/myapp
│  ○ Cancel  Exit without killing
└

✔  Killed yolobox-swift-falcon
```

### No ID, multiple containers

```
$ yolobox kill

◆  Pick a container to kill
│  ● swift-falcon  running • ~/projects/myapp
│  ○ bold-otter    stopped • ~/projects/myapp
│  ○ Cancel  Exit without killing
└

✔  Killed yolobox-swift-falcon
```

## Error Messages

| Condition | Message |
|-----------|---------|
| Docker not running | `Docker is not running.` |
| ID not found | `No yolobox container found with ID "<id>".` |
| No containers exist (no ID) | `No yolobox containers found.` |
| Kill operation failed | `Failed to kill yolobox-<id>. Is it running?` |
| User cancels picker (Ctrl+C) | Exit silently with code 0. |
| User selects Cancel option | Exit silently with code 0. |

## Differences from `attach`

- **Filter scope**: `attach` filters to running only, `kill` shows all containers (running + stopped).
- **Validation**: `attach` validates running status, `kill` only validates existence.
- **Picker hint**: Shows `status • path` to help distinguish containers.
- **Safety**: `kill` always shows picker when no ID provided (even for single container), while `attach` auto-selects single running containers since attaching is non-destructive.

## Implementation Files

- `src/commands/kill.ts` — Command orchestration (modified)
- `src/lib/docker.ts` — Container listing and kill (reuse, no changes)
- `src/lib/ui.ts` — Styled terminal output and prompts (reuse, no changes)
- `test/kill.test.ts` — Unit tests (new)
