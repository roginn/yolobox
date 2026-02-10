import fs from 'node:fs'
import path from 'node:path'
import { resolveToken } from './auth'
import * as debug from './debug'
import * as docker from './docker'
import * as git from './git'
import { generateId } from './id'
import * as ui from './ui'
import * as worktree from './worktree'

export interface SetupOptions {
  name?: string
}

export interface SetupResult {
  id: string
  repoRoot: string
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

/**
 * Common setup for all yolobox commands: check docker, git, create worktree, start container
 */
export async function setupContainer(
  options: SetupOptions = {},
): Promise<SetupResult> {
  ui.intro()

  if (debug.isEnabled()) {
    ui.info(`Debug log: ${debug.getLogPath()}`)
  }

  // Check Docker
  if (!docker.isDockerRunning()) {
    ui.error('Docker is not running. Start Docker and try again.')
    process.exit(1)
  }

  // Check git repo
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

  // Worktrees need at least one commit
  if (!git.hasCommits()) {
    git.createInitialCommit()
    ui.success('Created initial commit')
  }

  const repoRoot = git.getRepoRoot()
  const gitDir = git.getGitDir()
  debug.log(`Repo root: ${repoRoot}`)
  debug.log(`Git dir: ${gitDir}`)

  // Generate or validate ID
  let id: string
  if (options.name) {
    id = options.name
  } else {
    const branches = new Set(git.getBranches())
    const existingWorktrees = new Set(worktree.getExistingWorktreeIds(repoRoot))
    const taken = new Set([...branches, ...existingWorktrees])
    id = generateId(taken)
  }

  // Check if a container with this name is already running
  if (options.name) {
    const containers = docker.listContainers()
    const existing = containers.find((c) => c.id === id)
    if (existing && existing.status === 'running') {
      ui.error(
        `Container "${id}" is already running. Use "yolobox attach ${id}" to connect.`,
      )
      process.exit(1)
    }
    // Clean up stopped container with same name so docker doesn't conflict
    if (existing) {
      docker.killContainer(id)
    }
  }

  // Create or reuse worktree
  let worktreePath: string
  const worktreeAlreadyExists = worktree.worktreeExists(repoRoot, id)
  const branchAlreadyExists = git.branchExists(`yolo/${id}`)

  if (worktreeAlreadyExists) {
    // Worktree already exists — reuse it
    worktreePath = path.join(repoRoot, '.yolobox', id)
    ui.success(`Reusing worktree .yolobox/${id} (branch: yolo/${id})`)
  } else {
    worktreePath = worktree.createWorktree(repoRoot, id, {
      branchExists: branchAlreadyExists,
    })
    ui.success(`Created worktree .yolobox/${id} (branch: yolo/${id})`)
  }

  // Ensure .gitignore
  worktree.ensureGitignore(repoRoot)

  // Copy untracked files from current working directory into new worktree
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

  // Git identity
  const gitIdentity = git.getGitIdentity()

  // Resolve Docker image
  debug.log('Resolving Docker image...')
  const imageResolution = docker.resolveDockerImage({
    envImage: process.env.YOLOBOX_IMAGE,
  })
  debug.log(
    `Resolved image: ${imageResolution.image} (source: ${imageResolution.source})`,
  )

  // Show which image we're using and pull if needed
  if (imageResolution.source === 'env') {
    ui.info(`Using custom Docker image: ${imageResolution.image}`)
  } else if (imageResolution.source === 'local') {
    ui.info('Using local Docker image: yolobox:local')
  } else {
    ui.info('Using Docker image: ghcr.io/roginn/yolobox:latest')
    if (docker.isYoloboxDevRepo(repoRoot)) {
      ui.info("Tip: Run 'npm run docker:build' to use local builds")
    }
  }

  // Pull image if not available locally
  if (!docker.imageExists(imageResolution.image)) {
    const spinner = ui.prompts.spinner()
    spinner.start('Pulling image...')
    const pulled = await docker.pullImage(imageResolution.image, (msg) =>
      spinner.message(msg),
    )
    if (!pulled) {
      spinner.stop('Failed to pull image', 1)
      ui.error('Failed to pull Docker image.')
      process.exit(1)
    }
    spinner.stop('Docker image pulled')
  }

  // Verify Docker can access the repo files (macOS may block iCloud Drive paths)
  const testFile = path.join(gitDir, 'HEAD')
  if (!docker.canDockerAccessPath(testFile, imageResolution.image)) {
    ui.error('Docker cannot access files in this directory.')
    if (
      process.platform === 'darwin' &&
      repoRoot.includes('/Library/Mobile Documents/')
    ) {
      ui.error(
        'This repo is in iCloud Drive. Docker Desktop needs "Full Disk Access" to read these files.\n' +
          '  → Open System Settings > Privacy & Security > Full Disk Access\n' +
          '  → Enable Docker Desktop, then restart Docker.',
      )
    } else if (process.platform === 'darwin') {
      ui.error(
        'Docker Desktop may need "Full Disk Access" to read files in this location.\n' +
          '  → Open System Settings > Privacy & Security > Full Disk Access\n' +
          '  → Enable Docker Desktop, then restart Docker.',
      )
    }
    process.exit(1)
  }

  // Resolve Claude auth token
  const claudeOauthToken = resolveToken()
  if (claudeOauthToken) {
    ui.success('Claude auth token configured')
  } else {
    ui.warn('No Claude auth token. Run "yolobox auth" to set up.')
  }

  // Start container (detached)
  debug.log(`Starting container with id=${id}, image=${imageResolution.image}`)
  debug.log(`Worktree path: ${worktreePath}`)
  debug.log(`Git identity: ${gitIdentity.name} <${gitIdentity.email}>`)
  debug.log(`Claude token: ${claudeOauthToken ? 'set' : 'not set'}`)
  const started = docker.startContainer({
    id,
    worktreePath,
    gitDir,
    gitIdentity,
    image: imageResolution.image,
    repoPath: repoRoot,
    claudeOauthToken: claudeOauthToken ?? undefined,
  })

  if (!started) {
    if (debug.isEnabled()) {
      ui.error(
        `Failed to start container. Check ${debug.getLogPath()} for details.`,
      )
    } else {
      ui.error('Failed to start container. Run with --debug for details.')
    }
    process.exit(1)
  }

  // Prevent "dubious ownership" errors for mounted repo
  const safeDirOk = docker.execInContainerNonInteractive(id, [
    'git',
    'config',
    '--global',
    '--add',
    'safe.directory',
    '/workspace',
  ])
  if (!safeDirOk) {
    debug.log('Failed to mark /workspace as a safe git directory')
  }

  return { id, repoRoot }
}
