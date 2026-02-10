import { existsSync } from 'node:fs'
import * as debug from '../debug'
import {
  ensureFirecrackerRunning,
  execInFirecracker,
  isFirecrackerRunning,
  removeFirecracker,
  stopFirecracker,
} from './firecracker'
import {
  ensureLimaRunning,
  execInLima,
  isLimaRunning,
  limaMachineName,
  removeLima,
  stopLima,
} from './lima'
import { ensureVmDirs } from './paths'
import { listVmStates, readVmState, removeVmState, writeVmState } from './state'
import type { VmEnsureOptions, VmExecOptions, VmInfo, VmState } from './types'

const VM_SHELL_BOOTSTRAP = `export PATH="$HOME/.local/bin:$PATH"
if [ ! -x "$HOME/.local/bin/claude" ] && [ -x /home/dev/.local/bin/claude ]; then
  mkdir -p "$HOME/.local/bin"
  ln -sf /home/dev/.local/bin/claude "$HOME/.local/bin/claude" || true
fi
claude() {
  local has_dangerous=0
  for arg in "$@"; do
    if [ "$arg" = "--dangerously-skip-permissions" ]; then
      has_dangerous=1
      break
    fi
  done
  if [ "$has_dangerous" -eq 1 ]; then
    command claude "$@"
  else
    command claude --dangerously-skip-permissions "$@"
  fi
}
export -f claude
exec bash -i`

function timeAgo(dateStr: string): string {
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

function defaultEngine(): 'lima' | 'firecracker' {
  if (process.platform === 'darwin') return 'lima'
  if (process.platform === 'linux') return 'firecracker'
  throw new Error(`VM mode is not supported on platform: ${process.platform}`)
}

function isRunning(state: VmState): boolean {
  if (state.engine === 'lima') return isLimaRunning(state)
  return isFirecrackerRunning(state)
}

function ensureRunning(state: VmState): VmState {
  if (state.engine === 'lima') return ensureLimaRunning(state)
  return ensureFirecrackerRunning(state)
}

function stop(state: VmState): boolean {
  if (state.engine === 'lima') return stopLima(state)
  return stopFirecracker(state)
}

function remove(state: VmState): boolean {
  if (state.engine === 'lima') return removeLima(state)
  return removeFirecracker(state)
}

function hasDangerousFlag(command: string[]): boolean {
  return command.includes('--dangerously-skip-permissions')
}

function normalizeCommand(command: string[]): string[] {
  if (command.length === 0) return command

  if (command[0] === 'claude' && !hasDangerousFlag(command)) {
    return ['claude', '--dangerously-skip-permissions', ...command.slice(1)]
  }

  if (command.length === 1 && command[0] === 'bash') {
    return ['bash', '-lc', VM_SHELL_BOOTSTRAP]
  }

  return command
}

function toVmInfo(state: VmState): VmInfo {
  const created = existsSync(state.worktreePath)
    ? timeAgo(state.createdAt)
    : state.createdAt

  return {
    id: state.id,
    engine: state.engine,
    branch: state.branch,
    status: isRunning(state) ? 'running' : 'stopped',
    created,
    path: state.repoPath,
  }
}

export function listVms(): VmInfo[] {
  ensureVmDirs()
  return listVmStates().map(toVmInfo)
}

export function listVmIds(): string[] {
  return listVmStates().map((state) => state.id)
}

export function getVm(id: string): VmInfo | null {
  const state = readVmState(id)
  if (!state) return null
  return toVmInfo(state)
}

export function ensureVmRunning(options: VmEnsureOptions): VmInfo {
  ensureVmDirs()

  const existing = readVmState(options.id)
  const baseState: VmState = existing ?? {
    id: options.id,
    engine: defaultEngine(),
    machineName:
      process.platform === 'darwin'
        ? limaMachineName(options.id)
        : `yolobox-${options.id}`,
    repoPath: options.repoPath,
    worktreePath: options.worktreePath,
    gitDir: options.gitDir,
    branch: options.branch,
    createdAt: new Date().toISOString(),
    statusHint: 'stopped',
  }

  // Keep state paths synced in case worktree was recreated.
  const state: VmState = {
    ...baseState,
    repoPath: options.repoPath,
    worktreePath: options.worktreePath,
    gitDir: options.gitDir,
    branch: options.branch,
  }

  const runningState = ensureRunning(state)
  const nextState: VmState = {
    ...runningState,
    statusHint: 'running',
  }

  writeVmState(nextState)
  return toVmInfo(nextState)
}

export function ensureVmRunningById(id: string): VmInfo {
  const state = readVmState(id)
  if (!state) {
    throw new Error(`No VM yolobox found with ID "${id}".`)
  }

  const runningState = ensureRunning(state)
  const nextState: VmState = { ...runningState, statusHint: 'running' }
  writeVmState(nextState)
  return toVmInfo(nextState)
}

export function execInVm(id: string, options: VmExecOptions): number {
  const state = readVmState(id)
  if (!state) {
    throw new Error(`No VM yolobox found with ID "${id}".`)
  }

  const command = normalizeCommand(options.command)
  debug.log(
    `[vm] execInVm id=${id} engine=${state.engine} statusHint=${state.statusHint} command=${command.join(' ')}`,
  )

  const running = isRunning(state) ? state : ensureRunning(state)
  if (!isRunning(running)) {
    throw new Error(`VM "${id}" is not running.`)
  }

  if (running.engine === 'lima') {
    return execInLima(running, { ...options, command })
  }

  return execInFirecracker(running, { ...options, command })
}

export function stopVm(id: string): boolean {
  const state = readVmState(id)
  if (!state) return false

  const ok = stop(state)
  if (ok) {
    writeVmState({ ...state, statusHint: 'stopped' })
  }
  return ok
}

export function removeVm(id: string): boolean {
  const state = readVmState(id)
  if (!state) {
    removeVmState(id)
    return false
  }

  const ok = remove(state)
  removeVmState(id)
  return ok
}

export function vmExists(id: string): boolean {
  return readVmState(id) !== null
}

export function backendLabel(engine: VmInfo['engine']): string {
  return engine === 'lima' ? 'vm:lima' : 'vm:firecracker'
}

export function debugVmSummary(id: string): void {
  const info = getVm(id)
  if (!info) return
  debug.log(
    `VM ${id}: engine=${info.engine} status=${info.status} path=${info.path}`,
  )
}
