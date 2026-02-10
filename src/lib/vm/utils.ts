import { spawnSync } from 'node:child_process'
import * as debug from '../debug'

function sanitizeArg(arg: string): string {
  if (arg.includes('CLAUDE_CODE_OAUTH_TOKEN=')) {
    return 'CLAUDE_CODE_OAUTH_TOKEN=<redacted>'
  }
  return arg
}

export function commandExists(command: string): boolean {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return result.status === 0
}

export function run(
  command: string,
  args: string[],
  options: {
    cwd?: string
    inheritStdio?: boolean
    timeout?: number
  } = {},
): {
  ok: boolean
  status: number
  stdout: string
  stderr: string
} {
  debug.log(
    `[vm] run: ${command} ${args.map((arg) => sanitizeArg(arg)).join(' ')}`,
  )

  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: options.inheritStdio ? 'inherit' : ['pipe', 'pipe', 'pipe'],
    timeout: options.timeout,
    encoding: 'utf-8',
  })

  const stdout = typeof result.stdout === 'string' ? result.stdout : ''
  const stderr = typeof result.stderr === 'string' ? result.stderr : ''
  debug.log(
    `[vm] result: status=${result.status ?? 1} stdout=${stdout.trim().slice(0, 500)} stderr=${stderr.trim().slice(0, 500)}`,
  )

  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout,
    stderr,
  }
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}
