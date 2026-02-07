import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAuthDir,
  getAuthFilePath,
  isValidToken,
  loadToken,
  maskToken,
  removeToken,
  resolveToken,
  saveToken,
} from '../src/lib/auth'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  }
})

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os')
  return {
    ...actual,
    homedir: vi.fn(() => '/home/testuser'),
  }
})

describe('getAuthDir', () => {
  it('returns ~/.yolobox path', () => {
    expect(getAuthDir()).toBe('/home/testuser/.yolobox')
  })
})

describe('getAuthFilePath', () => {
  it('returns ~/.yolobox/auth.json path', () => {
    expect(getAuthFilePath()).toBe('/home/testuser/.yolobox/auth.json')
  })
})

describe('saveToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates directory with 0700 perms when it does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    saveToken('sk-ant-test-token')
    expect(mkdirSync).toHaveBeenCalledWith('/home/testuser/.yolobox', {
      mode: 0o700,
      recursive: true,
    })
  })

  it('does not create directory when it already exists', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    saveToken('sk-ant-test-token')
    expect(mkdirSync).not.toHaveBeenCalled()
  })

  it('writes token file with 0600 perms', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    saveToken('sk-ant-test-token')
    expect(writeFileSync).toHaveBeenCalledWith(
      '/home/testuser/.yolobox/auth.json',
      expect.stringContaining('"claudeOauthToken": "sk-ant-test-token"'),
      { mode: 0o600 },
    )
  })

  it('writes valid JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    saveToken('sk-ant-abc123')
    const writtenData = vi.mocked(writeFileSync).mock.calls[0][1] as string
    const parsed = JSON.parse(writtenData)
    expect(parsed).toEqual({ claudeOauthToken: 'sk-ant-abc123' })
  })
})

describe('loadToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(loadToken()).toBeNull()
  })

  it('returns token when file exists', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ claudeOauthToken: 'sk-ant-stored-token' }),
    )
    expect(loadToken()).toBe('sk-ant-stored-token')
  })

  it('returns null when file contains invalid JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue('not json')
    expect(loadToken()).toBeNull()
  })

  it('returns null when token field is missing', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ other: 'data' }))
    expect(loadToken()).toBeNull()
  })

  it('returns null when token field is empty string', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ claudeOauthToken: '' }),
    )
    expect(loadToken()).toBeNull()
  })
})

describe('removeToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns false when file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(removeToken()).toBe(false)
    expect(unlinkSync).not.toHaveBeenCalled()
  })

  it('deletes file and returns true when it exists', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    expect(removeToken()).toBe(true)
    expect(unlinkSync).toHaveBeenCalledWith('/home/testuser/.yolobox/auth.json')
  })
})

describe('resolveToken', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns env var when set', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-env-token'
    expect(resolveToken()).toBe('sk-ant-env-token')
  })

  it('env var takes priority over stored token', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-env-token'
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ claudeOauthToken: 'sk-ant-stored-token' }),
    )
    expect(resolveToken()).toBe('sk-ant-env-token')
  })

  it('falls back to stored token when env var not set', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ claudeOauthToken: 'sk-ant-stored-token' }),
    )
    expect(resolveToken()).toBe('sk-ant-stored-token')
  })

  it('returns null when neither env var nor stored token exists', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(resolveToken()).toBeNull()
  })
})

describe('isValidToken', () => {
  it('accepts tokens starting with sk-ant-', () => {
    expect(isValidToken('sk-ant-oat01-abc123')).toBe(true)
  })

  it('rejects tokens without sk-ant- prefix', () => {
    expect(isValidToken('invalid-token')).toBe(false)
    expect(isValidToken('sk-abc')).toBe(false)
    expect(isValidToken('')).toBe(false)
  })
})

describe('maskToken', () => {
  it('masks long tokens showing prefix and suffix', () => {
    const result = maskToken('sk-ant-oat01-abcdefghijklmnop')
    expect(result).toBe('sk-ant-oat...mnop')
    expect(result).not.toContain('abcdefghijklmnop')
  })

  it('returns *** for short tokens', () => {
    expect(maskToken('sk-ant-oat')).toBe('***')
  })

  it('does not expose full token', () => {
    const token = 'sk-ant-oat01-_BdSomeVeryLongTokenValueHereAA'
    const masked = maskToken(token)
    expect(masked.length).toBeLessThan(token.length)
  })
})
