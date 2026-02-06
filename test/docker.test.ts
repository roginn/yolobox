import { describe, it, expect } from 'vitest'
import { buildDockerArgs, type DockerRunOptions } from '../src/lib/docker'

function makeOpts(overrides: Partial<DockerRunOptions> = {}): DockerRunOptions {
  return {
    id: 'swift-falcon',
    worktreePath: '/home/user/project/.yolobox/swift-falcon',
    gitDir: '/home/user/project/.git',
    gitIdentity: { name: 'Test User', email: 'test@example.com' },
    image: 'yolobox:local',
    command: ['claude', '--dangerously-skip-permissions'],
    ...overrides,
  }
}

describe('buildDockerArgs', () => {
  it('produces correct base args', () => {
    const args = buildDockerArgs(makeOpts())
    expect(args).toContain('run')
    expect(args).toContain('-it')
    expect(args).toContain('--rm')
    expect(args).toContain('--name')
    expect(args).toContain('yolobox-swift-falcon')
  })

  it('mounts worktree as /workspace', () => {
    const args = buildDockerArgs(makeOpts())
    const vIdx = args.indexOf('-v')
    expect(args[vIdx + 1]).toBe('/home/user/project/.yolobox/swift-falcon:/workspace')
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

  it('uses shell command when specified', () => {
    const args = buildDockerArgs(makeOpts({ command: ['bash'] }))
    expect(args[args.length - 1]).toBe('bash')
  })

  it('ends with image and command', () => {
    const args = buildDockerArgs(makeOpts())
    const imageIdx = args.indexOf('yolobox:local')
    expect(imageIdx).toBeGreaterThan(0)
    expect(args.slice(imageIdx + 1)).toEqual(['claude', '--dangerously-skip-permissions'])
  })

  it('omits git identity env vars when empty', () => {
    const args = buildDockerArgs(makeOpts({
      gitIdentity: { name: '', email: '' },
    }))
    const gitEnvs = args.filter(a => a.startsWith('GIT_AUTHOR') || a.startsWith('GIT_COMMITTER'))
    expect(gitEnvs).toHaveLength(0)
  })
})
