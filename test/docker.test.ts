import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shortenPath } from '../src/commands/ls'
import {
  buildDockerArgs,
  buildExecArgs,
  type ContainerOptions,
  imageExists,
  isYoloboxDevRepo,
  resolveDockerImage,
  timeAgo,
} from '../src/lib/docker'

vi.mock('node:child_process', async () => {
  const actual =
    await vi.importActual<typeof import('node:child_process')>(
      'node:child_process',
    )
  return {
    ...actual,
    execSync: vi.fn(actual.execSync),
  }
})

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
  }
})

function makeOpts(overrides: Partial<ContainerOptions> = {}): ContainerOptions {
  return {
    id: 'swift-falcon',
    worktreePath: '/home/user/project/.yolobox/swift-falcon',
    gitDir: '/home/user/project/.git',
    gitIdentity: { name: 'Test User', email: 'test@example.com' },
    image: 'yolobox:local',
    repoPath: '/home/user/project',
    ...overrides,
  }
}

describe('buildDockerArgs', () => {
  it('produces correct base args', () => {
    const args = buildDockerArgs(makeOpts())
    expect(args).toContain('run')
    expect(args).toContain('-d')
    expect(args).toContain('--name')
    expect(args).toContain('yolobox-swift-falcon')
  })

  it('does not include -it or --rm', () => {
    const args = buildDockerArgs(makeOpts())
    expect(args).not.toContain('-it')
    expect(args).not.toContain('--rm')
  })

  it('includes yolobox label', () => {
    const args = buildDockerArgs(makeOpts())
    expect(args).toContain('yolobox=true')
  })

  it('includes repo path label', () => {
    const args = buildDockerArgs(makeOpts())
    expect(args).toContain('yolobox.path=/home/user/project')
  })

  it('mounts worktree as /workspace', () => {
    const args = buildDockerArgs(makeOpts())
    const vIdx = args.indexOf('-v')
    expect(args[vIdx + 1]).toBe(
      '/home/user/project/.yolobox/swift-falcon:/workspace',
    )
  })

  it('mounts .git dir as /repo/.git', () => {
    const args = buildDockerArgs(makeOpts())
    expect(args).toContain('/home/user/project/.git:/repo/.git')
  })

  it('passes YOLOBOX_ID env var', () => {
    const args = buildDockerArgs(makeOpts())
    expect(args).toContain('YOLOBOX_ID=swift-falcon')
  })

  it('passes git identity as env vars', () => {
    const args = buildDockerArgs(makeOpts())
    expect(args).toContain('GIT_AUTHOR_NAME=Test User')
    expect(args).toContain('GIT_AUTHOR_EMAIL=test@example.com')
    expect(args).toContain('GIT_COMMITTER_NAME=Test User')
    expect(args).toContain('GIT_COMMITTER_EMAIL=test@example.com')
  })

  it('ends with image + sleep infinity', () => {
    const args = buildDockerArgs(makeOpts())
    const imageIdx = args.indexOf('yolobox:local')
    expect(args.slice(imageIdx)).toEqual(['yolobox:local', 'sleep', 'infinity'])
  })

  it('omits git identity env vars when empty', () => {
    const args = buildDockerArgs(
      makeOpts({
        gitIdentity: { name: '', email: '' },
      }),
    )
    const gitEnvs = args.filter(
      (a) => a.startsWith('GIT_AUTHOR') || a.startsWith('GIT_COMMITTER'),
    )
    expect(gitEnvs).toHaveLength(0)
  })

  it('uses custom image when provided', () => {
    const args = buildDockerArgs(
      makeOpts({
        image: 'ghcr.io/roginn/yolobox:latest',
      }),
    )
    const imageIdx = args.indexOf('ghcr.io/roginn/yolobox:latest')
    expect(imageIdx).toBeGreaterThan(-1)
    expect(args.slice(imageIdx)).toEqual([
      'ghcr.io/roginn/yolobox:latest',
      'sleep',
      'infinity',
    ])
  })

  it('includes CLAUDE_CODE_OAUTH_TOKEN when claudeOauthToken is set', () => {
    const args = buildDockerArgs(
      makeOpts({
        claudeOauthToken: 'sk-ant-test-token-value',
      }),
    )
    expect(args).toContain('CLAUDE_CODE_OAUTH_TOKEN=sk-ant-test-token-value')
  })

  it('omits CLAUDE_CODE_OAUTH_TOKEN when claudeOauthToken is undefined', () => {
    const args = buildDockerArgs(makeOpts())
    const hasClaudeToken = args.some((a) =>
      a.startsWith('CLAUDE_CODE_OAUTH_TOKEN'),
    )
    expect(hasClaudeToken).toBe(false)
  })
})

