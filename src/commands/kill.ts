import { defineCommand } from 'citty'
import * as docker from '../lib/docker'
import * as ui from '../lib/ui'

export default defineCommand({
  meta: {
    name: 'kill',
    description: 'Stop and remove a running yolobox container',
  },
  args: {
    id: {
      type: 'positional',
      description: 'The yolobox ID to kill (interactive picker if omitted)',
      required: false,
    },
  },
  run: async ({ args }) => {
    if (!docker.isDockerRunning()) {
      ui.error('Docker is not running.')
      return process.exit(1)
    }

    let id = args.id as string | undefined

    if (!id) {
      const containers = docker.listContainers()

      if (containers.length === 0) {
        ui.error('No yolobox containers found.')
        return process.exit(1)
      }

      const selected = await ui.prompts.select({
        message: 'Pick a container to kill',
        options: [
          ...containers.map((c) => ({
            value: c.id,
            label: c.id,
            hint: `${c.status} • ${c.path}`,
          })),
          {
            value: '__cancel__',
            label: 'Cancel',
            hint: 'Exit without killing',
          },
        ],
      })
      if (ui.prompts.isCancel(selected) || selected === '__cancel__') {
        return process.exit(0)
      }
      id = selected as string
    } else {
      const containers = docker.listContainers()
      const match = containers.find((c) => c.id === id)
      if (!match) {
        ui.error(`No yolobox container found with ID "${id}".`)
        return process.exit(1)
      }
    }

    const killed = docker.killContainer(id)
    if (!killed) {
      ui.error(`Failed to kill yolobox-${id}. Is it running?`)
      process.exit(1)
    }

    ui.success(`Killed yolobox-${id}`)
  },
})
