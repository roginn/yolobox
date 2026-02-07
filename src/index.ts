import { defineCommand, runMain } from 'citty'
import auth from './commands/auth'
import claude from './commands/claude'
import help from './commands/help'
import kill from './commands/kill'
import ls from './commands/ls'
import nuke from './commands/nuke'
import run from './commands/run'

const main = defineCommand({
  meta: {
    name: 'yolobox',
    version: '0.0.1',
    description: 'Run Claude Code in Docker containers. YOLO safely.',
  },
  subCommands: {
    auth,
    run,
    claude,
    kill,
    ls,
    help,
    nuke,
  },
})

runMain(main)
