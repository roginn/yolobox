import { describe, it, expect } from 'vitest'
import { buildDockerArgs, buildExecArgs, type ContainerOptions } from '../src/lib/docker'

function makeOpts(overrides: Partial<ContainerOptions> = {}): ContainerOptions {
  return {
    id: 'swift-falcon',
    worktreePath: '/home/user/project/.yolobox/swift-falcon',
    gitDir: '/home/user/project/.git',
    gitIdentity: { name: 'Test User', email: 'test@example.com' },
    image: 'yolobox:local',
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

  it('ends with image + sleep infinity', () => {
    const args = buildDockerArgs(makeOpts())
    const imageIdx = args.indexOf('yolobox:local')
    expect(args.slice(imageIdx)).toEqual(['yolobox:local', 'sleep', 'infinity'])
  })

  it('omits git identity env vars when empty', () => {
    const args = buildDockerArgs(makeOpts({
      gitIdentity: { name: '', email: '' },
    }))
    const gitEnvs = args.filter(a => a.startsWith('GIT_AUTHOR') || a.startsWith('GIT_COMMITTER'))
    expect(gitEnvs).toHaveLength(0)
  })
})

describe('buildExecArgs', () => {
  it('produces correct exec args', () => {
    const args = buildExecArgs('swift-falcon', ['claude', '--dangerously-skip-permissions'])
    expect(args).toEqual(['exec', '-it', 'yolobox-swift-falcon', 'claude', '--dangerously-skip-permissions'])
  })

  it('works with shell command', () => {
    const args = buildExecArgs('swift-falcon', ['bash'])
    expect(args).toEqual(['exec', '-it', 'yolobox-swift-falcon', 'bash'])
  })
})
