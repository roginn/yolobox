#!/usr/bin/env bash
set -euo pipefail

# Fix up git worktree paths for the container environment.
# The host worktree's .git file points to the host's absolute .git/worktrees/<id> path.
# Inside the container, the main .git dir is mounted at /workspace/.git-main,
# so we rewrite the pointer to match.
if [ -n "${YOLOBOX_ID:-}" ] && [ -f /workspace/.git ]; then
  echo "gitdir: /repo/.git/worktrees/${YOLOBOX_ID}" > /workspace/.git
  # Also update the reverse pointer so git knows where the worktree lives
  if [ -f "/repo/.git/worktrees/${YOLOBOX_ID}/gitdir" ]; then
    echo "/workspace" > "/repo/.git/worktrees/${YOLOBOX_ID}/gitdir"
  fi
fi

# Configure git identity from env vars passed by yolobox CLI
if [ -n "${GIT_AUTHOR_NAME:-}" ]; then
  git config --global user.name "$GIT_AUTHOR_NAME"
fi
if [ -n "${GIT_AUTHOR_EMAIL:-}" ]; then
  git config --global user.email "$GIT_AUTHOR_EMAIL"
fi

exec "$@"
