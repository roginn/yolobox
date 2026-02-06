import { execSync } from 'node:child_process'

function exec(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
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
  return exec('git rev-parse --git-dir')
}

export function getBranches(): string[] {
  const output = exec('git branch --list --format="%(refname:short)"')
  return output.split('\n').filter(Boolean)
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
