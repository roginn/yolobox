import fs from 'node:fs'
import path from 'node:path'
import * as debug from '../debug'
import { buildProvisionScript, getDebianCloudImageUrl } from './provision'
import { ensureInstanceDir, getInstanceFile } from './state'
import type { VmExecOptions, VmState } from './types'
import { commandExists, run } from './utils'

interface LimaMachineInfo {
  name: string
  status: string
}

function yamlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function buildLimaConfig(state: VmState): string {
  const imageUrl = getDebianCloudImageUrl()

  return `images:
  - location: ${yamlQuote(imageUrl)}
mounts:
  - location: ${yamlQuote(state.worktreePath)}
    writable: true
    mountPoint: /workspace
  - location: ${yamlQuote(state.gitDir)}
    writable: true
    mountPoint: /repo/.git
cpus: ${process.env.YOLOBOX_VM_CPUS || '2'}
memory: ${yamlQuote(`${process.env.YOLOBOX_VM_MEMORY_MB || '2048'}MiB`)}
disk: ${yamlQuote(`${process.env.YOLOBOX_VM_DISK_GB || '4'}GiB`)}
mountType: virtiofs
containerd:
  system: false
  user: false
provision:
  - mode: system
    script: |
${buildProvisionScript()
  .split('\n')
  .map((line) => `      ${line}`)
  .join('\n')}
`
}

function parseTemplateList(output: string): LimaMachineInfo[] {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, status] = line.includes('|')
        ? line.split('|')
        : line.includes('\t')
          ? line.split('\t')
          : line.includes('\\t')
            ? line.split('\\t')
            : line.split(/\s+/, 2)
      return {
        name: name?.trim() || '',
        status: status?.trim() || 'Unknown',
      }
    })
    .filter((entry) => entry.name.length > 0)
}

function parseJsonLineList(output: string): LimaMachineInfo[] {
  const entries: LimaMachineInfo[] = []
  const lines = output
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line)
      if (!parsed || typeof parsed !== 'object') continue
      const candidate = parsed as {
        name?: unknown
        status?: unknown
        Name?: unknown
        Status?: unknown
      }
      const name =
        typeof candidate.name === 'string'
          ? candidate.name
          : typeof candidate.Name === 'string'
            ? candidate.Name
            : ''
      const status =
        typeof candidate.status === 'string'
          ? candidate.status
          : typeof candidate.Status === 'string'
            ? candidate.Status
            : 'Unknown'
      if (!name) continue
      entries.push({ name, status })
    } catch {
      debug.log(`[vm] unable to parse limactl JSON line: ${line}`)
    }
  }

  return entries
}

function listLimaMachines(): LimaMachineInfo[] {
  // Primary path: formatted tab-separated output
  const formatted = run('limactl', [
    'list',
    '--format',
    '{{.Name}}|{{.Status}}',
  ])
  if (formatted.ok && formatted.stdout.trim().length > 0) {
    return parseTemplateList(formatted.stdout)
  }

  // Fallback path: line-delimited JSON
  const jsonLines = run('limactl', ['list', '--json'])
  if (jsonLines.ok && jsonLines.stdout.trim().length > 0) {
    return parseJsonLineList(jsonLines.stdout)
  }

  return []
}

export function isLimaRunning(state: VmState): boolean {
  if (!commandExists('limactl')) return false

  const machine = listLimaMachines().find((m) => m.name === state.machineName)
  if (!machine) return false
  return machine.status.toLowerCase().includes('running')
}

export function ensureLimaRunning(state: VmState): VmState {
  if (!commandExists('limactl')) {
    throw new Error(
      'Lima is required for VM mode on macOS. Install with `brew install lima`.',
    )
  }

  ensureInstanceDir(state.id)
  const configPath = getInstanceFile(state.id, 'lima.yaml')
  fs.writeFileSync(configPath, buildLimaConfig(state))

  if (isLimaRunning(state)) {
    return { ...state, statusHint: 'running' }
  }

  const machines = listLimaMachines()
  debug.log(
    `[vm] lima machines: ${machines.map((machine) => `${machine.name}:${machine.status}`).join(', ')}`,
  )
  const exists = machines.some((m) => m.name === state.machineName)
  const debugEnabled = debug.isEnabled()
  const startupFlags = ['--tty=false']
  if (!debugEnabled) {
    startupFlags.push('--log-level', 'error')
  }

  const args = exists
    ? ['start', state.machineName, ...startupFlags]
    : ['start', '--name', state.machineName, configPath, ...startupFlags]

  debug.log(`Starting Lima VM: limactl ${args.join(' ')}`)
  const startResult = run('limactl', args, { inheritStdio: debugEnabled })
  if (!startResult.ok) {
    throw new Error('Failed to start Lima VM.')
  }

  return { ...state, statusHint: 'running' }
}

export function execInLima(state: VmState, options: VmExecOptions): number {
  const args: string[] = [
    'shell',
    '--workdir',
    '/workspace',
    state.machineName,
    '--',
    'env',
  ]

  args.push(`YOLOBOX_ID=${options.id}`)
  if (options.gitIdentity?.name) {
    args.push(`GIT_AUTHOR_NAME=${options.gitIdentity.name}`)
    args.push(`GIT_COMMITTER_NAME=${options.gitIdentity.name}`)
  }
  if (options.gitIdentity?.email) {
    args.push(`GIT_AUTHOR_EMAIL=${options.gitIdentity.email}`)
    args.push(`GIT_COMMITTER_EMAIL=${options.gitIdentity.email}`)
  }
  if (options.claudeOauthToken) {
    args.push(`CLAUDE_CODE_OAUTH_TOKEN=${options.claudeOauthToken}`)
  }

  args.push('yolobox-exec', ...options.command)

  const result = run('limactl', args, { inheritStdio: true })
  return result.status
}

export function stopLima(state: VmState): boolean {
  if (!commandExists('limactl')) return false
  const result = run('limactl', ['stop', state.machineName])
  return result.ok
}

export function removeLima(state: VmState): boolean {
  if (!commandExists('limactl')) return false
  const args = ['delete', '--force', state.machineName]
  const result = run('limactl', args)
  return result.ok
}

export function limaMachineName(id: string): string {
  return `yolobox-${id}`
}

export function writeLimaBootstrapFiles(state: VmState): void {
  const instanceDir = ensureInstanceDir(state.id)
  const configPath = path.join(instanceDir, 'lima.yaml')
  fs.writeFileSync(configPath, buildLimaConfig(state))
}
