import { defineCommand } from 'citty'
import * as docker from '../lib/docker'
import * as git from '../lib/git'
import * as ui from '../lib/ui'
import { colors, prompts } from '../lib/ui'
import * as worktree from '../lib/worktree'

interface NukeTarget {
  id: string
  container?: { status: string; path: string }
  hasBranch: boolean
  hasWorktree: boolean
}

export default defineCommand({
  meta: {
    name: 'nuke',
    description: 'Kill all yolobox containers, branches, and worktrees',
  },
  args: {
    all: {
      type: 'boolean',
      description: 'Kill all yolobox containers from all directories',
      default: false,
    },
  },
  run: async ({ args }) => {
    ui.intro()

    const inGitRepo = git.isInsideGitRepo()
    const repoRoot = inGitRepo ? git.getRepoRoot() : null
    const dockerRunning = docker.isDockerRunning()

    // Collect containers
    let containers: docker.ContainerInfo[] = []
    if (dockerRunning) {
      const allContainers = docker.listContainers()
      if (args.all) {
        containers = allContainers
      } else if (repoRoot) {
        containers = allContainers.filter((c) => c.path === repoRoot)
      }
    }

    // Collect yolo/* branches and worktree IDs from current repo
    let yoloBranchIds = new Set<string>()
    let worktreeIds = new Set<string>()

    if (repoRoot) {
      yoloBranchIds = new Set(
        git
          .getBranches()
          .filter((b) => b.startsWith('yolo/'))
          .map((b) => b.slice('yolo/'.length)),
      )
      worktreeIds = new Set(worktree.getExistingWorktreeIds(repoRoot))
    }

    // Build unified target list, merging by ID
    const targetMap = new Map<string, NukeTarget>()

    for (const c of containers) {
      targetMap.set(c.id, {
        id: c.id,
        container: { status: c.status, path: c.path },
        hasBranch: yoloBranchIds.has(c.id),
        hasWorktree: worktreeIds.has(c.id),
      })
    }

    // Add orphaned branches/worktrees that have no matching container
    for (const id of new Set([...yoloBranchIds, ...worktreeIds])) {
      if (!targetMap.has(id)) {
        targetMap.set(id, {
          id,
          hasBranch: yoloBranchIds.has(id),
          hasWorktree: worktreeIds.has(id),
        })
      }
    }

    const targets = [...targetMap.values()]

    if (targets.length === 0) {
      if (!dockerRunning) {
        ui.error(
          'Docker is not running and no local branches or worktrees found.',
        )
      } else {
        ui.info(
          args.all
            ? 'Nothing to clean up.'
            : 'No yolobox resources found for this directory.',
        )
      }
      process.exit(0)
    }

    // Display list
    console.log(
      `\nFound ${targets.length} yolobox resource${targets.length === 1 ? '' : 's'}:\n`,
    )

    for (const target of targets) {
      const parts: string[] = []
      if (target.container) {
        const statusColor =
          target.container.status === 'running' ? colors.green : colors.dim
        parts.push(`container ${statusColor(target.container.status)}`)
      }
      if (target.hasBranch) {
        parts.push(`branch ${colors.cyan(`yolo/${target.id}`)}`)
      }
      if (target.hasWorktree) {
        parts.push('worktree')
      }
      const pathSuffix =
        args.all && target.container
          ? `  ${colors.dim(target.container.path)}`
          : ''
      console.log(
        `  ${colors.bold(target.id)}  ${parts.join(colors.dim('  ·  '))}${pathSuffix}`,
      )
    }
    console.log()

    // Build prompt options based on what was found
    const hasContainers = targets.some((t) => t.container)
    const hasGitResources = targets.some((t) => t.hasBranch || t.hasWorktree)

    type Action = 'cancel' | 'kill' | 'full'
    const options: { value: Action; label: string }[] = [
      { value: 'cancel', label: 'Cancel' },
    ]

    if (hasContainers && hasGitResources) {
      options.push(
        { value: 'kill', label: 'Kill containers only' },
        {
          value: 'full',
          label: 'Nuke all (containers + branches + worktrees)',
        },
      )
    } else if (hasContainers) {
      options.push({ value: 'kill', label: 'Kill containers' })
    } else {
      options.push({
        value: 'full',
        label: 'Delete all branches and worktrees',
      })
    }

    const action = await prompts.select({
      message: 'What would you like to do?',
      options,
      initialValue: 'cancel' as Action,
    })

    if (action === 'cancel' || prompts.isCancel(action)) {
      ui.info('Cancelled.')
      process.exit(0)
    }

    const shouldKill = action === 'kill' || action === 'full'
    const shouldCleanGit = action === 'full'

    // Kill containers
    let containersKilled = 0
    let killFailures = 0
    if (shouldKill) {
      for (const target of targets) {
        if (!target.container) continue
        const success = docker.killContainer(target.id)
        if (success) {
          ui.success(`Killed container ${colors.bold(target.id)}`)
          containersKilled++
        } else {
          ui.error(`Failed to kill container ${target.id}`)
          killFailures++
        }
      }
    }

    // Remove worktrees and branches
    let worktreesRemoved = 0
    let branchesDeleted = 0
    if (shouldCleanGit && repoRoot) {
      for (const target of targets) {
        // Remove worktree first (it holds a lock on the branch)
        if (target.hasWorktree) {
          const removed = worktree.removeWorktree(repoRoot, target.id)
          if (removed) {
            ui.success(
              `Removed worktree ${colors.bold(`.yolobox/${target.id}`)}`,
            )
            worktreesRemoved++
          } else {
            ui.warn(`Could not remove worktree for ${target.id}`)
          }
        }

        if (target.hasBranch) {
          const branchName = `yolo/${target.id}`
          const deleted = git.deleteBranch(branchName)
          if (deleted) {
            ui.success(`Deleted branch ${colors.bold(branchName)}`)
            branchesDeleted++
          } else {
            ui.warn(`Could not delete branch ${branchName}`)
          }
        }
      }
    }

    // Summary
    console.log()
    const s = (n: number) => (n === 1 ? '' : 's')
    const summaryParts: string[] = []
    if (containersKilled > 0) {
      summaryParts.push(
        `killed ${containersKilled} container${s(containersKilled)}`,
      )
    }
    if (branchesDeleted > 0) {
      summaryParts.push(
        `deleted ${branchesDeleted} branch${branchesDeleted === 1 ? '' : 'es'}`,
      )
    }
    if (worktreesRemoved > 0) {
      summaryParts.push(
        `removed ${worktreesRemoved} worktree${s(worktreesRemoved)}`,
      )
    }

    if (killFailures > 0) {
      summaryParts.push(
        `${killFailures} container${s(killFailures)} failed to stop`,
      )
      ui.error(`${summaryParts.join(', ')}.`)
      process.exit(1)
    } else {
      // Capitalize first part
      const msg = summaryParts.join(', ')
      ui.success(`${msg.charAt(0).toUpperCase() + msg.slice(1)}.`)
      process.exit(0)
    }
  },
})
