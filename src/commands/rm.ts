import { defineCommand } from 'citty'
import type { BackendFilter } from '../lib/backend'
import { resolveBackendFilter } from '../lib/backend'
import { listBoxes, resolveBox } from '../lib/boxes'
import * as docker from '../lib/docker'
import * as git from '../lib/git'
import * as ui from '../lib/ui'
import * as vm from '../lib/vm'
import * as worktree from '../lib/worktree'

export default defineCommand({
  meta: {
    name: 'rm',
    description:
      'Remove a yolobox: stop backend instance, delete worktree, and delete branch',
  },
  args: {
    id: {
      type: 'positional',
      description: 'The yolobox ID to remove (interactive picker if omitted)',
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

    const inGitRepo = git.isInsideGitRepo()
    const repoRoot = inGitRepo ? git.getRepoRoot() : null

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
      let boxes = listBoxes({ backend, dockerRunning })
      if (repoRoot) {
        boxes = boxes.filter((candidate) => candidate.path === repoRoot)
      }

      if (boxes.length === 0) {
        ui.error('No yoloboxes found.')
        return process.exit(1)
      }

      const selected = await ui.prompts.select({
        message: 'Pick a yolobox to remove',
        options: [
          ...boxes.map((candidate) => ({
            value: `${candidate.backend}:${candidate.id}`,
            label: candidate.id,
            hint: `${candidate.backend} • ${candidate.status} • ${candidate.path}`,
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
    }

    if (!id) {
      ui.error('Unable to resolve yolobox selection.')
      return process.exit(1)
    }

    const canTouchGit = Boolean(repoRoot) && (!box || box.path === repoRoot)

    const hasContainer =
      box?.backend === 'docker' ||
      (dockerRunning &&
        backend !== 'vm' &&
        docker.listContainers().some((container) => container.id === id))
    const hasVm = box?.backend === 'vm' || vm.vmExists(id)
    const hasWorktree = canTouchGit
      ? worktree.getExistingWorktreeIds(repoRoot as string).includes(id)
      : false
    const hasBranch = canTouchGit
      ? git.getBranches().includes(`yolo/${id}`)
      : false

    if (!hasContainer && !hasVm && !hasWorktree && !hasBranch) {
      ui.error(`No yolobox found with ID "${id}".`)
      return process.exit(1)
    }

    if (hasContainer) {
      const killed = docker.killContainer(id)
      if (killed) {
        ui.success(`Killed container yolobox-${id}`)
      }
    }

    if (hasVm) {
      const removedVm = vm.removeVm(id)
      if (removedVm) {
        ui.success(`Removed VM yolobox-${id}`)
      }
    }

    if (!canTouchGit) {
      ui.warn(
        'Skipping branch/worktree cleanup because this yolobox belongs to another repo.',
      )
      return
    }

    const removedWorktree = worktree.removeWorktree(repoRoot as string, id)
    if (removedWorktree) {
      ui.success(`Removed worktree .yolobox/${id}`)
    }

    const branch = `yolo/${id}`
    const deletedBranch = git.deleteBranch(branch)
    if (deletedBranch) {
      ui.success(`Deleted branch ${branch}`)
    }
  },
})
