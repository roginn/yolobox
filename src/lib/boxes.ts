import type { Backend, BackendFilter } from './backend'
import * as docker from './docker'
import * as vm from './vm'

export interface BoxInfo {
  id: string
  backend: Backend
  branch: string
  status: 'running' | 'stopped'
  created: string
  path: string
}

export function listBoxes(
  options: { backend?: BackendFilter; dockerRunning?: boolean } = {},
): BoxInfo[] {
  const backend = options.backend ?? 'all'

  const result: BoxInfo[] = []

  if (backend === 'all' || backend === 'docker') {
    const dockerRunning = options.dockerRunning ?? docker.isDockerRunning()
    if (dockerRunning) {
      result.push(
        ...docker.listContainers().map((c) => ({
          id: c.id,
          backend: 'docker' as const,
          branch: c.branch,
          status: c.status as 'running' | 'stopped',
          created: c.created,
          path: c.path,
        })),
      )
    }
  }

  if (backend === 'all' || backend === 'vm') {
    result.push(
      ...vm.listVms().map((v) => ({
        id: v.id,
        backend: 'vm' as const,
        branch: v.branch,
        status: v.status,
        created: v.created,
        path: v.path,
      })),
    )
  }

  return result.sort((a, b) => a.id.localeCompare(b.id))
}

export function findBoxesById(
  id: string,
  options: {
    backend?: BackendFilter
    dockerRunning?: boolean
  } = {},
): BoxInfo[] {
  return listBoxes(options).filter((box) => box.id === id)
}

export function resolveBox(
  id: string,
  options: {
    backend?: BackendFilter
    dockerRunning?: boolean
  } = {},
): BoxInfo | null {
  const matches = findBoxesById(id, options)
  if (matches.length === 0) return null

  const backend = options.backend ?? 'all'
  if (backend === 'all' && matches.length > 1) {
    throw new Error(
      `ID "${id}" exists in both Docker and VM backends. Re-run with --docker or --vm.`,
    )
  }

  return matches[0]
}
