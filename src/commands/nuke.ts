import { defineCommand } from 'citty'
import * as ui from '../lib/ui'
import * as git from '../lib/git'
import * as docker from '../lib/docker'

export default defineCommand({
  meta: {
    name: 'nuke',
    description: 'Kill all yolobox containers from the current directory',
  },
  args: {
    all: {
      type: 'boolean',
      description: 'Kill all yolobox containers from all directories',
      default: false,
    },
  },
  run: async ({ args }) => {
    ui.intro('yolobox nuke')

    // Check if Docker is running
    if (!docker.isDockerRunning()) {
      ui.error('Docker is not running. Please start Docker and try again.')
      process.exit(1)
    }

    // Get all containers
    const allContainers = docker.listContainers()

    // Filter containers based on --all flag
    let matchingContainers
    let locationDescription

    if (args.all) {
      matchingContainers = allContainers
      locationDescription = 'across all directories'
    } else {
      // Get current path (repo root if in git repo, otherwise cwd)
      const currentPath = git.isInsideGitRepo()
        ? git.getRepoRoot()
        : process.cwd()

      matchingContainers = allContainers.filter(
        (container) => container.path === currentPath
      )
      locationDescription = `from ${currentPath}`
    }

    // If no matching containers, show info and exit
    if (matchingContainers.length === 0) {
      const message = args.all
        ? 'No yolobox containers found.'
        : 'No yolobox containers found from this directory.'
      ui.info(message)
      process.exit(0)
    }

    // Display list of containers to be killed
    console.log(
      `\nFound ${matchingContainers.length} container${matchingContainers.length === 1 ? '' : 's'} ${locationDescription}:\n`
    )
    for (const container of matchingContainers) {
      const pathDisplay = args.all ? ` [${container.path}]` : ''
      console.log(
        `  ${container.id} (${container.branch}) - ${container.status}${pathDisplay}`
      )
    }
    console.log()

    // Confirm with user
    const confirmed = await ui.prompts.confirm({
      message: `Kill all ${matchingContainers.length} container${matchingContainers.length === 1 ? '' : 's'}?`,
      initialValue: false,
    })

    if (!confirmed || ui.prompts.isCancel(confirmed)) {
      ui.info('Cancelled.')
      process.exit(0)
    }

    // Kill each container
    const results: { id: string; success: boolean }[] = []
    for (const container of matchingContainers) {
      const success = docker.killContainer(container.id)
      results.push({ id: container.id, success })

      if (success) {
        ui.success(`Killed container ${container.id}`)
      } else {
        ui.error(`Failed to kill container ${container.id}`)
      }
    }

    // Report overall results
    const successCount = results.filter((r) => r.success).length
    const failureCount = results.length - successCount

    console.log()
    if (failureCount === 0) {
      ui.success(
        `Successfully killed all ${successCount} container${successCount === 1 ? '' : 's'}.`
      )
      process.exit(0)
    } else {
      ui.error(
        `Killed ${successCount} container${successCount === 1 ? '' : 's'}, but ${failureCount} failed.`
      )
      process.exit(1)
    }
  },
})
