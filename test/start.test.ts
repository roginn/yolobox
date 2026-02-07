import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContainerInfo } from '../src/lib/docker'

// Mock docker module
vi.mock('../src/lib/docker', () => ({
  isDockerRunning: vi.fn(),
  listContainers: vi.fn(),
  execInContainer: vi.fn(),
  restartContainer: vi.fn(),
}))

// Mock container-setup module
vi.mock('../src/lib/container-setup', () => ({
  setupContainer: vi.fn(),
}))

// Mock ui module
vi.mock('../src/lib/ui', () => ({
  error: vi.fn(),
  info: vi.fn(),
  outro: vi.fn(),
}))

// Mock process.exit to prevent test termination
const mockExit = vi
  .spyOn(process, 'exit')
  .mockImplementation(() => undefined as never)

import startCommand from '../src/commands/start'
import { setupContainer } from '../src/lib/container-setup'
import * as docker from '../src/lib/docker'
import * as ui from '../src/lib/ui'

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'swift-falcon',
    branch: 'yolo/swift-falcon',
    status: 'running',
    created: '5 min ago',
    path: '/home/user/project',
    ...overrides,
  }
}

async function runStart(name?: string) {
  await (
    startCommand as {
      run: (ctx: { args: Record<string, unknown> }) => Promise<void>
    }
  ).run({
    args: { name },
  })
}

describe('yolobox start', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(docker.isDockerRunning).mockReturnValue(true)
    vi.mocked(docker.execInContainer).mockReturnValue(0)
    vi.mocked(docker.restartContainer).mockReturnValue(true)
    vi.mocked(setupContainer).mockResolvedValue({
      id: 'new-box',
      repoRoot: '/home/user/project',
    })
  })

  describe('with existing container name', () => {
    it('attaches to a running container without creating a new one', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'swift-falcon', status: 'running' }),
      ])

      await runStart('swift-falcon')

      expect(ui.info).toHaveBeenCalledWith(
        'Container "swift-falcon" is already running. Attaching...',
      )
      expect(docker.execInContainer).toHaveBeenCalledWith('swift-falcon', [
        'bash',
      ])
      expect(setupContainer).not.toHaveBeenCalled()
    })

    it('restarts a stopped container and attaches', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'swift-falcon', status: 'stopped' }),
      ])

      await runStart('swift-falcon')

      expect(ui.info).toHaveBeenCalledWith(
        'Restarting stopped container "swift-falcon"...',
      )
      expect(docker.restartContainer).toHaveBeenCalledWith('swift-falcon')
      expect(ui.outro).toHaveBeenCalledWith(
        'Launching shell in swift-falcon...',
      )
      expect(docker.execInContainer).toHaveBeenCalledWith('swift-falcon', [
        'bash',
      ])
      expect(setupContainer).not.toHaveBeenCalled()
    })

    it('errors when restart of stopped container fails', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'swift-falcon', status: 'stopped' }),
      ])
      vi.mocked(docker.restartContainer).mockReturnValue(false)

      await runStart('swift-falcon')

      expect(ui.error).toHaveBeenCalledWith(
        'Failed to restart container "swift-falcon".',
      )
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(docker.execInContainer).not.toHaveBeenCalled()
      expect(setupContainer).not.toHaveBeenCalled()
    })

    it('falls through to setupContainer when name does not match any container', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([])

      await runStart('new-box')

      expect(setupContainer).toHaveBeenCalledWith({ name: 'new-box' })
      expect(docker.restartContainer).not.toHaveBeenCalled()
    })
  })

  describe('without name (new container)', () => {
    it('creates a new container via setupContainer', async () => {
      await runStart()

      expect(setupContainer).toHaveBeenCalledWith({ name: undefined })
      expect(ui.outro).toHaveBeenCalledWith('Launching shell in new-box...')
      expect(docker.execInContainer).toHaveBeenCalledWith('new-box', ['bash'])
    })

    it('does not check for existing containers', async () => {
      await runStart()

      expect(docker.listContainers).not.toHaveBeenCalled()
    })
  })

  describe('docker checks', () => {
    it('errors when Docker is not running and name is provided', async () => {
      vi.mocked(docker.isDockerRunning).mockReturnValue(false)

      await runStart('swift-falcon')

      expect(ui.error).toHaveBeenCalledWith('Docker is not running.')
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(docker.execInContainer).not.toHaveBeenCalled()
      expect(setupContainer).not.toHaveBeenCalled()
    })
  })

  describe('exit code forwarding', () => {
    it('forwards exit code when attaching to running container', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'swift-falcon', status: 'running' }),
      ])
      vi.mocked(docker.execInContainer).mockReturnValue(42)

      await runStart('swift-falcon')

      expect(mockExit).toHaveBeenCalledWith(42)
    })

    it('forwards exit code when restarting stopped container', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'swift-falcon', status: 'stopped' }),
      ])
      vi.mocked(docker.execInContainer).mockReturnValue(130)

      await runStart('swift-falcon')

      expect(mockExit).toHaveBeenCalledWith(130)
    })
  })
})
