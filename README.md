# yolobox

Run Claude Code in Docker containers with `--dangerously-skip-permissions`. Each yolobox gets its own git worktree and branch, so multiple AI agents can work on the same repo simultaneously without conflicts.

```bash
yolobox run                          # Interactive Claude session
yolobox run -p "fix the login bug"   # Start Claude with a prompt
yolobox run --shell                  # Drop into bash instead of Claude
yolobox run --name cool-tiger        # Use a specific ID instead of random
```

---

## Authentication

Claude Code needs to authenticate inside each container. To avoid logging in every time, set up a long-lived token once:

```bash
# Step 1: Generate a token on your host machine
claude setup-token

# Step 2: Store it in yolobox
yolobox auth <token>
```

Alternatively, if you have the `CLAUDE_CODE_OAUTH_TOKEN` environment variable set:

```bash
export CLAUDE_CODE_OAUTH_TOKEN=<token>
yolobox auth
```

The token is saved to `~/.yolobox/auth.json` and automatically passed to new containers. You can check the current status or remove the token:

```bash
yolobox auth --status   # Show auth status
yolobox auth --remove   # Remove stored token
```

---

## Development

### Setup

```bash
# Install dependencies
npm install

# Build the Docker image (only needed once, takes ~5 min)
npm run docker:build

# Link the CLI globally so you can use the `yolobox` command
npm link
```

### Testing

**End-to-end test:**

```bash
# In this repo (or any git repo)
yolobox run --shell
```

This will:
- ✓ Check Docker is running
- ✓ Check you're in a git repo
- ✓ Generate a random ID (e.g., `swift-falcon`)
- ✓ Create `.yolobox/swift-falcon/` worktree
- ✓ Launch you into a bash shell inside the container

Once inside the container, verify:
```bash
pwd                    # Should be /workspace
git branch             # Should show your yolobox branch
git config user.name   # Should show your host identity
ssh-add -l             # Should show your SSH keys (on macOS)
```

Type `exit` to leave the container.

**Quick verification without Docker:**

```bash
npm run build          # Compile TypeScript
node bin/yolobox.js --help
node bin/yolobox.js run --help
npm test               # Run unit tests (18 tests)
```

### Build & Watch

```bash
npm run build          # One-shot build
npm run dev            # Watch mode (rebuild on change)
npm test               # Run tests
```

---

## License

MIT
