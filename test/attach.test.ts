import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContainerInfo } from '../src/lib/docker'

// Mock docker module
vi.mock('../src/lib/docker', () => ({
  isDockerRunning: vi.fn(),
  listContainers: vi.fn(),
  execInContainer: vi.fn(),
}))

// Mock ui module
vi.mock('../src/lib/ui', () => ({
  error: vi.fn(),
  outro: vi.fn(),
  prompts: {
    select: vi.fn(),
    isCancel: vi.fn(),
  },
}))

// Mock process.exit to prevent test termination
const mockExit = vi
  .spyOn(process, 'exit')
  .mockImplementation(() => undefined as never)

import attachCommand from '../src/commands/attach'
import * as docker from '../src/lib/docker'
import * as ui from '../src/lib/ui'

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'swift-falcon',
    branch: 'swift-falcon',
    status: 'running',
    created: '5 min ago',
    path: '/home/user/project',
    ...overrides,
  }
}

async function runAttach(id?: string) {
  await (
    attachCommand as {
      run: (ctx: { args: Record<string, unknown> }) => Promise<void>
    }
  ).run({
    args: { id },
  })
}

describe('yolobox attach', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(docker.isDockerRunning).mockReturnValue(true)
    vi.mocked(docker.execInContainer).mockReturnValue(0)
  })

  describe('with id provided', () => {
    it('attaches to a running container', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([makeContainer()])

      await runAttach('swift-falcon')

      expect(docker.execInContainer).toHaveBeenCalledWith('swift-falcon', [
        'bash',
      ])
      expect(ui.outro).toHaveBeenCalledWith('Attaching to swift-falcon...')
    })

    it('errors when container id is not found', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([])

      await runAttach('ghost-box')

      expect(ui.error).toHaveBeenCalledWith(
        'No yolobox container found with ID "ghost-box".',
      )
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(docker.execInContainer).not.toHaveBeenCalled()
    })

    it('errors when container is stopped', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'swift-falcon', status: 'stopped' }),
      ])

      await runAttach('swift-falcon')

      expect(ui.error).toHaveBeenCalledWith(
        'Container "swift-falcon" is not running (status: stopped).',
      )
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(docker.execInContainer).not.toHaveBeenCalled()
    })
  })

  describe('without id (interactive picker)', () => {
    it('auto-selects when only one running container', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([makeContainer()])

      await runAttach()

      expect(ui.prompts.select).not.toHaveBeenCalled()
      expect(docker.execInContainer).toHaveBeenCalledWith('swift-falcon', [
        'bash',
      ])
    })

    it('shows picker when multiple running containers', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'swift-falcon', path: '/home/user/project' }),
        makeContainer({ id: 'bold-otter', path: '/home/user/project' }),
      ])
      vi.mocked(ui.prompts.select).mockResolvedValue('bold-otter')
      vi.mocked(ui.prompts.isCancel).mockReturnValue(false)

      await runAttach()

      expect(ui.prompts.select).toHaveBeenCalledWith({
        message: 'Pick a container to attach to',
        options: [
          {
            value: 'swift-falcon',
            label: 'swift-falcon',
            hint: '/home/user/project',
          },
          {
            value: 'bold-otter',
            label: 'bold-otter',
            hint: '/home/user/project',
          },
        ],
      })
      expect(docker.execInContainer).toHaveBeenCalledWith('bold-otter', [
        'bash',
      ])
    })

    it('errors when no running containers', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([])

      await runAttach()

      expect(ui.error).toHaveBeenCalledWith(
        'No running yolobox containers found.',
      )
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(docker.execInContainer).not.toHaveBeenCalled()
    })

    it('filters out stopped containers', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'swift-falcon', status: 'running' }),
        makeContainer({ id: 'dead-parrot', status: 'stopped' }),
      ])

      await runAttach()

      // Only one running container, so it should auto-select without picker
      expect(ui.prompts.select).not.toHaveBeenCalled()
      expect(docker.execInContainer).toHaveBeenCalledWith('swift-falcon', [
        'bash',
      ])
    })

    it('exits cleanly on picker cancel', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'swift-falcon' }),
        makeContainer({ id: 'bold-otter' }),
      ])
      vi.mocked(ui.prompts.select).mockResolvedValue(Symbol('cancel'))
      vi.mocked(ui.prompts.isCancel).mockReturnValue(true)

      await runAttach()

      expect(mockExit).toHaveBeenCalledWith(0)
      expect(docker.execInContainer).not.toHaveBeenCalled()
    })
  })

  describe('docker checks', () => {
    it('errors when Docker is not running', async () => {
      vi.mocked(docker.isDockerRunning).mockReturnValue(false)

      await runAttach('swift-falcon')

      expect(ui.error).toHaveBeenCalledWith('Docker is not running.')
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(docker.execInContainer).not.toHaveBeenCalled()
    })
  })

  describe('exit code forwarding', () => {
    it('forwards the container exit code', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([makeContainer()])
      vi.mocked(docker.execInContainer).mockReturnValue(42)

      await runAttach('swift-falcon')

      expect(mockExit).toHaveBeenCalledWith(42)
    })
  })
})
