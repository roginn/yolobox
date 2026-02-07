import { execSync, spawnSync } from 'node:child_process'

export function isDockerRunning(): boolean {
  try {
    execSync('docker info', { stdio: ['pipe', 'pipe', 'pipe'] })
    return true
  } catch {
    return false
  }
}

export interface ContainerOptions {
  id: string
  worktreePath: string
  gitDir: string
  gitIdentity: { name: string; email: string }
  image: string
}

export function buildDockerArgs(opts: ContainerOptions): string[] {
  const args: string[] = [
    'run', '-d',
    '--name', `yolobox-${opts.id}`,
    '-v', `${opts.worktreePath}:/workspace`,
    '-v', `${opts.gitDir}:/repo/.git`,
    '-e', `YOLOBOX_ID=${opts.id}`,
  ]

  if (opts.gitIdentity.name) {
    args.push('-e', `GIT_AUTHOR_NAME=${opts.gitIdentity.name}`)
    args.push('-e', `GIT_COMMITTER_NAME=${opts.gitIdentity.name}`)
  }

  if (opts.gitIdentity.email) {
    args.push('-e', `GIT_AUTHOR_EMAIL=${opts.gitIdentity.email}`)
    args.push('-e', `GIT_COMMITTER_EMAIL=${opts.gitIdentity.email}`)
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

export function killContainer(id: string): boolean {
  const stop = spawnSync('docker', ['stop', `yolobox-${id}`], { stdio: ['pipe', 'pipe', 'pipe'] })
  if (stop.status !== 0) return false
  const rm = spawnSync('docker', ['rm', `yolobox-${id}`], { stdio: ['pipe', 'pipe', 'pipe'] })
  return rm.status === 0
}
