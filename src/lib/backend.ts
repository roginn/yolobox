export type Backend = 'docker' | 'vm'
export type BackendFilter = Backend | 'all'

export function resolveBackendFilter(flags: {
  vm?: boolean
  docker?: boolean
}): BackendFilter {
  if (flags.vm && flags.docker) {
    throw new Error('Choose only one backend flag: --vm or --docker.')
  }
  if (flags.vm) return 'vm'
  if (flags.docker) return 'docker'
  return 'all'
}
