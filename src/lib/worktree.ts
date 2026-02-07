import { execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, { encoding: 'utf-8', cwd, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

export function createWorktree(repoRoot: string, id: string): string {
  const yoloboxDir = path.join(repoRoot, '.yolobox')
  fs.mkdirSync(yoloboxDir, { recursive: true })
  const worktreePath = path.join(yoloboxDir, id)
  exec(`git worktree add "${worktreePath}" -b "yolo/${id}"`, repoRoot)
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

export function getExistingWorktreeIds(repoRoot: string): string[] {
  const yoloboxDir = path.join(repoRoot, '.yolobox')
  if (!fs.existsSync(yoloboxDir)) return []
  return fs.readdirSync(yoloboxDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
}
