import { execSync, spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as debug from './debug'

export function isDockerRunning(): boolean {
  debug.log('Checking Docker status...')
  try {
    execSync('docker info', { stdio: ['pipe', 'pipe', 'pipe'] })
    debug.log('Docker is running')
    return true
  } catch {
    debug.error('Docker is not running or not installed')
    return false
  }
}

export interface ImageResolution {
  image: string
  source: 'env' | 'local' | 'ghcr'
}

export function resolveDockerImage(options: {
  envImage?: string
  checkLocalImage?: boolean
}): ImageResolution {
  // Priority 1: Environment variable
  if (options.envImage) {
    return {
      image: options.envImage,
      source: 'env',
    }
  }

  // Priority 2: Local image (if check enabled)
  if (options.checkLocalImage !== false && imageExists('yolobox:local')) {
    return {
      image: 'yolobox:local',
      source: 'local',
    }
  }

  // Priority 3: GHCR fallback
  return {
    image: 'ghcr.io/roginn/yolobox:latest',
    source: 'ghcr',
  }
}

export function imageExists(imageName: string): boolean {
  debug.log(`Checking if image exists: ${imageName}`)
  try {
    execSync(`docker image inspect ${imageName}`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    debug.log(`Image found: ${imageName}`)
    return true
  } catch {
    debug.log(`Image not found locally: ${imageName}`)
    return false
  }
}

export function pullImage(
  imageName: string,
  onProgress?: (message: string) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['pull', imageName], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const layers = new Map<string, string>()
    let totalLayers = 0
    let completedLayers = 0

    const handleOutput = (data: Buffer) => {
      const lines = data.toString().split(/\r?\n/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        // Match Docker layer status lines like "a2318d6c47ec: Pull complete"
        const match = trimmed.match(/^([a-f0-9]{12}): (.+)$/)
        if (match) {
          const [, layerId, status] = match
          const prevStatus = layers.get(layerId)
          layers.set(layerId, status)

          if (!prevStatus) {
            totalLayers++
          }

          if (
            (status === 'Pull complete' || status === 'Already exists') &&
            prevStatus !== 'Pull complete' &&
            prevStatus !== 'Already exists'
          ) {
            completedLayers++
          }

          if (onProgress && totalLayers > 0) {
            onProgress(
              `Pulling image (${completedLayers}/${totalLayers} layers)`,
            )
          }
        }
      }
    }

    proc.stdout?.on('data', handleOutput)
    proc.stderr?.on('data', handleOutput)

    proc.on('close', (code) => {
      debug.log(
        `Image pull ${code === 0 ? 'succeeded' : 'failed'}: ${imageName}`,
      )
      resolve(code === 0)
    })
  })
}

export function isYoloboxDevRepo(repoRoot: string): boolean {
  return existsSync(join(repoRoot, 'docker', 'Dockerfile'))
}

export interface ContainerOptions {
  id: string
  worktreePath: string
  gitDir: string
  gitIdentity: { name: string; email: string }
  image: string
  repoPath: string
  claudeOauthToken?: string
}

export function buildDockerArgs(opts: ContainerOptions): string[] {
  const args: string[] = [
    'run',
    '-d',
    '--name',
    `yolobox-${opts.id}`,
    '-v',
    `${opts.worktreePath}:/workspace`,
    '-v',
    `${opts.gitDir}:/repo/.git`,
    '-e',
    `YOLOBOX_ID=${opts.id}`,
    '--label',
    'yolobox=true',
    '--label',
    `yolobox.path=${opts.repoPath}`,
  ]

  if (opts.gitIdentity.name) {
    args.push('-e', `GIT_AUTHOR_NAME=${opts.gitIdentity.name}`)
    args.push('-e', `GIT_COMMITTER_NAME=${opts.gitIdentity.name}`)
  }

  if (opts.gitIdentity.email) {
    args.push('-e', `GIT_AUTHOR_EMAIL=${opts.gitIdentity.email}`)
    args.push('-e', `GIT_COMMITTER_EMAIL=${opts.gitIdentity.email}`)
  }

  if (opts.claudeOauthToken) {
    args.push('-e', `CLAUDE_CODE_OAUTH_TOKEN=${opts.claudeOauthToken}`)
  }

  args.push(opts.image)
  args.push('sleep', 'infinity')

  return args
}

export function buildExecArgs(id: string, command: string[]): string[] {
  return ['exec', '-it', `yolobox-${id}`, ...command]
}

export function startContainer(opts: ContainerOptions): boolean {
  const args = buildDockerArgs(opts)
  debug.log(`Starting container yolobox-${opts.id}`)
  const result = spawnSync('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
  const stdout = result.stdout?.toString() || ''
  const stderr = result.stderr?.toString() || ''
  debug.logCommand('docker', args, {
    status: result.status,
    stdout,
    stderr,
  })
  return result.status === 0
}

export function restartContainer(id: string): boolean {
  debug.log(`Restarting container yolobox-${id}`)
  const args = ['start', `yolobox-${id}`]
  const result = spawnSync('docker', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const stdout = result.stdout?.toString() || ''
  const stderr = result.stderr?.toString() || ''
  debug.logCommand('docker', args, { status: result.status, stdout, stderr })
  return result.status === 0
}

export function execInContainer(id: string, command: string[]): number {
  const args = buildExecArgs(id, command)
  debug.log(`Exec in container: docker ${args.join(' ')}`)
  const result = spawnSync('docker', args, { stdio: 'inherit' })
  debug.log(`Exec exited with code ${result.status}`)
  return result.status ?? 1
}

export interface ContainerInfo {
  id: string
  branch: string
  status: string
  created: string
  path: string
}

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getWorktreeBranch(repoPath: string, id: string): string {
  try {
    const worktreePath = join(repoPath, '.yolobox', id)
    return execSync(`git -C "${worktreePath}" rev-parse --abbrev-ref HEAD`, {
      encoding: 'utf-8',
    }).trim()
  } catch {
    return `yolo/${id}` // fallback to expected branch name
  }
}

export function listContainers(): ContainerInfo[] {
  try {
    const result = execSync(
      'docker ps -a --filter "label=yolobox" --format "{{.Names}}\t{{.Status}}\t{{.CreatedAt}}\t{{.Label \\"yolobox.path\\"}}"',
      { encoding: 'utf-8' },
    )
    return result
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, status, created, path] = line.split('\t')
        const id = name.replace(/^yolobox-/, '')
        return {
          id,
          branch: getWorktreeBranch(path, id),
          status: status.startsWith('Up') ? 'running' : 'stopped',
          created: timeAgo(created),
          path: path || '',
        }
      })
  } catch {
    return []
  }
}

export function killContainer(id: string): boolean {
  debug.log(`Killing container yolobox-${id}`)
  const stopArgs = ['stop', `yolobox-${id}`]
  const stop = spawnSync('docker', stopArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  debug.logCommand('docker', stopArgs, {
    status: stop.status,
    stdout: stop.stdout?.toString() || '',
    stderr: stop.stderr?.toString() || '',
  })
  if (stop.status !== 0) return false
  const rmArgs = ['rm', `yolobox-${id}`]
  const rm = spawnSync('docker', rmArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  debug.logCommand('docker', rmArgs, {
    status: rm.status,
    stdout: rm.stdout?.toString() || '',
    stderr: rm.stderr?.toString() || '',
  })
  return rm.status === 0
}
