import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContainerInfo } from '../src/lib/docker'

vi.mock('../src/lib/docker', () => ({
  isDockerRunning: vi.fn(),
  listContainers: vi.fn(),
  execInContainer: vi.fn(),
  restartContainer: vi.fn(),
}))

vi.mock('../src/lib/vm', () => ({
  listVms: vi.fn(),
  ensureVmRunningById: vi.fn(),
  execInVm: vi.fn(),
}))

vi.mock('../src/lib/ui', () => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  outro: vi.fn(),
  prompts: {
    select: vi.fn(),
    isCancel: vi.fn(),
  },
}))

const mockExit = vi
  .spyOn(process, 'exit')
  .mockImplementation(() => undefined as never)

import attachCommand from '../src/commands/attach'
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
    vi.mocked(docker.restartContainer).mockReturnValue(true)
    vi.mocked(vm.listVms).mockReturnValue([])
    vi.mocked(vm.execInVm).mockReturnValue(0)
  })

  it('attaches to running docker box by id', async () => {
    vi.mocked(docker.listContainers).mockReturnValue([makeContainer()])

    await runAttach('swift-falcon')

    expect(docker.execInContainer).toHaveBeenCalledWith('swift-falcon', [
      'bash',
    ])
    expect(ui.outro).toHaveBeenCalledWith(
      'Attaching to swift-falcon (docker)...',
    )
  })

  it('errors when id is not found', async () => {
    vi.mocked(docker.listContainers).mockReturnValue([])

    await runAttach('ghost-box')

    expect(ui.error).toHaveBeenCalledWith(
      'No yolobox found with ID "ghost-box".',
    )
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('restarts a stopped docker box and attaches', async () => {
    vi.mocked(docker.listContainers).mockReturnValue([
      makeContainer({ id: 'swift-falcon', status: 'stopped' }),
    ])

    await runAttach('swift-falcon')

    expect(ui.info).toHaveBeenCalledWith(
      'Restarting stopped container "swift-falcon"...',
    )
    expect(docker.restartContainer).toHaveBeenCalledWith('swift-falcon')
    expect(docker.execInContainer).toHaveBeenCalledWith('swift-falcon', [
      'bash',
    ])
  })

  it('errors when restart fails', async () => {
    vi.mocked(docker.listContainers).mockReturnValue([
      makeContainer({ id: 'swift-falcon', status: 'stopped' }),
    ])
    vi.mocked(docker.restartContainer).mockReturnValue(false)

    await runAttach('swift-falcon')

    expect(ui.error).toHaveBeenCalledWith(
      'Failed to restart container "swift-falcon".',
    )
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('shows unified picker when multiple boxes are available', async () => {
    vi.mocked(docker.listContainers).mockReturnValue([
      makeContainer({ id: 'swift-falcon' }),
      makeContainer({ id: 'bold-otter' }),
    ])
    vi.mocked(ui.prompts.select).mockResolvedValue('docker:bold-otter')
    vi.mocked(ui.prompts.isCancel).mockReturnValue(false)

    await runAttach()

    expect(ui.prompts.select).toHaveBeenCalledWith({
      message: 'Pick a yolobox to attach to',
      options: [
        {
          value: 'docker:bold-otter',
          label: 'bold-otter',
          hint: 'docker • running • /home/user/project',
        },
        {
          value: 'docker:swift-falcon',
          label: 'swift-falcon',
          hint: 'docker • running • /home/user/project',
        },
      ],
    })
    expect(docker.execInContainer).toHaveBeenCalledWith('bold-otter', ['bash'])
  })

  it('errors when no boxes are available', async () => {
    vi.mocked(docker.listContainers).mockReturnValue([])

    await runAttach()

    expect(ui.error).toHaveBeenCalledWith('No yoloboxes found.')
    expect(mockExit).toHaveBeenCalledWith(1)
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

  it('warns when docker is down and backend defaults to all', async () => {
    vi.mocked(docker.isDockerRunning).mockReturnValue(false)

    await runAttach('swift-falcon')

    expect(ui.warn).toHaveBeenCalledWith(
      'Docker is not running. VM yoloboxes only.',
    )
    expect(ui.error).toHaveBeenCalledWith(
      'No yolobox found with ID "swift-falcon".',
    )
    expect(mockExit).toHaveBeenCalledWith(1)
  })
})
