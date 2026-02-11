import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContainerInfo } from '../src/lib/docker'

vi.mock('../src/lib/docker', () => ({
  isDockerRunning: vi.fn(),
  listContainers: vi.fn(),
  killContainer: vi.fn(),
}))

vi.mock('../src/lib/vm', () => ({
  listVms: vi.fn(),
  removeVm: vi.fn(),
  vmExists: vi.fn(),
}))

vi.mock('../src/lib/ui', () => ({
  error: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
  prompts: {
    select: vi.fn(),
    isCancel: vi.fn(),
  },
}))

const mockExit = vi
  .spyOn(process, 'exit')
  .mockImplementation(() => undefined as never)

import killCommand from '../src/commands/kill'
import * as docker from '../src/lib/docker'
import * as ui from '../src/lib/ui'
import * as vm from '../src/lib/vm'

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
    vi.mocked(vm.listVms).mockReturnValue([])
    vi.mocked(vm.removeVm).mockReturnValue(true)
    vi.mocked(vm.vmExists).mockReturnValue(false)
  })

  it('kills docker box by id', async () => {
    vi.mocked(docker.listContainers).mockReturnValue([makeContainer()])

    await runKill('swift-falcon')

    expect(docker.killContainer).toHaveBeenCalledWith('swift-falcon')
    expect(ui.success).toHaveBeenCalledWith('Killed yolobox-swift-falcon')
  })

  it('errors when id is not found', async () => {
    vi.mocked(docker.listContainers).mockReturnValue([])

    await runKill('ghost-box')

    expect(ui.error).toHaveBeenCalledWith(
      'No yolobox found with ID "ghost-box".',
    )
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('errors when docker kill fails', async () => {
    vi.mocked(docker.listContainers).mockReturnValue([makeContainer()])
    vi.mocked(docker.killContainer).mockReturnValue(false)

    await runKill('swift-falcon')

    expect(ui.error).toHaveBeenCalledWith(
      'Failed to kill yolobox-swift-falcon. Is it running?',
    )
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('shows unified picker', async () => {
    vi.mocked(docker.listContainers).mockReturnValue([
      makeContainer({ id: 'swift-falcon', path: '/home/user/project1' }),
      makeContainer({
        id: 'bold-otter',
        path: '/home/user/project2',
        status: 'stopped',
      }),
    ])
    vi.mocked(ui.prompts.select).mockResolvedValue('docker:bold-otter')
    vi.mocked(ui.prompts.isCancel).mockReturnValue(false)

    await runKill()

    expect(ui.prompts.select).toHaveBeenCalledWith({
      message: 'Pick a yolobox to kill',
      options: [
        {
          value: 'docker:bold-otter',
          label: 'bold-otter',
          hint: 'docker • stopped • /home/user/project2',
        },
        {
          value: 'docker:swift-falcon',
          label: 'swift-falcon',
          hint: 'docker • running • /home/user/project1',
        },
        {
          value: '__cancel__',
          label: 'Cancel',
          hint: 'Exit without killing',
        },
      ],
    })
    expect(docker.killContainer).toHaveBeenCalledWith('bold-otter')
  })

  it('errors when no boxes exist', async () => {
    vi.mocked(docker.listContainers).mockReturnValue([])

    await runKill()

    expect(ui.error).toHaveBeenCalledWith('No yoloboxes found.')
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('exits on cancel', async () => {
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

  it('warns when docker is down and defaults to vm-only listing', async () => {
    vi.mocked(docker.isDockerRunning).mockReturnValue(false)

    await runKill('swift-falcon')

    expect(ui.warn).toHaveBeenCalledWith(
      'Docker is not running. VM yoloboxes only.',
    )
    expect(ui.error).toHaveBeenCalledWith(
      'No yolobox found with ID "swift-falcon".',
    )
    expect(mockExit).toHaveBeenCalledWith(1)
  })
})
