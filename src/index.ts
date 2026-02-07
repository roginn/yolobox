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

const main = defineCommand({
  meta: {
    name: 'yolobox',
    version: __VERSION__,
    description: 'Run Claude Code in Docker containers. YOLO safely.',
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
