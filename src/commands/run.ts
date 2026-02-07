import { defineCommand } from 'citty'
import { setupContainer } from '../lib/container-setup'
import * as docker from '../lib/docker'
import * as ui from '../lib/ui'

export default defineCommand({
  meta: {
    name: 'run',
    description: 'Launch a shell in a new yolobox',
  },
  args: {
    name: {
      type: 'string',
      alias: 'n',
      description: 'Use a specific name instead of random',
    },
  },
  run: async ({ args }) => {
    const { id } = await setupContainer({ name: args.name })

    ui.outro(`Launching shell in ${id}...`)

    // Attach to container with bash (blocks until session exits)
    docker.execInContainer(id, ['bash'])
  },
})
