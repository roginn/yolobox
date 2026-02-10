import fs from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

let resolvedVmHome: string | null = null

function pickWritableVmHome(): string {
  const preferred =
    process.env.YOLOBOX_VM_HOME || path.join(homedir(), '.yolobox', 'vm')
  try {
    fs.mkdirSync(preferred, { recursive: true })
    return preferred
  } catch {
    const fallback = path.join(process.cwd(), '.yolobox-vm')
    fs.mkdirSync(fallback, { recursive: true })
    return fallback
  }
}

export function getVmHome(): string {
  if (!resolvedVmHome) {
    resolvedVmHome = pickWritableVmHome()
  }
  return resolvedVmHome
}

export function getImagesDir(): string {
  return path.join(getVmHome(), 'images')
}

export function getInstancesDir(): string {
  return path.join(getVmHome(), 'instances')
}

export function getInstanceDir(id: string): string {
  return path.join(getInstancesDir(), id)
}

export function getStatePath(id: string): string {
  return path.join(getInstanceDir(id), 'state.json')
}

export function getGlobalSshKeyPath(): string {
  return path.join(getVmHome(), 'ssh_ed25519')
}

export function ensureVmDirs(): void {
  fs.mkdirSync(getVmHome(), { recursive: true })
  fs.mkdirSync(getImagesDir(), { recursive: true })
  fs.mkdirSync(getInstancesDir(), { recursive: true })
}
