import * as debug from './debug'
import * as docker from './docker'
import * as ui from './ui'
import * as vm from './vm'
import { setupWorkspace } from './workspace-setup'

export interface SetupOptions {
  name?: string
}

export interface SetupResult {
  id: string
  repoRoot: string
}

/**
 * Common setup for Docker-backed yolobox commands.
 */
export async function setupContainer(
  options: SetupOptions = {},
): Promise<SetupResult> {
  ui.intro()

  if (debug.isEnabled()) {
    ui.info(`Debug log: ${debug.getLogPath()}`)
  }

  if (!docker.isDockerRunning()) {
    ui.error('Docker is not running. Start Docker and try again.')
    process.exit(1)
  }

  const workspace = await setupWorkspace({
    name: options.name,
    takenIds: vm.listVmIds(),
  })

  const { id, repoRoot, gitDir, worktreePath, gitIdentity, claudeOauthToken } =
    workspace

  if (options.name) {
    const containers = docker.listContainers()
    const existing = containers.find((c) => c.id === id)
    if (existing && existing.status === 'running') {
      ui.error(
        `Container "${id}" is already running. Use "yolobox attach ${id}" to connect.`,
      )
      process.exit(1)
    }
    if (existing) {
      docker.killContainer(id)
    }
  }

  debug.log('Resolving Docker image...')
  const imageResolution = docker.resolveDockerImage({
    envImage: process.env.YOLOBOX_IMAGE,
  })
  debug.log(
    `Resolved image: ${imageResolution.image} (source: ${imageResolution.source})`,
  )

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

  const testFile = `${gitDir}/HEAD`
  if (!docker.canDockerAccessPath(testFile, imageResolution.image)) {
    ui.error('Docker cannot access files in this directory.')
    if (
      process.platform === 'darwin' &&
      repoRoot.includes('/Library/Mobile Documents/')
    ) {
      ui.error(
        'This repo is in iCloud Drive. Docker Desktop needs "Full Disk Access" to read these files.\n' +
          '  -> Open System Settings > Privacy & Security > Full Disk Access\n' +
          '  -> Enable Docker Desktop, then restart Docker.',
      )
    } else if (process.platform === 'darwin') {
      ui.error(
        'Docker Desktop may need "Full Disk Access" to read files in this location.\n' +
          '  -> Open System Settings > Privacy & Security > Full Disk Access\n' +
          '  -> Enable Docker Desktop, then restart Docker.',
      )
    }
    process.exit(1)
  }

  if (claudeOauthToken) {
    ui.success('Claude auth token configured')
  } else {
    ui.warn('No Claude auth token. Run "yolobox auth" to set up.')
  }

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
