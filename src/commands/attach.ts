import { defineCommand } from 'citty'
import { resolveToken } from '../lib/auth'
import type { BackendFilter } from '../lib/backend'
import { resolveBackendFilter } from '../lib/backend'
import { listBoxes, resolveBox } from '../lib/boxes'
import * as debug from '../lib/debug'
import * as docker from '../lib/docker'
import * as git from '../lib/git'
import * as ui from '../lib/ui'
import * as vm from '../lib/vm'

export default defineCommand({
  meta: {
    name: 'attach',
    description: 'Attach a shell to a running yolobox',
  },
  args: {
    id: {
      type: 'positional',
      description:
        'The yolobox ID to attach to (interactive picker if omitted)',
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

    let box = null
    let id = args.id as string | undefined

    if (!id) {
      const boxes = listBoxes({ backend, dockerRunning })
      if (boxes.length === 0) {
        ui.error('No yoloboxes found.')
        return process.exit(1)
      }

      if (boxes.length === 1) {
        box = boxes[0]
        id = box.id
      } else {
        const selected = await ui.prompts.select({
          message: 'Pick a yolobox to attach to',
          options: boxes.map((candidate) => ({
            value: `${candidate.backend}:${candidate.id}`,
            label: candidate.id,
            hint: `${candidate.backend} • ${candidate.status} • ${candidate.path}`,
          })),
        })

        if (ui.prompts.isCancel(selected)) {
          return process.exit(0)
        }

        const selectedValue = selected as string
        const [selectedBackend, selectedId] = selectedValue.split(':')
        box = resolveBox(selectedId, {
          backend: selectedBackend === 'docker' ? 'docker' : 'vm',
          dockerRunning,
        })
        id = selectedId
      }
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
      if (box.status !== 'running') {
        ui.info(`Restarting stopped container "${id}"...`)
        if (!docker.restartContainer(id)) {
          ui.error(`Failed to restart container "${id}".`)
          return process.exit(1)
        }
      }

      ui.outro(`Attaching to ${id} (docker)...`)
      const exitCode = docker.execInContainer(id, ['bash'])
      return process.exit(exitCode)
    }

    if (box.status !== 'running') {
      ui.info(`Starting stopped VM "${id}"...`)
      try {
        vm.ensureVmRunningById(id)
      } catch (err) {
        ui.error(err instanceof Error ? err.message : String(err))
        return process.exit(1)
      }
    }

    ui.outro(`Attaching to ${id} (vm)...`)
    try {
      const exitCode = vm.execInVm(id, {
        id,
        command: ['bash'],
        claudeOauthToken: resolveToken() ?? undefined,
        gitIdentity: git.getGitIdentity(),
      })
      process.exit(exitCode)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (debug.isEnabled()) {
        ui.error(
          `VM attach failed: ${message}\nDebug log: ${debug.getLogPath()}`,
        )
      } else {
        ui.error(`VM attach failed: ${message}\nRun again with --debug.`)
      }
      process.exit(1)
    }
  },
})
