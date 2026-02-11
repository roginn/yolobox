import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VmState } from '../src/lib/vm/types'

describe('lima config', () => {
  const originalVmHome = process.env.YOLOBOX_VM_HOME
  let vmHome = ''

  afterEach(() => {
    vi.resetModules()
    if (vmHome) {
      fs.rmSync(vmHome, { recursive: true, force: true })
      vmHome = ''
    }
    if (originalVmHome === undefined) {
      delete process.env.YOLOBOX_VM_HOME
    } else {
      process.env.YOLOBOX_VM_HOME = originalVmHome
    }
  })

  it('adds a catch-all ignore rule to disable tcp/udp forwarding to host', async () => {
    vmHome = fs.mkdtempSync(path.join(os.tmpdir(), 'yolobox-lima-'))
    process.env.YOLOBOX_VM_HOME = vmHome

    const { writeLimaBootstrapFiles } = await import('../src/lib/vm/lima')
    const state: VmState = {
      id: 'known-gale',
      engine: 'lima',
      machineName: 'yolobox-known-gale',
      repoPath: '/tmp/repo',
      worktreePath: '/tmp/repo/.yolobox/known-gale',
      gitDir: '/tmp/repo/.git',
      branch: 'yolo/known-gale',
      createdAt: new Date().toISOString(),
      statusHint: 'stopped',
    }

    writeLimaBootstrapFiles(state)

    const configPath = path.join(vmHome, 'instances', state.id, 'lima.yaml')
    const config = fs.readFileSync(configPath, 'utf-8')

    expect(config).toContain('portForwards:')
    expect(config).toContain('- guestIP: "0.0.0.0"')
    expect(config).toContain('guestIPMustBeZero: false')
    expect(config).toContain('proto: any')
    expect(config).toContain('guestPortRange: [1, 65535]')
    expect(config).toContain('ignore: true')
  })
})
