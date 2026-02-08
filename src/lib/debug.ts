import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pc from 'picocolors'

let _enabled = false
let _logPath: string | null = null

/**
 * Enable debug mode and create the log file in the current working directory.
 * Returns the path to the log file.
 */
export function enable(): string {
  _enabled = true
  _logPath = join(process.cwd(), 'yolobox-debug.log')
  writeFileSync(
    _logPath,
    `yolobox debug log — ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`,
  )
  return _logPath
}

export function isEnabled(): boolean {
  return _enabled
}

export function getLogPath(): string | null {
  return _logPath
}

function timestamp(): string {
  return new Date().toTimeString().slice(0, 8)
}

/** Write a message to the debug log file only. */
export function log(message: string): void {
  if (!_enabled || !_logPath) return
  appendFileSync(_logPath, `[${timestamp()}] ${message}\n`)
}

/** Write an error to both the log file and console. */
export function error(message: string): void {
  if (!_enabled || !_logPath) return
  const ts = timestamp()
  appendFileSync(_logPath, `[${ts}] ERROR: ${message}\n`)
  process.stderr.write(`${pc.dim(`[${ts}]`)} ${pc.red(message)}\n`)
}

/** Log a command execution. Errors from failed commands are also printed to console. */
export function logCommand(
  cmd: string,
  args: string[],
  result: { status: number | null; stdout: string; stderr: string },
): void {
  if (!_enabled || !_logPath) return

  const lines = [`$ ${cmd} ${args.join(' ')}`, `exit code: ${result.status}`]
  if (result.stdout.trim()) lines.push(`stdout:\n${result.stdout.trim()}`)
  if (result.stderr.trim()) lines.push(`stderr:\n${result.stderr.trim()}`)
  log(lines.join('\n'))

  // Print errors from failed commands to console
  if (result.status !== 0) {
    const errorOutput = result.stderr.trim() || result.stdout.trim()
    if (errorOutput) {
      process.stderr.write(`${pc.dim('[debug]')} ${pc.red(errorOutput)}\n`)
    }
  }
}
