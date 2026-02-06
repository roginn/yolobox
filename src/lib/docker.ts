import { execSync, spawnSync } from 'node:child_process'

export function isDockerRunning(): boolean {
  try {
    execSync('docker info', { stdio: ['pipe', 'pipe', 'pipe'] })
    return true
  } catch {
    return false
  }
}

export interface DockerRunOptions {
  id: string
  worktreePath: string
  gitDir: string
  gitIdentity: { name: string; email: string }
  image: string
  command: string[]
}

export function buildDockerArgs(opts: DockerRunOptions): string[] {
  const args: string[] = [
    'run', '-it', '--rm',
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
  args.push(...opts.command)

  return args
}

export function runContainer(opts: DockerRunOptions): number {
  const args = buildDockerArgs(opts)
  const result = spawnSync('docker', args, { stdio: 'inherit' })
  return result.status ?? 1
}
