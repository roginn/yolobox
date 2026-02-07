import { defineCommand } from 'citty'
import { setupContainer } from '../lib/container-setup'
import * as docker from '../lib/docker'
import * as ui from '../lib/ui'

export default defineCommand({
  meta: {
    name: 'claude',
    description: 'Launch Claude Code with skip permissions',
  },
  args: {
    prompt: {
      type: 'string',
      alias: 'p',
      description: 'Pass an initial prompt to Claude',
    },
    name: {
      type: 'positional',
      description: 'Use a specific name instead of random',
      required: false,
    },
  },
  run: async ({ args }) => {
    const { id } = await setupContainer({
      name: args.name as string | undefined,
    })

    // Build Claude command
    const command = args.prompt
      ? ['claude', '--dangerously-skip-permissions', '-p', args.prompt]
      : ['claude', '--dangerously-skip-permissions']

    ui.outro(`Launching Claude in ${id}...`)

    // Attach to container (blocks until session exits)
    docker.execInContainer(id, command)
  },
})
