import { defineCommand } from 'citty'
import * as docker from '../lib/docker'
import * as ui from '../lib/ui'

export default defineCommand({
	meta: {
		name: 'attach',
		description: 'Attach a shell to a running yolobox container',
	},
	args: {
		id: {
			type: 'positional',
			description: 'The yolobox ID to attach to (interactive picker if omitted)',
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
			const containers = docker
				.listContainers()
				.filter((c) => c.status === 'running')

			if (containers.length === 0) {
				ui.error('No running yolobox containers found.')
				return process.exit(1)
			}

			if (containers.length === 1) {
				id = containers[0].id
			} else {
				const selected = await ui.prompts.select({
					message: 'Pick a container to attach to',
					options: containers.map((c) => ({
						value: c.id,
						label: c.id,
						hint: c.path,
					})),
				})
				if (ui.prompts.isCancel(selected)) return process.exit(0)
				id = selected as string
			}
		} else {
			const containers = docker.listContainers()
			const match = containers.find((c) => c.id === id)
			if (!match) {
				ui.error(`No yolobox container found with ID "${id}".`)
				return process.exit(1)
			}
			if (match.status !== 'running') {
				ui.error(
					`Container "${id}" is not running (status: ${match.status}).`,
				)
				return process.exit(1)
			}
		}

		ui.outro(`Attaching to ${id}...`)
		const exitCode = docker.execInContainer(id, ['bash'])
		process.exit(exitCode)
	},
})
