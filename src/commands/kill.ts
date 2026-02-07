import { defineCommand } from 'citty'
import * as ui from '../lib/ui'
import * as docker from '../lib/docker'

export default defineCommand({
  meta: {
    name: 'kill',
    description: 'Stop and remove a running yolobox container',
  },
  args: {
    id: {
      type: 'positional',
      description: 'The yolobox ID to kill',
      required: true,
    },
  },
  run: async ({ args }) => {
    const id = args.id as string

    const killed = docker.killContainer(id)
    if (!killed) {
      ui.error(`Failed to kill yolobox-${id}. Is it running?`)
      process.exit(1)
    }

    ui.success(`Killed yolobox-${id}`)
  },
})
