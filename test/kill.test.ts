import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContainerInfo } from '../src/lib/docker'

// Mock docker module
vi.mock('../src/lib/docker', () => ({
  isDockerRunning: vi.fn(),
  listContainers: vi.fn(),
  killContainer: vi.fn(),
}))

// Mock ui module
vi.mock('../src/lib/ui', () => ({
  error: vi.fn(),
  success: vi.fn(),
  prompts: {
    select: vi.fn(),
    isCancel: vi.fn(),
  },
}))

// Mock process.exit to prevent test termination
const mockExit = vi
  .spyOn(process, 'exit')
  .mockImplementation(() => undefined as never)

import killCommand from '../src/commands/kill'
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

async function runKill(id?: string) {
  await (
    killCommand as {
      run: (ctx: { args: Record<string, unknown> }) => Promise<void>
    }
  ).run({
    args: { id },
  })
}

describe('yolobox kill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(docker.isDockerRunning).mockReturnValue(true)
    vi.mocked(docker.killContainer).mockReturnValue(true)
  })

  describe('with id provided', () => {
    it('kills a container successfully', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([makeContainer()])

      await runKill('swift-falcon')

      expect(docker.killContainer).toHaveBeenCalledWith('swift-falcon')
      expect(ui.success).toHaveBeenCalledWith('Killed yolobox-swift-falcon')
    })

    it('errors when container id is not found', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([])

      await runKill('ghost-box')

      expect(ui.error).toHaveBeenCalledWith(
        'No yolobox container found with ID "ghost-box".',
      )
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(docker.killContainer).not.toHaveBeenCalled()
    })

    it('errors when kill operation fails', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([makeContainer()])
      vi.mocked(docker.killContainer).mockReturnValue(false)

      await runKill('swift-falcon')

      expect(ui.error).toHaveBeenCalledWith(
        'Failed to kill yolobox-swift-falcon. Is it running?',
      )
      expect(mockExit).toHaveBeenCalledWith(1)
    })

    it('kills both running and stopped containers', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'stopped-one', status: 'stopped' }),
      ])

      await runKill('stopped-one')

      expect(docker.killContainer).toHaveBeenCalledWith('stopped-one')
      expect(ui.success).toHaveBeenCalledWith('Killed yolobox-stopped-one')
    })
  })

  describe('without id (interactive picker)', () => {
    it('shows picker even when only one container exists', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([makeContainer()])
      vi.mocked(ui.prompts.select).mockResolvedValue('swift-falcon')
      vi.mocked(ui.prompts.isCancel).mockReturnValue(false)

      await runKill()

      expect(ui.prompts.select).toHaveBeenCalledWith({
        message: 'Pick a container to kill',
        options: [
          {
            value: 'swift-falcon',
            label: 'swift-falcon',
            hint: 'running • /home/user/project',
          },
          {
            value: '__cancel__',
            label: 'Cancel',
            hint: 'Exit without killing',
          },
        ],
      })
      expect(docker.killContainer).toHaveBeenCalledWith('swift-falcon')
      expect(ui.success).toHaveBeenCalledWith('Killed yolobox-swift-falcon')
    })

    it('shows picker when multiple containers exist', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'swift-falcon', path: '/home/user/project1' }),
        makeContainer({
          id: 'bold-otter',
          path: '/home/user/project2',
          status: 'stopped',
        }),
      ])
      vi.mocked(ui.prompts.select).mockResolvedValue('bold-otter')
      vi.mocked(ui.prompts.isCancel).mockReturnValue(false)

      await runKill()

      expect(ui.prompts.select).toHaveBeenCalledWith({
        message: 'Pick a container to kill',
        options: [
          {
            value: 'swift-falcon',
            label: 'swift-falcon',
            hint: 'running • /home/user/project1',
          },
          {
            value: 'bold-otter',
            label: 'bold-otter',
            hint: 'stopped • /home/user/project2',
          },
          {
            value: '__cancel__',
            label: 'Cancel',
            hint: 'Exit without killing',
          },
        ],
      })
      expect(docker.killContainer).toHaveBeenCalledWith('bold-otter')
      expect(ui.success).toHaveBeenCalledWith('Killed yolobox-bold-otter')
    })

    it('errors when no containers exist', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([])

      await runKill()

      expect(ui.error).toHaveBeenCalledWith('No yolobox containers found.')
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(docker.killContainer).not.toHaveBeenCalled()
    })

    it('includes both running and stopped containers in picker', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'running-one', status: 'running' }),
        makeContainer({ id: 'stopped-one', status: 'stopped' }),
      ])
      vi.mocked(ui.prompts.select).mockResolvedValue('stopped-one')
      vi.mocked(ui.prompts.isCancel).mockReturnValue(false)

      await runKill()

      expect(ui.prompts.select).toHaveBeenCalledWith({
        message: 'Pick a container to kill',
        options: expect.arrayContaining([
          expect.objectContaining({ value: 'running-one' }),
          expect.objectContaining({ value: 'stopped-one' }),
          expect.objectContaining({ value: '__cancel__', label: 'Cancel' }),
        ]),
      })
    })

    it('exits cleanly on picker cancel', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'swift-falcon' }),
        makeContainer({ id: 'bold-otter' }),
      ])
      vi.mocked(ui.prompts.select).mockResolvedValue(Symbol('cancel'))
      vi.mocked(ui.prompts.isCancel).mockReturnValue(true)

      await runKill()

      expect(mockExit).toHaveBeenCalledWith(0)
      expect(docker.killContainer).not.toHaveBeenCalled()
    })
  })

  describe('docker checks', () => {
    it('errors when Docker is not running', async () => {
      vi.mocked(docker.isDockerRunning).mockReturnValue(false)

      await runKill('swift-falcon')

      expect(ui.error).toHaveBeenCalledWith('Docker is not running.')
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(docker.killContainer).not.toHaveBeenCalled()
    })

    it('errors when Docker is not running (no id provided)', async () => {
      vi.mocked(docker.isDockerRunning).mockReturnValue(false)

      await runKill()

      expect(ui.error).toHaveBeenCalledWith('Docker is not running.')
      expect(mockExit).toHaveBeenCalledWith(1)
      expect(docker.listContainers).not.toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('handles containers with empty paths', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'no-path', path: '' }),
        makeContainer({ id: 'with-path', path: '/some/path' }),
      ])
      vi.mocked(ui.prompts.select).mockResolvedValue('no-path')
      vi.mocked(ui.prompts.isCancel).mockReturnValue(false)

      await runKill()

      expect(ui.prompts.select).toHaveBeenCalledWith({
        message: 'Pick a container to kill',
        options: [
          { value: 'no-path', label: 'no-path', hint: 'running • ' },
          {
            value: 'with-path',
            label: 'with-path',
            hint: 'running • /some/path',
          },
          {
            value: '__cancel__',
            label: 'Cancel',
            hint: 'Exit without killing',
          },
        ],
      })
      expect(docker.killContainer).toHaveBeenCalledWith('no-path')
    })

    it('exits cleanly when Cancel is selected', async () => {
      vi.mocked(docker.listContainers).mockReturnValue([
        makeContainer({ id: 'swift-falcon' }),
      ])
      vi.mocked(ui.prompts.select).mockResolvedValue('__cancel__')
      vi.mocked(ui.prompts.isCancel).mockReturnValue(false)

      await runKill()

      expect(mockExit).toHaveBeenCalledWith(0)
      expect(docker.killContainer).not.toHaveBeenCalled()
    })
  })
})
