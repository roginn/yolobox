import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/docker', () => ({
  isDockerRunning: vi.fn(),
  listContainers: vi.fn(),
}))

vi.mock('../src/lib/vm', () => ({
  listVms: vi.fn(),
}))

import { listBoxes, resolveBox } from '../src/lib/boxes'
import * as docker from '../src/lib/docker'
import * as vm from '../src/lib/vm'

describe('boxes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(docker.isDockerRunning).mockReturnValue(true)
    vi.mocked(docker.listContainers).mockReturnValue([
      {
        id: 'alpha',
        branch: 'yolo/alpha',
        status: 'running',
        created: '1m ago',
        path: '/repo/a',
      },
    ])
    vi.mocked(vm.listVms).mockReturnValue([
      {
        id: 'bravo',
        engine: 'lima',
        branch: 'yolo/bravo',
        status: 'stopped',
        created: '2m ago',
        path: '/repo/b',
      },
    ])
  })

  it('merges docker and vm boxes with backend labels', () => {
    const boxes = listBoxes({ backend: 'all', dockerRunning: true })

    expect(boxes).toEqual([
      {
        id: 'alpha',
        backend: 'docker',
        branch: 'yolo/alpha',
        status: 'running',
        created: '1m ago',
        path: '/repo/a',
      },
      {
        id: 'bravo',
        backend: 'vm',
        branch: 'yolo/bravo',
        status: 'stopped',
        created: '2m ago',
        path: '/repo/b',
      },
    ])
  })

  it('filters by backend', () => {
    const dockerOnly = listBoxes({ backend: 'docker', dockerRunning: true })
    const vmOnly = listBoxes({ backend: 'vm', dockerRunning: true })

    expect(dockerOnly).toHaveLength(1)
    expect(dockerOnly[0].backend).toBe('docker')
    expect(vmOnly).toHaveLength(1)
    expect(vmOnly[0].backend).toBe('vm')
  })

  it('returns null when box is missing', () => {
    expect(resolveBox('missing', { backend: 'all', dockerRunning: true })).toBe(
      null,
    )
  })

  it('throws on ambiguous id across backends', () => {
    vi.mocked(vm.listVms).mockReturnValue([
      {
        id: 'alpha',
        engine: 'lima',
        branch: 'yolo/alpha',
        status: 'running',
        created: '5m ago',
        path: '/repo/a',
      },
    ])

    expect(() =>
      resolveBox('alpha', { backend: 'all', dockerRunning: true }),
    ).toThrow('ID "alpha" exists in both Docker and VM backends')
  })
})