describe('buildExecArgs', () => {
  it('produces correct exec args', () => {
    const args = buildExecArgs('swift-falcon', [
      'claude',
      '--dangerously-skip-permissions',
    ])
    expect(args).toEqual([
      'exec',
      '-it',
      'yolobox-swift-falcon',
      'claude',
      '--dangerously-skip-permissions',
    ])
  })

  it('works with shell command', () => {
    const args = buildExecArgs('swift-falcon', ['bash'])
    expect(args).toEqual(['exec', '-it', 'yolobox-swift-falcon', 'bash'])
  })
})

describe('timeAgo', () => {
  it('formats seconds', () => {
    const now = new Date(Date.now() - 30 * 1000).toISOString()
    expect(timeAgo(now)).toBe('30s ago')
  })

  it('formats minutes', () => {
    const now = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(timeAgo(now)).toBe('5 min ago')
  })

  it('formats hours', () => {
    const now = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    expect(timeAgo(now)).toBe('3h ago')
  })

  it('formats days', () => {
    const now = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(timeAgo(now)).toBe('2d ago')
  })
})

describe('shortenPath', () => {
  it('returns short paths unchanged', () => {
    expect(shortenPath('/foo/bar/baz')).toBe('/foo/bar/baz')
  })

  it('replaces $HOME with ~', () => {
    const home = homedir()
    expect(shortenPath(`${home}/projects/myapp`)).toBe('~/projects/myapp')
  })

  it('truncates long paths with …/', () => {
    const long =
      '/very/deeply/nested/directory/structure/that/is/too/long/for/display'
    const result = shortenPath(long, 30)
    expect(result).toMatch(/^…\//)
    expect(result.length).toBeLessThanOrEqual(30)
  })

  it('replaces $HOME then truncates if still too long', () => {
    const home = homedir()
    const long = `${home}/Library/Mobile Documents/com~apple~CloudDocs/experimentos/myapp`
    const result = shortenPath(long, 40)
    expect(result).toMatch(/^…\//)
    expect(result).not.toContain(home)
    expect(result.length).toBeLessThanOrEqual(40)
  })
})

describe('resolveDockerImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prioritizes env var over local and ghcr', () => {
    vi.mocked(execSync).mockReturnValue('')
    const result = resolveDockerImage({
      envImage: 'custom:tag',
      checkLocalImage: true,
    })
    expect(result).toEqual({
      image: 'custom:tag',
      source: 'env',
    })
  })

  it('uses local image when it exists and env var not set', () => {
    vi.mocked(execSync).mockReturnValue('')
    const result = resolveDockerImage({
      checkLocalImage: true,
    })
    expect(result).toEqual({
      image: 'yolobox:local',
      source: 'local',
    })
  })

  it('falls back to GHCR when local does not exist', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Image not found')
    })
    const result = resolveDockerImage({
      checkLocalImage: true,
    })
    expect(result).toEqual({
      image: 'ghcr.io/roginn/yolobox:latest',
      source: 'ghcr',
    })
  })

  it('skips local check when checkLocalImage is false', () => {
    vi.mocked(execSync).mockReturnValue('')
    const result = resolveDockerImage({
      checkLocalImage: false,
    })
    expect(result).toEqual({
      image: 'ghcr.io/roginn/yolobox:latest',
      source: 'ghcr',
    })
  })

  it('returns correct source value for env var', () => {
    const result = resolveDockerImage({
      envImage: 'alpine:latest',
    })
    expect(result.source).toBe('env')
  })

  it('returns correct source value for local', () => {
    vi.mocked(execSync).mockReturnValue('')
    const result = resolveDockerImage({})
    expect(result.source).toBe('local')
  })

  it('returns correct source value for ghcr', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Image not found')
    })
    const result = resolveDockerImage({})
    expect(result.source).toBe('ghcr')
  })

  it('treats empty string env var as unset', () => {
    vi.mocked(execSync).mockReturnValue('')
    const result = resolveDockerImage({
      envImage: '',
      checkLocalImage: true,
    })
    expect(result).toEqual({
      image: 'yolobox:local',
      source: 'local',
    })
  })
})

describe('imageExists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when image exists', () => {
    vi.mocked(execSync).mockReturnValue('')
    const result = imageExists('yolobox:local')
    expect(result).toBe(true)
  })

  it('returns false when image does not exist', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Image not found')
    })
    const result = imageExists('nonexistent:tag')
    expect(result).toBe(false)
  })
})

describe('isYoloboxDevRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when docker/Dockerfile exists', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    const result = isYoloboxDevRepo('/path/to/yolobox')
    expect(result).toBe(true)
  })

  it('returns false when docker/Dockerfile does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const result = isYoloboxDevRepo('/path/to/other-project')
    expect(result).toBe(false)
  })
})
