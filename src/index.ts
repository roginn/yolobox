import { defineCommand, runMain } from 'citty'
import attach from './commands/attach'
import auth from './commands/auth'
import claude from './commands/claude'
import help from './commands/help'
import kill from './commands/kill'
import ls from './commands/ls'
import nuke from './commands/nuke'
import rm from './commands/rm'
import start from './commands/start'
import * as debug from './lib/debug'

// Parse global debug flags before citty processes argv.
const debugFlagIndices = process.argv
  .map((arg, index) => ({ arg, index }))
  .filter((entry) => entry.arg === '--debug')
  .map((entry) => entry.index)

if (debugFlagIndices.length > 0) {
  // Remove from right to left so indexes stay valid.
  debugFlagIndices
    .sort((a, b) => b - a)
    .forEach((index) => {
      process.argv.splice(index, 1)
    })
  const logPath = debug.enable()
  debug.log(`yolobox v${__VERSION__}`)
  debug.log(`args: ${process.argv.slice(2).join(' ')}`)
  debug.log(`cwd: ${process.cwd()}`)
  debug.log(`node: ${process.version}`)
  debug.log(`platform: ${process.platform} ${process.arch}`)
  debug.log(`log file: ${logPath}`)
}

const main = defineCommand({
  meta: {
    name: 'yolobox',
    version: __VERSION__,
    description: 'Run Claude Code in Docker containers or VMs. YOLO safely.',
  },
  subCommands: {
    auth,
    start,
    claude,
    attach,
    kill,
    ls,
    help,
    nuke,
    rm,
  },
})

runMain(main)
