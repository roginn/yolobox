import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/docker', () => ({
  isDockerRunning: vi.fn(),
  listContainers: vi.fn(),
  killContainer: vi.fn(),
  resolveDockerImage: vi.fn(),
  imageExists: vi.fn(),
  pullImage: vi.fn(),
  canDockerAccessPath: vi.fn(),
  startContainer: vi.fn(),
  execInContainerNonInteractive: vi.fn(),
  isYoloboxDevRepo: vi.fn(),
}))

vi.mock('../src/lib/git', () => ({
  isInsideGitRepo: vi.fn(),
  hasCommits: vi.fn(),
  getRepoRoot: vi.fn(),
  getGitDir: vi.fn(),
  getBranches: vi.fn(),
  branchExists: vi.fn(),
  initRepo: vi.fn(),
  createInitialCommit: vi.fn(),
  getGitIdentity: vi.fn(),
  listUntrackedFiles: vi.fn(),
}))

vi.mock('../src/lib/worktree', () => ({
  worktreeExists: vi.fn(),
  createWorktree: vi.fn(),
  ensureGitignore: vi.fn(),
  getExistingWorktreeIds: vi.fn(),
}))

vi.mock('../src/lib/auth', () => ({
  resolveToken: vi.fn(),
}))

vi.mock('../src/lib/ui', () => ({
  intro: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  outro: vi.fn(),
  prompts: {
    confirm: vi.fn(),
    isCancel: vi.fn(),
    spinner: vi.fn(() => ({
      start: vi.fn(),
      message: vi.fn(),
      stop: vi.fn(),
    })),
  },
}))

vi.mock('../src/lib/debug', () => ({
  isEnabled: vi.fn(),
  getLogPath: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
}))

import * as auth from '../src/lib/auth'
import { setupContainer } from '../src/lib/container-setup'
import * as debug from '../src/lib/debug'
import * as docker from '../src/lib/docker'
import * as git from '../src/lib/git'
import * as worktree from '../src/lib/worktree'

const mockExit = vi
  .spyOn(process, 'exit')
  .mockImplementation(() => undefined as never)

describe('setupContainer untracked copy', () => {
  let repoRoot: string
  let cwdPath: string
  let worktreePath: string
  let sourceFile: string
  let cwdSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()

    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yolobox-test-'))
    cwdPath = path.join(repoRoot, 'notes')
    fs.mkdirSync(cwdPath, { recursive: true })
    sourceFile = path.join(cwdPath, 'draft.md')
    fs.writeFileSync(sourceFile, 'hello')

    worktreePath = path.join(repoRoot, '.yolobox', 'mybox')

    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cwdPath)

    vi.mocked(debug.isEnabled).mockReturnValue(false)
    vi.mocked(docker.isDockerRunning).mockReturnValue(true)
    vi.mocked(docker.listContainers).mockReturnValue([])
    vi.mocked(docker.resolveDockerImage).mockReturnValue({
      image: 'yolobox:local',
      source: 'local',
    })
    vi.mocked(docker.imageExists).mockReturnValue(true)
    vi.mocked(docker.canDockerAccessPath).mockReturnValue(true)
    vi.mocked(docker.startContainer).mockReturnValue(true)
    vi.mocked(docker.execInContainerNonInteractive).mockReturnValue(true)

    vi.mocked(git.isInsideGitRepo).mockReturnValue(true)
    vi.mocked(git.hasCommits).mockReturnValue(true)
    vi.mocked(git.getRepoRoot).mockReturnValue(repoRoot)
    vi.mocked(git.getGitDir).mockReturnValue(path.join(repoRoot, '.git'))
    vi.mocked(git.getBranches).mockReturnValue([])
    vi.mocked(git.branchExists).mockReturnValue(false)
    vi.mocked(git.getGitIdentity).mockReturnValue({ name: '', email: '' })

    vi.mocked(worktree.getExistingWorktreeIds).mockReturnValue([])
    vi.mocked(worktree.worktreeExists).mockReturnValue(false)
    vi.mocked(worktree.createWorktree).mockImplementation((root, id) => {
      const dir = path.join(root, '.yolobox', id)
      fs.mkdirSync(dir, { recursive: true })
      return dir
    })

    vi.mocked(auth.resolveToken).mockReturnValue(null)
  })

  afterEach(() => {
    cwdSpy.mockRestore()
    fs.rmSync(repoRoot, { recursive: true, force: true })
  })

  it('copies untracked files from cwd into new worktree', async () => {
    vi.mocked(git.listUntrackedFiles).mockReturnValue([
      path.join('notes', 'draft.md'),
    ])

    await setupContainer({ name: 'mybox' })

    const dest = path.join(worktreePath, 'notes', 'draft.md')
    expect(fs.existsSync(dest)).toBe(true)
    expect(fs.readFileSync(dest, 'utf-8')).toBe('hello')
    fs.writeFileSync(dest, 'changed')
    expect(fs.readFileSync(sourceFile, 'utf-8')).toBe('hello')

    expect(git.listUntrackedFiles).toHaveBeenCalledWith(repoRoot, 'notes')
    expect(docker.execInContainerNonInteractive).toHaveBeenCalledWith('mybox', [
      'git',
      'config',
      '--global',
      '--add',
      'safe.directory',
      '/workspace',
    ])
    expect(mockExit).not.toHaveBeenCalled()
  })

  it('skips untracked copy when worktree already exists', async () => {
    fs.mkdirSync(worktreePath, { recursive: true })
    vi.mocked(worktree.worktreeExists).mockReturnValue(true)
    vi.mocked(git.listUntrackedFiles).mockReturnValue([
      path.join('notes', 'draft.md'),
    ])

    await setupContainer({ name: 'mybox' })

    const dest = path.join(worktreePath, 'notes', 'draft.md')
    expect(fs.existsSync(dest)).toBe(false)
    expect(git.listUntrackedFiles).not.toHaveBeenCalled()
  })
})
