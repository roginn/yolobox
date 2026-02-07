import { defineCommand } from 'citty'
import { setupContainer } from '../lib/container-setup'
import * as docker from '../lib/docker'
import * as ui from '../lib/ui'

export default defineCommand({
  meta: {
    name: 'start',
    description: 'Launch a shell in a new yolobox',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Use a specific name instead of random',
      required: false,
    },
  },
  run: async ({ args }) => {
    // If a name is provided, check if a container already exists and reuse it
    if (args.name) {
      if (!docker.isDockerRunning()) {
        ui.error('Docker is not running.')
        return process.exit(1)
      }
      const containers = docker.listContainers()
      const existing = containers.find((c) => c.id === args.name)
      if (existing) {
        if (existing.status === 'running') {
          ui.info(`Container "${args.name}" is already running. Attaching...`)
          const exitCode = docker.execInContainer(args.name as string, ['bash'])
          return process.exit(exitCode)
        }
        ui.info(`Restarting stopped container "${args.name}"...`)
        if (!docker.restartContainer(args.name as string)) {
          ui.error(`Failed to restart container "${args.name}".`)
          return process.exit(1)
        }
        ui.outro(`Launching shell in ${args.name}...`)
        const exitCode = docker.execInContainer(args.name as string, ['bash'])
        return process.exit(exitCode)
      }
    }

    const { id } = await setupContainer({
      name: args.name as string | undefined,
    })

    ui.outro(`Launching shell in ${id}...`)

    // Attach to container with bash (blocks until session exits)
    docker.execInContainer(id, ['bash'])
  },
})
