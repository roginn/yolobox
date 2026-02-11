import { defineCommand } from 'citty'
import type { BackendFilter } from '../lib/backend'
import { resolveBackendFilter } from '../lib/backend'
import { type BoxInfo, listBoxes } from '../lib/boxes'
import * as docker from '../lib/docker'
import * as git from '../lib/git'
import * as ui from '../lib/ui'
import { colors, prompts } from '../lib/ui'
import * as vm from '../lib/vm'
import * as worktree from '../lib/worktree'

interface NukeTarget {
  id: string
  dockerBox?: BoxInfo
  vmBox?: BoxInfo
  hasBranch: boolean
  hasWorktree: boolean
  path: string
}

export default defineCommand({
  meta: {
    name: 'nuke',
    description: 'Kill yoloboxes across Docker and VM backends',
  },
  args: {
    all: {
      type: 'boolean',
      description: 'Kill yolobox resources from all directories',
      default: false,
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
    ui.intro()

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

    let boxes = listBoxes({ backend, dockerRunning })
    if (!args.all && repoRoot) {
      boxes = boxes.filter((box) => box.path === repoRoot)
    }

    let yoloBranchIds = new Set<string>()
    let worktreeIds = new Set<string>()
    if (repoRoot) {
      yoloBranchIds = new Set(
        git
          .getBranches()
          .filter((branch) => branch.startsWith('yolo/'))
          .map((branch) => branch.slice('yolo/'.length)),
      )
      worktreeIds = new Set(worktree.getExistingWorktreeIds(repoRoot))
    }

    const targetMap = new Map<string, NukeTarget>()

    for (const box of boxes) {
      const existing = targetMap.get(box.id)
      const target: NukeTarget = {
        id: box.id,
        dockerBox: existing?.dockerBox,
        vmBox: existing?.vmBox,
        hasBranch: yoloBranchIds.has(box.id),
        hasWorktree: worktreeIds.has(box.id),
        path: box.path,
      }
      if (box.backend === 'docker') {
        target.dockerBox = box
      } else {
        target.vmBox = box
      }
      targetMap.set(box.id, target)
    }

    if (repoRoot) {
      for (const id of new Set([...yoloBranchIds, ...worktreeIds])) {
        if (!targetMap.has(id)) {
          targetMap.set(id, {
            id,
            hasBranch: yoloBranchIds.has(id),
            hasWorktree: worktreeIds.has(id),
            path: repoRoot,
          })
        }
      }
    }

    const targets = [...targetMap.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    )

    if (targets.length === 0) {
      ui.info(
        args.all
          ? 'Nothing to clean up.'
          : 'No yolobox resources found for this directory.',
      )
      return process.exit(0)
    }

    console.log(
      `\nFound ${targets.length} yolobox resource${targets.length === 1 ? '' : 's'}:\n`,
    )

    for (const target of targets) {
      const parts: string[] = []
      if (target.dockerBox) {
        const dockerStatusColor =
          target.dockerBox.status === 'running' ? colors.green : colors.dim
        parts.push(`docker ${dockerStatusColor(target.dockerBox.status)}`)
      }
      if (target.vmBox) {
        const vmStatusColor =
          target.vmBox.status === 'running' ? colors.green : colors.dim
        parts.push(`vm ${vmStatusColor(target.vmBox.status)}`)
      }
      if (target.hasBranch) {
        parts.push(`branch ${colors.cyan(`yolo/${target.id}`)}`)
      }
      if (target.hasWorktree) {
        parts.push('worktree')
      }
      const pathSuffix = args.all ? `  ${colors.dim(target.path)}` : ''
      console.log(
        `  ${colors.bold(target.id)}  ${parts.join(colors.dim('  ·  '))}${pathSuffix}`,
      )
    }
    console.log()

    const hasRuntime = targets.some(
      (target) => target.dockerBox || target.vmBox,
    )
    const hasGitResources = targets.some(
      (target) => target.hasBranch || target.hasWorktree,
    )

    type Action = 'cancel' | 'kill' | 'full'
    const options: { value: Action; label: string }[] = [
      { value: 'cancel', label: 'Cancel' },
    ]

    if (hasRuntime && hasGitResources) {
      options.push(
        { value: 'kill', label: 'Kill runtime instances only' },
        {
          value: 'full',
          label: 'Nuke all (instances + branches + worktrees)',
        },
      )
    } else if (hasRuntime) {
      options.push({ value: 'kill', label: 'Kill runtime instances' })
    } else {
      options.push({ value: 'full', label: 'Delete branches and worktrees' })
    }

    const action = await prompts.select({
      message: 'What would you like to do?',
      options,
      initialValue: 'cancel' as Action,
    })

    if (action === 'cancel' || prompts.isCancel(action)) {
      ui.info('Cancelled.')
      return process.exit(0)
    }

    const shouldKill = action === 'kill' || action === 'full'
    const shouldCleanGit = action === 'full'

    let dockerKilled = 0
    let vmKilled = 0
    let killFailures = 0

    if (shouldKill) {
      for (const target of targets) {
        if (target.dockerBox) {
          const success = docker.killContainer(target.id)
          if (success) {
            ui.success(`Killed docker yolobox-${target.id}`)
            dockerKilled++
          } else {
            ui.error(`Failed to kill docker yolobox-${target.id}`)
            killFailures++
          }
        }

        if (target.vmBox) {
          const success = vm.removeVm(target.id)
          if (success) {
            ui.success(`Killed vm yolobox-${target.id}`)
            vmKilled++
          } else {
            ui.error(`Failed to kill vm yolobox-${target.id}`)
            killFailures++
          }
        }
      }
    }

    let worktreesRemoved = 0
    let branchesDeleted = 0
    if (shouldCleanGit && repoRoot) {
      for (const target of targets) {
        if (target.path !== repoRoot) continue

        if (target.hasWorktree) {
          const removed = worktree.removeWorktree(repoRoot, target.id)
          if (removed) {
            ui.success(
              `Removed worktree ${colors.bold(`.yolobox/${target.id}`)}`,
            )
            worktreesRemoved++
          }
        }

        if (target.hasBranch) {
          const branchName = `yolo/${target.id}`
          const deleted = git.deleteBranch(branchName)
          if (deleted) {
            ui.success(`Deleted branch ${colors.bold(branchName)}`)
            branchesDeleted++
          }
        }
      }
    }

    const parts: string[] = []
    if (dockerKilled > 0) {
      parts.push(
        `killed ${dockerKilled} docker instance${dockerKilled === 1 ? '' : 's'}`,
      )
    }
    if (vmKilled > 0) {
      parts.push(`killed ${vmKilled} vm instance${vmKilled === 1 ? '' : 's'}`)
    }
    if (worktreesRemoved > 0) {
      parts.push(
        `removed ${worktreesRemoved} worktree${worktreesRemoved === 1 ? '' : 's'}`,
      )
    }
    if (branchesDeleted > 0) {
      parts.push(
        `deleted ${branchesDeleted} branch${branchesDeleted === 1 ? '' : 'es'}`,
      )
    }

    if (killFailures > 0) {
      parts.push(
        `${killFailures} runtime instance${killFailures === 1 ? '' : 's'} failed`,
      )
      ui.error(`${parts.join(', ')}.`)
      return process.exit(1)
    }

    if (parts.length === 0) {
      ui.info('No changes made.')
      return process.exit(0)
    }

    const message = `${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1)}${
      parts.length > 1 ? `, ${parts.slice(1).join(', ')}` : ''
    }.`
    ui.success(message)
    return process.exit(0)
  },
})
