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

  // Check Docker
  if (!docker.isDockerRunning()) {
    ui.error('Docker is not running. Start Docker Desktop and try again.')
    process.exit(1)
  }
  ui.success('Docker is running')

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
  } else {
    ui.success('Git repo detected')
  }

  // Worktrees need at least one commit
  if (!git.hasCommits()) {
    git.createInitialCommit()
    ui.success('Created initial commit')
  }

  const repoRoot = git.getRepoRoot()
  const gitDir = git.getGitDir()

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

  // Create worktree
  const worktreePath = worktree.createWorktree(repoRoot, id)
  ui.success(`Created worktree .yolobox/${id} (branch: ${id})`)

  // Ensure .gitignore
  worktree.ensureGitignore(repoRoot)

  // Git identity
  const gitIdentity = git.getGitIdentity()

  // Resolve Docker image
  const imageResolution = docker.resolveDockerImage({
    envImage: process.env.YOLOBOX_IMAGE,
  })

  // Show which image we're using
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

  // Start container (detached)
  const started = docker.startContainer({
    id,
    worktreePath,
    gitDir,
    gitIdentity,
    image: imageResolution.image,
    repoPath: repoRoot,
  })

  if (!started) {
    ui.error('Failed to start container.')
    process.exit(1)
  }

  return { id, repoRoot }
}
