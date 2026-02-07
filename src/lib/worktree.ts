import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    encoding: 'utf-8',
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

export function worktreeExists(repoRoot: string, id: string): boolean {
  const worktreePath = path.join(repoRoot, '.yolobox', id)
  return fs.existsSync(worktreePath)
}

export function createWorktree(
  repoRoot: string,
  id: string,
  options?: { branchExists?: boolean },
): string {
  const yoloboxDir = path.join(repoRoot, '.yolobox')
  fs.mkdirSync(yoloboxDir, { recursive: true })
  const worktreePath = path.join(yoloboxDir, id)

  if (options?.branchExists) {
    // Branch already exists — check it out into a new worktree
    exec(`git worktree add "${worktreePath}" "yolo/${id}"`, repoRoot)
  } else {
    // Create a new branch
    exec(`git worktree add "${worktreePath}" -b "yolo/${id}"`, repoRoot)
  }

  return worktreePath
}

export function ensureGitignore(repoRoot: string): void {
  const gitignorePath = path.join(repoRoot, '.gitignore')
  const entry = '.yolobox/'

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8')
    if (content.includes(entry)) return
    const separator = content.endsWith('\n') ? '' : '\n'
    fs.appendFileSync(gitignorePath, `${separator}${entry}\n`)
  } else {
    fs.writeFileSync(gitignorePath, `${entry}\n`)
  }
}

export function removeWorktree(repoRoot: string, id: string): boolean {
  const worktreePath = path.join(repoRoot, '.yolobox', id)
  try {
    exec(`git worktree remove --force "${worktreePath}"`, repoRoot)
    return true
  } catch {
    // Worktree directory may already be gone but still registered in git.
    // Prune stale entries and clean up the directory if it lingers.
    try {
      exec('git worktree prune', repoRoot)
    } catch {}
    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true })
    }
    return true
  }
}

export function getExistingWorktreeIds(repoRoot: string): string[] {
  const yoloboxDir = path.join(repoRoot, '.yolobox')
  if (!fs.existsSync(yoloboxDir)) return []
  return fs
    .readdirSync(yoloboxDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
}
