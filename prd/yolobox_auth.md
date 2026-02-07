# `yolobox auth` — Feature Requirements

## What It Does

Configures Claude Code authentication so containers can use Claude without requiring the user to log in each time a new container is spawned.

```bash
yolobox auth <token>       # Store a token from `claude setup-token`
yolobox auth               # Auto-capture from $CLAUDE_CODE_OAUTH_TOKEN, or show setup instructions
yolobox auth --status      # Show current auth status
yolobox auth --remove      # Remove stored token
```

## Flow

1. **User generates token** — Run `claude setup-token` on the host machine to get a long-lived OAuth token.
2. **User stores token** — Run `yolobox auth <token>` to save it to `~/.yolobox/auth.json`.
3. **Container startup** — When `yolobox claude` or `yolobox run` creates a container, the token is passed as the `CLAUDE_CODE_OAUTH_TOKEN` environment variable.
4. **Entrypoint configuration** — The container's `entrypoint.sh` detects the token and merges `{"hasCompletedOnboarding": true, "theme": "dark"}` into `~/.claude.json` so Claude skips onboarding.
5. **Claude authenticates** — Claude Code reads `CLAUDE_CODE_OAUTH_TOKEN` from the environment and authenticates without prompting.

## Token Resolution Priority

When starting a container, the token is resolved in this order:

1. `CLAUDE_CODE_OAUTH_TOKEN` environment variable on the host (always wins)
2. Stored token from `~/.yolobox/auth.json`
3. No token — Claude prompts for login inside the container (current behavior, unchanged)

## CLI Flags

| Flag | Description |
|------|-------------|
| `<token>` (positional) | OAuth token to store |
| `--status` | Show whether a token is configured and its source |
| `--remove` | Remove the stored token |

## User-Visible Output

### Storing a token

```
$ yolobox auth sk-ant-oat01-_BdXXXXXXXXXXXXXXXXXXAA

┌   yolobox v0.0.1
│
◆  Token saved. (sk-ant-oat...XXAA)
│
◇  Claude will authenticate automatically in new containers.
```

### Auto-capture from env var

```
$ export CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-_BdXXXXXXXXXXXXXXXXXXAA
$ yolobox auth

┌   yolobox v0.0.1
│
◆  Token captured from CLAUDE_CODE_OAUTH_TOKEN. (sk-ant-oat...XXAA)
│
◇  Claude will authenticate automatically in new containers.
```

### No token, show instructions

```
$ yolobox auth

┌   yolobox v0.0.1
│
◇  Set up Claude Code authentication for yolobox containers.
│
◇  Step 1: Generate a token on your host machine:
◇    $ claude setup-token
│
◇  Step 2: Pass the token to yolobox:
◇    $ yolobox auth <token>
│
◇  Or set the CLAUDE_CODE_OAUTH_TOKEN env var and run:
◇    $ export CLAUDE_CODE_OAUTH_TOKEN=<token>
◇    $ yolobox auth
```

### Container startup with token

```
$ yolobox claude

┌   yolobox v0.0.1
│
◆  Docker is running
◆  Git repo detected
◆  Created worktree .yolobox/swift-falcon (branch: swift-falcon)
◆  Claude auth token configured
◇  Using local Docker image: yolobox:local
│
└  Launching Claude in swift-falcon...
```

### Container startup without token

```
$ yolobox claude

┌   yolobox v0.0.1
│
◆  Docker is running
◆  Git repo detected
◆  Created worktree .yolobox/swift-falcon (branch: swift-falcon)
▲  No Claude auth token. Run "yolobox auth" to set up.
◇  Using local Docker image: yolobox:local
│
└  Launching Claude in swift-falcon...
```

## Error Messages

| Condition | Message |
|-----------|---------|
| Invalid token format | `Invalid token. Expected a token starting with "sk-ant-".` |
| Invalid env var token | `CLAUDE_CODE_OAUTH_TOKEN is set but does not look like a valid token.` |
| Remove with no token | `No stored token found.` |
| Status with no token | `Not authenticated. Run "yolobox auth" for setup instructions.` |

## Security

- Token stored at `~/.yolobox/auth.json` with `0600` permissions (owner read/write only)
- Directory `~/.yolobox/` created with `0700` permissions
- Token passed as Docker environment variable (visible in `docker inspect`, acceptable for local dev tool)
- Token never logged or printed in full; always masked in output

## Implementation Files

- `src/commands/auth.ts` — CLI command implementation
- `src/lib/auth.ts` — Token storage, retrieval, validation, and masking
- `src/lib/container-setup.ts` — Reads token during container setup
- `src/lib/docker.ts` — Passes token as env var to container
- `docker/entrypoint.sh` — Merges `~/.claude.json` onboarding config
- `test/auth.test.ts` — Unit tests for auth lib
- `test/docker.test.ts` — Updated tests for token in Docker args
