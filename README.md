# yolobox

Give [Claude Code](https://docs.anthropic.com/en/docs/claude-code) the `--dangerously-skip-permissions` flag and let it go absolutely feral — safely, inside a Docker container. Each yolobox gets its own git worktree and branch, so you can run multiple AI agents on the same repo in parallel without them stepping on each other's toes.

You only live once. Might as well sandbox it.

## Quick start

```bash
npx yolobox claude                       # YOLO — launch Claude with skip-permissions
npx yolobox claude -p "fix the login bug" # YOLO with a mission
npx yolobox start                         # Just give me a shell, I'll YOLO manually
```

> Containers get randomly generated IDs like `swift-falcon` or `bold-otter` because every reckless experiment deserves a cool codename.

## Commands

### `yolobox claude [name] [-p <prompt>]`

The main event. Spins up a fresh container and drops you straight into Claude Code with `--dangerously-skip-permissions` enabled. Claude can read, write, execute — no guardrails, no "are you sure?" popups. That's the whole point.

```bash
yolobox claude                           # Interactive Claude session, full send
yolobox claude -p "refactor auth to JWT" # Give Claude a prompt and watch it go
yolobox claude my-feature                # Use a custom name instead of a random one
```

### `yolobox start [name]`

Same container setup as `claude`, but drops you into a bash shell instead. For when you want to poke around, run tests, or do your own yoloing.

```bash
yolobox start                            # Shell in a new yolobox
yolobox start my-feature                 # Named yolobox — reattaches if already running
```

If you give it a name that already exists, it'll reattach to the existing container instead of creating a new one. No wasted containers, just vibes.

### `yolobox attach [id]`

Jump back into a running yolobox. If you don't specify an ID, you get a slick interactive picker. If the container was stopped, it'll restart it for you automatically — because who has time to babysit Docker.

```bash
yolobox attach                           # Pick from running containers
yolobox attach swift-falcon              # Attach to a specific one
```

### `yolobox ls`

See what's running. Shows ID, branch, status, age, and which repo each container belongs to.

```bash
yolobox ls
```

```
ID              BRANCH              STATUS    CREATED     PATH
swift-falcon    yolo/swift-falcon   running   5 min ago   ~/code/myproject
bold-otter      yolo/bold-otter     stopped   2h ago      ~/code/myproject
```

### `yolobox kill [id]`

Stop and remove a container. The worktree and branch stick around so you can still see what happened. Interactive picker if you don't specify an ID.

```bash
yolobox kill                             # Pick one to kill
yolobox kill swift-falcon                # Kill a specific container
```

### `yolobox rm [id]`

The full cleanup. Kills the container, removes the git worktree, and deletes the `yolo/*` branch. Like it never happened.

```bash
yolobox rm                               # Pick one to remove
yolobox rm swift-falcon                  # Remove everything for swift-falcon
```

### `yolobox nuke [--all]`

For when you want to start completely fresh. Shows you everything that exists (containers, branches, worktrees) and lets you choose between killing just containers or going full scorched-earth.

```bash
yolobox nuke                             # Nuke everything in the current repo
yolobox nuke --all                       # Nuke yolobox containers from ALL repos
```

## How it works

When you run a command, yolobox:

1. **Creates a git worktree** at `.yolobox/<id>` on a new branch `yolo/<id>`, forked from your current HEAD
2. **Launches a Docker container** that mounts the worktree as `/workspace` and shares your repo's `.git` directory
3. **Forwards your git identity** so commits inside the container show up as you
4. **Injects your Claude auth token** so there's no login prompt inside the container

Each yolobox is fully isolated. Claude can `rm -rf` whatever it wants, install weird packages, rewrite your entire codebase — and it all stays contained in its own worktree and branch. Your main branch doesn't flinch.

## Authentication

Claude Code needs to authenticate inside each container. Set up a token once and yolobox handles the rest:

```bash
# Step 1: Generate a long-lived token
claude setup-token

# Step 2: Store it in yolobox
yolobox auth <token>
```

Or if you have the `CLAUDE_CODE_OAUTH_TOKEN` env var set:

```bash
yolobox auth    # Automatically picks up the env var
```

```bash
yolobox auth --status   # Check current auth status
yolobox auth --remove   # Remove stored token
```

The token is saved to `~/.yolobox/auth.json` and automatically injected into every new container.

## What's in the box

The yolobox Docker image is based on Debian Bookworm and comes with everything Claude might need to be dangerous:

- **Node.js 22** LTS + npm
- **Python 3** + pip + venv
- **Build tools** — gcc, g++, make, cmake
- **Git** + **GitHub CLI** (`gh`)
- **ripgrep** (`rg`) + **fd** — because Claude deserves fast search tools too
- **vim**, curl, wget, jq, and other essentials
- **Claude Code** — pre-installed via the official installer
- Non-root `dev` user with passwordless `sudo`

## Custom Docker image

Want to bring your own container? Set the `YOLOBOX_IMAGE` env var:

```bash
YOLOBOX_IMAGE=my-custom-image:latest yolobox claude
```

Image resolution order:
1. `YOLOBOX_IMAGE` env var (if set)
2. `yolobox:local` (if you've built it locally)
3. `ghcr.io/roginn/yolobox:latest` (default)

## Install

```bash
npm install -g yolobox
```

Requires Docker and Node.js 18+.

## Development

```bash
npm install                    # Install dependencies
npm run docker:build           # Build the Docker image locally (~5 min, one-time)
npm link                       # Link the CLI globally

npm run build                  # One-shot TypeScript build
npm run dev                    # Watch mode
npm test                       # Run tests
```

## License

MIT
