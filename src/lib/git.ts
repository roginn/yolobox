import { execSync, spawnSync } from 'node:child_process'

function exec(cmd: string): string {
  return execSync(cmd, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

export function isInsideGitRepo(): boolean {
  try {
    exec('git rev-parse --is-inside-work-tree')
    return true
  } catch {
    return false
  }
}

export function getRepoRoot(): string {
  return exec('git rev-parse --show-toplevel')
}

export function getGitDir(): string {
  return exec('git rev-parse --absolute-git-dir')
}

export function getBranches(): string[] {
  const output = exec('git branch --list --format="%(refname:short)"')
  return output.split('\n').filter(Boolean)
}

export function initRepo(): void {
  exec('git init')
  createInitialCommit()
}

export function hasCommits(): boolean {
  try {
    exec('git rev-parse HEAD')
    return true
  } catch {
    return false
  }
}

export function createInitialCommit(): void {
  exec('git commit --allow-empty -m "Initial commit"')
}

export function branchExists(branch: string): boolean {
  try {
    exec(`git rev-parse --verify "refs/heads/${branch}"`)
    return true
  } catch {
    return false
  }
}

export function deleteBranch(branch: string): boolean {
  try {
    exec(`git branch -D "${branch}"`)
    return true
  } catch {
    return false
  }
}

export function getGitIdentity(): { name: string; email: string } {
  try {
    const name = exec('git config user.name')
    const email = exec('git config user.email')
    return { name, email }
  } catch {
    return { name: '', email: '' }
  }
}

export function listUntrackedFiles(
  repoRoot: string,
  pathspec: string,
): string[] {
  const result = spawnSync(
    'git',
    [
      '-C',
      repoRoot,
      'ls-files',
      '--others',
      '--exclude-standard',
      '--',
      pathspec,
    ],
    {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  if (result.status !== 0) return []
  const output = result.stdout?.trim() ?? ''
  if (!output) return []
  return output.split('\n').filter(Boolean)
}
