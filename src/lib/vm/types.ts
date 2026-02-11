export type VmEngine = 'lima' | 'firecracker'

export interface VmState {
  id: string
  engine: VmEngine
  machineName: string
  repoPath: string
  worktreePath: string
  gitDir: string
  branch: string
  createdAt: string
  statusHint: 'running' | 'stopped'
  sshPort?: number
  pid?: number
  tapDevice?: string
}

export interface VmExecOptions {
  id: string
  command: string[]
  claudeOauthToken?: string
  gitIdentity?: { name: string; email: string }
}

export interface VmEnsureOptions {
  id: string
  repoPath: string
  worktreePath: string
  gitDir: string
  branch: string
}

export interface VmInfo {
  id: string
  engine: VmEngine
  branch: string
  status: 'running' | 'stopped'
  created: string
  path: string
}
