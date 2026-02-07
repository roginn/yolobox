import { defineCommand } from 'citty'
import * as docker from '../lib/docker'
import * as git from '../lib/git'
import * as ui from '../lib/ui'
import * as worktree from '../lib/worktree'

export default defineCommand({
  meta: {
    name: 'rm',
    description:
      'Remove a yolobox: kill container, delete worktree, and delete branch',
  },
  args: {
    id: {
      type: 'positional',
      description: 'The yolobox ID to remove (interactive picker if omitted)',
      required: false,
    },
  },
  run: async ({ args }) => {
    if (!docker.isDockerRunning()) {
      ui.error('Docker is not running.')
      return process.exit(1)
    }

    const repoRoot = git.getRepoRoot()
    let id = args.id as string | undefined

    if (!id) {
      const containers = docker.listContainers()

      if (containers.length === 0) {
        ui.error('No yolobox containers found.')
        return process.exit(1)
      }

      const selected = await ui.prompts.select({
        message: 'Pick a container to remove',
        options: [
          ...containers.map((c) => ({
            value: c.id,
            label: c.id,
            hint: `${c.status} • ${c.path}`,
          })),
          {
            value: '__cancel__',
            label: 'Cancel',
            hint: 'Exit without removing',
          },
        ],
      })
      if (ui.prompts.isCancel(selected) || selected === '__cancel__') {
        return process.exit(0)
      }
      id = selected as string
    } else {
      // Validate that at least one resource exists for this ID
      const hasContainer = docker.listContainers().some((c) => c.id === id)
      const hasWorktree = worktree.getExistingWorktreeIds(repoRoot).includes(id)
      const hasBranch = git.getBranches().includes(`yolo/${id}`)

      if (!hasContainer && !hasWorktree && !hasBranch) {
        ui.error(`No yolobox found with ID "${id}".`)
        return process.exit(1)
      }
    }

    // 1. Kill the container (must go first since it mounts the worktree)
    const killed = docker.killContainer(id)
    if (killed) {
      ui.success(`Killed container yolobox-${id}`)
    }

    // 2. Remove the git worktree
    const removedWorktree = worktree.removeWorktree(repoRoot, id)
    if (removedWorktree) {
      ui.success(`Removed worktree .yolobox/${id}`)
    }

    // 3. Delete the branch
    const branch = `yolo/${id}`
    const deletedBranch = git.deleteBranch(branch)
    if (deletedBranch) {
      ui.success(`Deleted branch ${branch}`)
    }
  },
})
