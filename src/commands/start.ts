import { defineCommand } from 'citty'
import { setupContainer } from '../lib/container-setup'
import * as debug from '../lib/debug'
import * as docker from '../lib/docker'
import * as ui from '../lib/ui'
import * as vm from '../lib/vm'
import { setupVm } from '../lib/vm-setup'

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
    vm: {
      type: 'boolean',
      description: 'Run this yolobox in a VM instead of Docker',
      default: false,
    },
  },
  run: async ({ args }) => {
    if (args.vm) {
      try {
        const { id, claudeOauthToken, gitIdentity } = await setupVm({
          name: args.name as string | undefined,
        })

        ui.outro(`Launching shell in ${id}...`)
        const exitCode = vm.execInVm(id, {
          id,
          command: ['bash'],
          claudeOauthToken: claudeOauthToken ?? undefined,
          gitIdentity,
        })
        return process.exit(exitCode)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (debug.isEnabled()) {
          ui.error(
            `VM start failed: ${message}\nDebug log: ${debug.getLogPath()}`,
          )
        } else {
          ui.error(`VM start failed: ${message}\nRun again with --debug.`)
        }
        return process.exit(1)
      }
    }

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
          ui.error(
            `Failed to restart container "${args.name}". Run with --debug for details.`,
          )
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
    const exitCode = docker.execInContainer(id, ['bash'])
    process.exit(exitCode)
  },
})
