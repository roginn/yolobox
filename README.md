# yolobox

Run [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with `--dangerously-skip-permissions` in disposable Docker containers. Spin up as many as you want, let them run wild, merge the results.

```bash
yolobox claude                           # Launch Claude with --dangerously-skip-permissions
yolobox claude -p "fix the login bug"    # Launch with a prompt
yolobox start                            # Drop into a shell instead
yolobox ls                               # List running boxes
yolobox attach                           # Reattach to a running box
yolobox kill                             # Stop a box (keeps branch)
yolobox rm                               # Remove box + branch + worktree
yolobox nuke                             # Scorched earth — remove everything
```

## Install

```bash
npm install -g yolobox
```

Requires Docker and Node.js 18+.

## What's a yolobox?

A yolobox is three things, created together as a single unit:

- **Docker container** — Claude can install packages, delete files, run arbitrary commands. Your host machine doesn't feel a thing.
- **Git worktree** — an isolated copy of your codebase at `.yolobox/<id>`, separate from your working directory and from every other box.
- **Git branch** — a `yolo/<id>` branch forked from HEAD. Every change is tracked and easy to review, merge, or throw away.

Create a box, get all three. Remove a box, all three are cleaned up.

`--dangerously-skip-permissions` makes Claude Code dramatically more productive, but running it on your actual machine requires a level of trust that borders on spiritual. And running *multiple* instances on the same repo? They'd all be editing the same files and tripping over each other.

yolobox gives each Claude instance its own container (safety) and its own worktree (isolation). Open a few terminals, fire off parallel agents, and review the branches when they're done. Keep what works, toss what doesn't.

## Commands

### `yolobox claude [name] [-p <prompt>]`

The main event. Spins up a fresh yolobox and drops you straight into Claude Code with `--dangerously-skip-permissions`. Full send.

```bash
yolobox claude                           # Interactive Claude session
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

Stop and remove a container. The worktree and branch stick around so you can still see what happened.

```bash
yolobox kill                             # Pick one to kill
yolobox kill swift-falcon                # Kill a specific container
```

### `yolobox rm [id]`

The full cleanup. Kills the container, removes the git worktree, and deletes the `yolo/<id>` branch. Like it never happened.

```bash
yolobox rm                               # Pick one to remove
yolobox rm swift-falcon                  # Remove everything for swift-falcon
```

### `yolobox nuke [--all]`

For when you want to start completely fresh. Shows you everything that exists (containers, branches, worktrees) and lets you choose between killing just containers or going full scorched-earth. No questions asked. (*)

```bash
yolobox nuke                             # Nuke everything in the current repo
yolobox nuke --all                       # Nuke yolobox containers from ALL repos
```

(*) Actually we do ask for confirmation.

## Under the hood

When you create a yolobox, the CLI:

1. **Creates a git worktree** at `.yolobox/<id>` on a new `yolo/<id>` branch forked from HEAD
2. **Launches a Docker container** that mounts the worktree as `/workspace` and shares your repo's `.git` directory
3. **Forwards your git identity** so commits show up as you
4. **Injects your Claude auth token** so there's no login prompt

## Authentication

Each container needs Claude Code authentication, but you only need to configure your token once — yolobox automatically injects it into every new container:

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







## Development

```bash
npm install                    # Install dependencies
npm run docker:build           # Build the Docker image locally (~5 min, one-time)
npm link                       # Link the CLI globally

npm run build                  # One-shot TypeScript build
npm run dev                    # Watch mode
npm test                       # Run tests
```

### Custom Docker image

Want to bring your own container? Set the `YOLOBOX_IMAGE` env var:

```bash
YOLOBOX_IMAGE=my-custom-image:latest yolobox claude
```

Image resolution order:
1. `YOLOBOX_IMAGE` env var (if set)
2. `yolobox:local` (if you've built it locally)
3. `ghcr.io/roginn/yolobox:latest` (default)

## License

MIT
