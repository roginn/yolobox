import { defineCommand, runMain } from 'citty'
import run from './commands/run'

const main = defineCommand({
  meta: {
    name: 'yolobox',
    version: '0.0.1',
    description: 'Run Claude Code in Docker containers. YOLO safely.',
  },
  subCommands: {
    run,
  },
})

runMain(main)
