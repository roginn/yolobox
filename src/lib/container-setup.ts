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

  return { id, repoRoot }
}
