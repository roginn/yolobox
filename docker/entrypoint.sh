#!/usr/bin/env bash
set -euo pipefail

# Fix up git worktree paths for the container environment.
# The host worktree's .git file points to the host's absolute .git/worktrees/<id> path.
# Inside the container, the main .git dir is mounted at /workspace/.git-main,
# so we rewrite the pointer to match.
if [ -n "${YOLOBOX_ID:-}" ] && [ -f /workspace/.git ]; then
  echo "gitdir: /workspace/.git-main/worktrees/${YOLOBOX_ID}" > /workspace/.git
  # Also update the reverse pointer so git knows where the worktree lives
  if [ -f "/workspace/.git-main/worktrees/${YOLOBOX_ID}/gitdir" ]; then
    echo "/workspace" > "/workspace/.git-main/worktrees/${YOLOBOX_ID}/gitdir"
  fi
fi

# Configure git identity from env vars passed by yolobox CLI
if [ -n "${GIT_AUTHOR_NAME:-}" ]; then
  git config --global user.name "$GIT_AUTHOR_NAME"
fi
if [ -n "${GIT_AUTHOR_EMAIL:-}" ]; then
  git config --global user.email "$GIT_AUTHOR_EMAIL"
fi

# Ensure SSH agent socket is accessible
if [ -n "${SSH_AUTH_SOCK:-}" ] && [ -e "$SSH_AUTH_SOCK" ]; then
  ssh-add -l >/dev/null 2>&1 || true
fi

# Configure SSH to skip host key verification for github.com
mkdir -p ~/.ssh
cat > ~/.ssh/config <<'SSHEOF'
Host github.com
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
SSHEOF
chmod 600 ~/.ssh/config

exec "$@"
