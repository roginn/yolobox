import { defineCommand } from 'citty'
import { setupContainer } from '../lib/container-setup'
import * as debug from '../lib/debug'
import * as docker from '../lib/docker'
import * as ui from '../lib/ui'
import * as vm from '../lib/vm'
import { setupVm } from '../lib/vm-setup'

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
    vm: {
      type: 'boolean',
      description: 'Run this yolobox in a VM instead of Docker',
      default: false,
    },
  },
  run: async ({ args }) => {
    if (args.vm) {
      try {
        if (args.name) {
          const existingVm = vm.getVm(args.name as string)
          if (existingVm?.status === 'running') {
            ui.error(
              `VM "${args.name}" is already running. Use "yolobox attach ${args.name} --vm" to connect.`,
            )
            return process.exit(1)
          }
        }

        const { id, claudeOauthToken, gitIdentity } = await setupVm({
          name: args.name as string | undefined,
        })
        const command = args.prompt
          ? ['claude', '--dangerously-skip-permissions', '-p', args.prompt]
          : ['claude', '--dangerously-skip-permissions']

        ui.outro(`Launching Claude in ${id}...`)
        const exitCode = vm.execInVm(id, {
          id,
          command,
          claudeOauthToken: claudeOauthToken ?? undefined,
          gitIdentity,
        })
        return process.exit(exitCode)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (debug.isEnabled()) {
          ui.error(
            `VM Claude launch failed: ${message}\nDebug log: ${debug.getLogPath()}`,
          )
        } else {
          ui.error(
            `VM Claude launch failed: ${message}\nRun again with --debug.`,
          )
        }
        return process.exit(1)
      }
    }

    const { id } = await setupContainer({
      name: args.name as string | undefined,
    })

    // Build Claude command
    const command = args.prompt
      ? ['claude', '--dangerously-skip-permissions', '-p', args.prompt]
      : ['claude', '--dangerously-skip-permissions']

    ui.outro(`Launching Claude in ${id}...`)

    // Attach to container (blocks until session exits)
    const exitCode = docker.execInContainer(id, command)
    process.exit(exitCode)
  },
})
