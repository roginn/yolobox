import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const AUTH_DIR_NAME = '.yolobox'
const AUTH_FILE_NAME = 'auth.json'

export function getAuthDir(): string {
  return join(homedir(), AUTH_DIR_NAME)
}

export function getAuthFilePath(): string {
  return join(getAuthDir(), AUTH_FILE_NAME)
}

export function saveToken(token: string): void {
  const dir = getAuthDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { mode: 0o700, recursive: true })
  }
  const data = JSON.stringify({ claudeOauthToken: token }, null, 2)
  writeFileSync(getAuthFilePath(), `${data}\n`, { mode: 0o600 })
}

export function loadToken(): string | null {
  const filePath = getAuthFilePath()
  if (!existsSync(filePath)) {
    return null
  }
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'))
    return data.claudeOauthToken || null
  } catch {
    return null
  }
}

export function removeToken(): boolean {
  const filePath = getAuthFilePath()
  if (!existsSync(filePath)) {
    return false
  }
  unlinkSync(filePath)
  return true
}

/**
 * Resolve the Claude OAuth token. Priority:
 * 1. CLAUDE_CODE_OAUTH_TOKEN env var
 * 2. Stored token from ~/.yolobox/auth.json
 * 3. null (no token available)
 */
export function resolveToken(): string | null {
  const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
  if (envToken) {
    return envToken
  }
  return loadToken()
}

export function isValidToken(token: string): boolean {
  return token.startsWith('sk-ant-')
}

export function maskToken(token: string): string {
  if (token.length <= 12) {
    return '***'
  }
  return `${token.slice(0, 10)}...${token.slice(-4)}`
}
