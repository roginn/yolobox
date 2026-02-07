import { execSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function isDockerRunning(): boolean {
  try {
    execSync('docker info', { stdio: ['pipe', 'pipe', 'pipe'] })
    return true
  } catch {
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
  try {
    execSync(`docker image inspect ${imageName}`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
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
  const result = spawnSync('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] })
  return result.status === 0
}

export function execInContainer(id: string, command: string[]): number {
  const args = buildExecArgs(id, command)
  const result = spawnSync('docker', args, { stdio: 'inherit' })
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
          branch: id,
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
  const stop = spawnSync('docker', ['stop', `yolobox-${id}`], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (stop.status !== 0) return false
  const rm = spawnSync('docker', ['rm', `yolobox-${id}`], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return rm.status === 0
}
