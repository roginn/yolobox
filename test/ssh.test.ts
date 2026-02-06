import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getSSHForwardingArgs } from '../src/lib/ssh'

describe('getSSHForwardingArgs', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns Docker Desktop socket on macOS', () => {
    const result = getSSHForwardingArgs('darwin')
    expect(result).toEqual({
      volumeMount: '/run/host-services/ssh-auth.sock:/run/host-services/ssh-auth.sock',
      envVar: '/run/host-services/ssh-auth.sock',
    })
  })

  it('returns SSH_AUTH_SOCK-based paths on Linux', () => {
    process.env.SSH_AUTH_SOCK = '/tmp/ssh-abc/agent.123'
    const result = getSSHForwardingArgs('linux')
    expect(result).toEqual({
      volumeMount: '/tmp/ssh-abc/agent.123:/ssh-agent',
      envVar: '/ssh-agent',
    })
  })

  it('returns null on Linux without SSH_AUTH_SOCK', () => {
    delete process.env.SSH_AUTH_SOCK
    const result = getSSHForwardingArgs('linux')
    expect(result).toBeNull()
  })
})
