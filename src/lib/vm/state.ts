import fs from 'node:fs'
import path from 'node:path'
import * as debug from '../debug'
import {
  ensureVmDirs,
  getInstanceDir,
  getInstancesDir,
  getStatePath,
} from './paths'
import type { VmState } from './types'

function isVmState(value: unknown): value is VmState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<VmState>
  return Boolean(
    candidate.id &&
      candidate.engine &&
      candidate.machineName &&
      candidate.repoPath &&
      candidate.worktreePath,
  )
}

export function readVmState(id: string): VmState | null {
  const statePath = getStatePath(id)
  if (!fs.existsSync(statePath)) return null

  try {
    const raw = fs.readFileSync(statePath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (!isVmState(parsed)) return null
    return parsed
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    debug.log(`Failed reading VM state for ${id}: ${message}`)
    return null
  }
}

export function writeVmState(state: VmState): void {
  ensureVmDirs()
  const instanceDir = getInstanceDir(state.id)
  fs.mkdirSync(instanceDir, { recursive: true })
  fs.writeFileSync(getStatePath(state.id), JSON.stringify(state, null, 2))
}

export function listVmStates(): VmState[] {
  ensureVmDirs()
  const instancesDir = getInstancesDir()
  if (!fs.existsSync(instancesDir)) return []

  const states: VmState[] = []
  const entries = fs.readdirSync(instancesDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const state = readVmState(entry.name)
    if (state) states.push(state)
  }
  return states
}

export function removeVmState(id: string): void {
  const instanceDir = getInstanceDir(id)
  if (fs.existsSync(instanceDir)) {
    fs.rmSync(instanceDir, { recursive: true, force: true })
  }
}

export function ensureInstanceDir(id: string): string {
  const instanceDir = getInstanceDir(id)
  fs.mkdirSync(instanceDir, { recursive: true })
  return instanceDir
}

export function getInstanceFile(id: string, fileName: string): string {
  return path.join(getInstanceDir(id), fileName)
}
