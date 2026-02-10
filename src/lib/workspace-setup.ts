import fs from 'node:fs'
import path from 'node:path'
import { resolveToken } from './auth'
import * as debug from './debug'
import * as git from './git'
import { generateId } from './id'
import * as ui from './ui'
import * as worktree from './worktree'

export interface SetupWorkspaceOptions {
  name?: string
  takenIds?: string[]
}

export interface SetupWorkspaceResult {
  id: string
  repoRoot: string
  gitDir: string
  worktreePath: string
  gitIdentity: { name: string; email: string }
  claudeOauthToken: string | null
  worktreeAlreadyExists: boolean
  branchAlreadyExists: boolean
}

function toTakenBranchIds(branches: string[]): string[] {
  const ids: string[] = []
  for (const branch of branches) {
    ids.push(branch)
    if (branch.startsWith('yolo/')) {
      ids.push(branch.slice('yolo/'.length))
    }
  }
  return ids
}

function copyUntrackedFilesFromCwd(options: {
  repoRoot: string
  worktreePath: string
  cwd: string
}): number {
  const { repoRoot, worktreePath, cwd } = options
  const relativeCwd = path.relative(repoRoot, cwd)
  if (relativeCwd.startsWith('..') || path.isAbsolute(relativeCwd)) {
    debug.log(`Skipping untracked copy: cwd outside repo (${cwd})`)
    return 0
  }
  if (relativeCwd.split(path.sep).includes('.yolobox')) {
    debug.log(`Skipping untracked copy: cwd inside .yolobox (${cwd})`)
    return 0
  }

  const pathspec = relativeCwd === '' ? '.' : relativeCwd
  const files = git.listUntrackedFiles(repoRoot, pathspec)
  if (files.length === 0) return 0

  let copied = 0
  for (const file of files) {
    const src = path.join(repoRoot, file)
    const dest = path.join(worktreePath, file)
    try {
      if (fs.existsSync(dest)) continue
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      const stat = fs.lstatSync(src)
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(src)
        fs.symlinkSync(target, dest)
      } else if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true })
      } else {
        fs.copyFileSync(src, dest)
      }
      copied++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      debug.log(`Failed to copy untracked file "${file}": ${message}`)
    }
  }

  return copied
}

export async function setupWorkspace(
  options: SetupWorkspaceOptions = {},
): Promise<SetupWorkspaceResult> {
  if (!git.isInsideGitRepo()) {
    const shouldInit = await ui.prompts.confirm({
      message: 'No git repo found. Initialize one here?',
    })
    if (ui.prompts.isCancel(shouldInit) || !shouldInit) {
      ui.error('yolobox needs a git repo for worktrees.')
      process.exit(1)
    }
    git.initRepo()
    ui.success('Initialized git repo')
  }

  if (!git.hasCommits()) {
    git.createInitialCommit()
    ui.success('Created initial commit')
  }

  const repoRoot = git.getRepoRoot()
  const gitDir = git.getGitDir()
  debug.log(`Repo root: ${repoRoot}`)
  debug.log(`Git dir: ${gitDir}`)

  const branches = git.getBranches()
  const existingWorktrees = worktree.getExistingWorktreeIds(repoRoot)
  const localTaken = new Set([
    ...toTakenBranchIds(branches),
    ...existingWorktrees,
  ])
  const crossBackendTaken = new Set(options.takenIds ?? [])
  const taken = new Set([...localTaken, ...crossBackendTaken])

  let id: string
  if (options.name) {
    id = options.name
    if (crossBackendTaken.has(id)) {
      ui.error(
        `A yolobox named "${id}" already exists. Choose another name or specify a backend explicitly.`,
      )
      process.exit(1)
    }
  } else {
    id = generateId(taken)
  }

  const worktreeAlreadyExists = worktree.worktreeExists(repoRoot, id)
  const branchAlreadyExists = git.branchExists(`yolo/${id}`)

  let worktreePath: string
  if (worktreeAlreadyExists) {
    worktreePath = path.join(repoRoot, '.yolobox', id)
    ui.success(`Reusing worktree .yolobox/${id} (branch: yolo/${id})`)
  } else {
    worktreePath = worktree.createWorktree(repoRoot, id, {
      branchExists: branchAlreadyExists,
    })
    ui.success(`Created worktree .yolobox/${id} (branch: yolo/${id})`)
  }

  worktree.ensureGitignore(repoRoot)

  if (!worktreeAlreadyExists && !branchAlreadyExists) {
    const copied = copyUntrackedFilesFromCwd({
      repoRoot,
      worktreePath,
      cwd: process.cwd(),
    })
    if (copied > 0) {
      const cwdRel = path.relative(repoRoot, process.cwd()) || '.'
      const label = copied === 1 ? 'file' : 'files'
      ui.info(`Copied ${copied} untracked ${label} from ${cwdRel}`)
    }
  }

  return {
    id,
    repoRoot,
    gitDir,
    worktreePath,
    gitIdentity: git.getGitIdentity(),
    claudeOauthToken: resolveToken(),
    worktreeAlreadyExists,
    branchAlreadyExists,
  }
}
