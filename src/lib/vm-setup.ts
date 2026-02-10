import * as debug from './debug'
import * as docker from './docker'
import * as ui from './ui'
import * as vm from './vm'
import { setupWorkspace } from './workspace-setup'

export interface SetupVmOptions {
  name?: string
}

export interface SetupVmResult {
  id: string
  repoRoot: string
  branch: string
  claudeOauthToken: string | null
  gitIdentity: { name: string; email: string }
}

export async function setupVm(
  options: SetupVmOptions = {},
): Promise<SetupVmResult> {
  ui.intro()

  if (debug.isEnabled()) {
    ui.info(`Debug log: ${debug.getLogPath()}`)
  }

  let dockerIds: string[] = []
  const dockerRunning = docker.isDockerRunning()
  if (dockerRunning) {
    dockerIds = docker.listContainers().map((container) => container.id)
  } else if (options.name) {
    ui.warn('Docker is not running. Skipping Docker name collision check.')
  }

  const workspace = await setupWorkspace({
    name: options.name,
    takenIds: dockerIds,
  })

  debug.log(
    `[vm] setup workspace id=${workspace.id} repo=${workspace.repoRoot} worktree=${workspace.worktreePath}`,
  )

  const branch = `yolo/${workspace.id}`

  try {
    vm.ensureVmRunning({
      id: workspace.id,
      repoPath: workspace.repoRoot,
      worktreePath: workspace.worktreePath,
      gitDir: workspace.gitDir,
      branch,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ui.error(message)
    process.exit(1)
  }

  if (workspace.claudeOauthToken) {
    ui.success('Claude auth token configured')
  } else {
    ui.warn('No Claude auth token. Run "yolobox auth" to set up.')
  }

  return {
    id: workspace.id,
    repoRoot: workspace.repoRoot,
    branch,
    claudeOauthToken: workspace.claudeOauthToken,
    gitIdentity: workspace.gitIdentity,
  }
}
