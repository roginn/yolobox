import { shellEscape } from './utils'

function indentBlock(input: string, spaces: number): string {
  const prefix = ' '.repeat(spaces)
  return input
    .trimEnd()
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
}

export function getDebianCloudImageUrl(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
  return `https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-${arch}.qcow2`
}

export function getFirecrackerArtifactUrls(): {
  kernelUrl: string
  rootfsUrl: string
} {
  if (process.arch === 'arm64') {
    return {
      kernelUrl:
        'https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/aarch64/kernels/vmlinux.bin',
      rootfsUrl:
        'https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/aarch64/rootfs/ubuntu-22.04.ext4',
    }
  }

  return {
    kernelUrl:
      'https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/kernels/vmlinux.bin',
    rootfsUrl:
      'https://s3.amazonaws.com/spec.ccfc.min/img/quickstart_guide/x86_64/rootfs/bionic.rootfs.ext4',
  }
}

export function buildVmEntrypointScript(): string {
  const dollar = '$'
  return `#!/usr/bin/env bash
set -euo pipefail

export PATH="${dollar}{HOME}/.local/bin:${dollar}{PATH}"
if [ ! -x "${dollar}{HOME}/.local/bin/claude" ] && [ -x /home/dev/.local/bin/claude ]; then
  mkdir -p "${dollar}{HOME}/.local/bin"
  ln -sf /home/dev/.local/bin/claude "${dollar}{HOME}/.local/bin/claude" || true
fi

if [ -n "${dollar}{YOLOBOX_ID:-}" ] && [ -f /workspace/.git ]; then
  echo "gitdir: /repo/.git/worktrees/${dollar}{YOLOBOX_ID}" > /workspace/.git
  if [ -f "/repo/.git/worktrees/${dollar}{YOLOBOX_ID}/gitdir" ]; then
    echo "/workspace" > "/repo/.git/worktrees/${dollar}{YOLOBOX_ID}/gitdir"
  fi
fi

if [ -n "${dollar}{GIT_AUTHOR_NAME:-}" ]; then
  git config --global user.name "$GIT_AUTHOR_NAME"
fi
if [ -n "${dollar}{GIT_AUTHOR_EMAIL:-}" ]; then
  git config --global user.email "$GIT_AUTHOR_EMAIL"
fi

if [ -n "${dollar}{CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  CLAUDE_JSON="$HOME/.claude.json"
  DEFAULTS='{"hasCompletedOnboarding":true,"theme":"dark"}'
  if [ -f "$CLAUDE_JSON" ]; then
    jq -s '.[0] * .[1]' "$CLAUDE_JSON" <(echo "$DEFAULTS") > "${dollar}{CLAUDE_JSON}.tmp" \\
      && mv "${dollar}{CLAUDE_JSON}.tmp" "$CLAUDE_JSON"
  else
    echo "$DEFAULTS" > "$CLAUDE_JSON"
  fi
fi

git config --global --add safe.directory /workspace >/dev/null 2>&1 || true
`
}

export function buildVmExecScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

/usr/local/bin/yolobox-entrypoint
cd /workspace
exec "$@"
`
}

export function buildProvisionScript(): string {
  const entrypoint = buildVmEntrypointScript()
  const execScript = buildVmExecScript()

  return `#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

if ! id -u dev >/dev/null 2>&1; then
  useradd -m -s /bin/bash dev
fi

mkdir -p /workspace /repo
chown -R dev:dev /workspace /repo || true

grep -q '^dev ALL=(ALL) NOPASSWD:ALL$' /etc/sudoers.d/dev 2>/dev/null || {
  echo 'dev ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/dev
  chmod 0440 /etc/sudoers.d/dev
}

apt-get update
apt-get install -y --no-install-recommends \\
  build-essential cmake pkg-config git curl wget jq unzip zip less vim tree \\
  sudo ripgrep fd-find openssh-client openssh-server ca-certificates gnupg \\
  python3 python3-pip python3-venv docker.io

ln -sf /usr/bin/python3 /usr/local/bin/python

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get update
apt-get install -y --no-install-recommends nodejs

curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \\
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \\
  > /etc/apt/sources.list.d/github-cli.list
apt-get update
apt-get install -y --no-install-recommends gh

usermod -aG docker dev || true

runuser -l dev -c 'curl -fsSL https://claude.ai/install.sh | bash'
if ! runuser -l dev -c 'test -x "$HOME/.local/bin/claude"'; then
  echo "Claude CLI install failed for user dev: ~/.local/bin/claude not found" >&2
  exit 1
fi

cat > /usr/local/bin/yolobox-entrypoint <<'ENTRYPOINT_EOF'
${entrypoint}
ENTRYPOINT_EOF
chmod +x /usr/local/bin/yolobox-entrypoint

cat > /usr/local/bin/yolobox-exec <<'EXEC_EOF'
${execScript}
EXEC_EOF
chmod +x /usr/local/bin/yolobox-exec

systemctl enable docker >/dev/null 2>&1 || true
systemctl start docker >/dev/null 2>&1 || true
systemctl enable ssh >/dev/null 2>&1 || true
systemctl start ssh >/dev/null 2>&1 || true
`
}

export function buildCloudInitUserData(publicKey: string): string {
  const provision = indentBlock(buildProvisionScript(), 6)

  return `#cloud-config
users:
  - default
  - name: dev
    groups: [sudo, docker]
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    ssh_authorized_keys:
      - ${publicKey}

write_files:
  - path: /tmp/yolobox-provision.sh
    owner: root:root
    permissions: '0755'
    content: |
${provision}

runcmd:
  - [ bash, -lc, ${shellEscape('/tmp/yolobox-provision.sh')} ]
`
}

export function buildCloudInitMetaData(id: string): string {
  return `instance-id: yolobox-${id}\nlocal-hostname: yolobox-${id}`
}
