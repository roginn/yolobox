import { homedir } from 'node:os'
import { defineCommand } from 'citty'
import * as ui from '../lib/ui'
import * as docker from '../lib/docker'

export function shortenPath(path: string, maxLen = 40): string {
  // Replace $HOME with ~
  const home = homedir()
  let display = path.startsWith(home) ? '~' + path.slice(home.length) : path

  if (display.length <= maxLen) return display

  // Truncate from the left, keeping last segments that fit
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
    description: 'List running yolobox containers',
  },
  run: async () => {
    if (!docker.isDockerRunning()) {
      ui.error('Docker is not running.')
      process.exit(1)
    }

    const containers = docker.listContainers()

    if (containers.length === 0) {
      ui.info('No yolobox containers found.')
      return
    }

    const paths = containers.map((c) => shortenPath(c.path))
    const idW = Math.max(4, ...containers.map((c) => c.id.length)) + 2
    const branchW = Math.max(8, ...containers.map((c) => c.branch.length)) + 2
    const statusW = Math.max(8, ...containers.map((c) => c.status.length)) + 2
    const createdW = Math.max(9, ...containers.map((c) => c.created.length)) + 2

    const header =
      `${'ID'.padEnd(idW)}${'BRANCH'.padEnd(branchW)}${'STATUS'.padEnd(statusW)}${'CREATED'.padEnd(createdW)}PATH`
    console.log(ui.colors.dim(header))

    for (let i = 0; i < containers.length; i++) {
      const c = containers[i]
      const statusColor = c.status === 'running' ? ui.colors.green : ui.colors.yellow
      console.log(
        `${c.id.padEnd(idW)}${c.branch.padEnd(branchW)}${statusColor(c.status.padEnd(statusW))}${ui.colors.dim(c.created.padEnd(createdW))}${ui.colors.dim(paths[i])}`,
      )
    }
  },
})
