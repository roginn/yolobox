import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/docker', () => ({
  isDockerRunning: vi.fn(),
}))

vi.mock('../src/lib/boxes', () => ({
  listBoxes: vi.fn(),
}))

vi.mock('../src/lib/ui', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  colors: {
    dim: (value: string) => value,
    green: (value: string) => value,
    yellow: (value: string) => value,
    cyan: (value: string) => value,
    magenta: (value: string) => value,
  },
}))

const mockExit = vi
  .spyOn(process, 'exit')
  .mockImplementation(() => undefined as never)

import lsCommand from '../src/commands/ls'
import { listBoxes } from '../src/lib/boxes'
import * as docker from '../src/lib/docker'
import * as ui from '../src/lib/ui'

async function runLs(args: Record<string, unknown> = {}) {
  await (
    lsCommand as {
      run: (ctx: { args: Record<string, unknown> }) => Promise<void>
    }
  ).run({ args })
}

describe('yolobox ls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(docker.isDockerRunning).mockReturnValue(true)
  })

  it('prints TYPE column in unified mode', async () => {
    vi.mocked(listBoxes).mockReturnValue([
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

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await runLs()

    expect(logSpy).toHaveBeenCalled()
    const header = logSpy.mock.calls[0][0] as string
    expect(header).toContain('TYPE')

    logSpy.mockRestore()
  })

  it('warns when docker is down and defaults to vm-only display', async () => {
    vi.mocked(docker.isDockerRunning).mockReturnValue(false)
    vi.mocked(listBoxes).mockReturnValue([])

    await runLs()

    expect(ui.warn).toHaveBeenCalledWith(
      'Docker is not running. Showing VM yoloboxes only.',
    )
  })

  it('errors when --docker is used and docker is down', async () => {
    vi.mocked(docker.isDockerRunning).mockReturnValue(false)

    await runLs({ docker: true })

    expect(ui.error).toHaveBeenCalledWith('Docker is not running.')
    expect(mockExit).toHaveBeenCalledWith(1)
  })
})
