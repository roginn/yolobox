import { defineCommand } from 'citty'
import type { BackendFilter } from '../lib/backend'
import { resolveBackendFilter } from '../lib/backend'
import { listBoxes, resolveBox } from '../lib/boxes'
import * as docker from '../lib/docker'
import * as ui from '../lib/ui'
import * as vm from '../lib/vm'

export default defineCommand({
  meta: {
    name: 'kill',
    description: 'Stop and remove a running yolobox backend instance',
  },
  args: {
    id: {
      type: 'positional',
      description: 'The yolobox ID to kill (interactive picker if omitted)',
      required: false,
    },
    vm: {
      type: 'boolean',
      description: 'Use VM backend only',
      default: false,
    },
    docker: {
      type: 'boolean',
      description: 'Use Docker backend only',
      default: false,
    },
  },
  run: async ({ args }) => {
    let backend: BackendFilter
    try {
      backend = resolveBackendFilter({
        vm: Boolean(args.vm),
        docker: Boolean(args.docker),
      })
    } catch (err) {
      ui.error(err instanceof Error ? err.message : String(err))
      return process.exit(1)
    }

    const dockerRunning = docker.isDockerRunning()
    if (backend === 'docker' && !dockerRunning) {
      ui.error('Docker is not running.')
      return process.exit(1)
    }
    if (backend === 'all' && !dockerRunning) {
      ui.warn('Docker is not running. VM yoloboxes only.')
    }

    let id = args.id as string | undefined
    let box = null

    if (!id) {
      const boxes = listBoxes({ backend, dockerRunning })
      if (boxes.length === 0) {
        ui.error('No yoloboxes found.')
        return process.exit(1)
      }

      const selected = await ui.prompts.select({
        message: 'Pick a yolobox to kill',
        options: [
          ...boxes.map((candidate) => ({
            value: `${candidate.backend}:${candidate.id}`,
            label: candidate.id,
            hint: `${candidate.backend} • ${candidate.status} • ${candidate.path}`,
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

      const [selectedBackend, selectedId] = (selected as string).split(':')
      box = resolveBox(selectedId, {
        backend: selectedBackend === 'docker' ? 'docker' : 'vm',
        dockerRunning,
      })
      id = selectedId
    } else {
      try {
        box = resolveBox(id, { backend, dockerRunning })
      } catch (err) {
        ui.error(err instanceof Error ? err.message : String(err))
        return process.exit(1)
      }

      if (!box) {
        ui.error(`No yolobox found with ID "${id}".`)
        return process.exit(1)
      }
    }

    if (!box || !id) {
      ui.error('Unable to resolve yolobox selection.')
      return process.exit(1)
    }

    if (box.backend === 'docker') {
      const killed = docker.killContainer(id)
      if (!killed) {
        ui.error(`Failed to kill yolobox-${id}. Is it running?`)
        process.exit(1)
      }
      ui.success(`Killed yolobox-${id}`)
      return
    }

    const removed = vm.removeVm(id)
    if (!removed && !vm.vmExists(id)) {
      ui.error(`Failed to remove VM yolobox-${id}.`)
      process.exit(1)
    }

    ui.success(`Killed vm yolobox-${id}`)
  },
})
