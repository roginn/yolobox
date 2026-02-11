import { homedir } from 'node:os'
import { defineCommand } from 'citty'
import type { BackendFilter } from '../lib/backend'
import { resolveBackendFilter } from '../lib/backend'
import { listBoxes } from '../lib/boxes'
import * as docker from '../lib/docker'
import * as ui from '../lib/ui'

export function shortenPath(path: string, maxLen = 40): string {
  const home = homedir()
  const display = path.startsWith(home) ? `~${path.slice(home.length)}` : path

  if (display.length <= maxLen) return display

  const parts = display.split('/')
  let short = ''
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts.slice(i).join('/')
    if (candidate.length > maxLen - 2) break
    short = candidate
  }
  return short ? `…/${short}` : `…/${parts[parts.length - 1]}`
}

export default defineCommand({
  meta: {
    name: 'ls',
    description: 'List yoloboxes across Docker and VM backends',
  },
  args: {
    vm: {
      type: 'boolean',
      description: 'List VM-backed yoloboxes only',
      default: false,
    },
    docker: {
      type: 'boolean',
      description: 'List Docker-backed yoloboxes only',
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
      ui.warn('Docker is not running. Showing VM yoloboxes only.')
    }

    const boxes = listBoxes({ backend, dockerRunning })

    if (boxes.length === 0) {
      if (backend === 'docker') {
        ui.info('No Docker yoloboxes found.')
      } else if (backend === 'vm') {
        ui.info('No VM yoloboxes found.')
      } else {
        ui.info('No yoloboxes found.')
      }
      return
    }

    const paths = boxes.map((b) => shortenPath(b.path))
    const idW = Math.max(4, ...boxes.map((b) => b.id.length)) + 2
    const typeW = Math.max(4, ...boxes.map((b) => b.backend.length)) + 2
    const branchW = Math.max(8, ...boxes.map((b) => b.branch.length)) + 2
    const statusW = Math.max(8, ...boxes.map((b) => b.status.length)) + 2
    const createdW = Math.max(9, ...boxes.map((b) => b.created.length)) + 2

    const header = `${'ID'.padEnd(idW)}${'TYPE'.padEnd(typeW)}${'BRANCH'.padEnd(branchW)}${'STATUS'.padEnd(statusW)}${'CREATED'.padEnd(createdW)}PATH`
    console.log(ui.colors.dim(header))

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]
      const statusColor =
        box.status === 'running' ? ui.colors.green : ui.colors.yellow
      const typeColor =
        box.backend === 'docker' ? ui.colors.cyan : ui.colors.magenta
      console.log(
        `${box.id.padEnd(idW)}${typeColor(box.backend.padEnd(typeW))}${box.branch.padEnd(branchW)}${statusColor(box.status.padEnd(statusW))}${ui.colors.dim(box.created.padEnd(createdW))}${ui.colors.dim(paths[i])}`,
      )
    }
  },
})
