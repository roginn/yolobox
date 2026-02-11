import fs from 'node:fs'
import path from 'node:path'
import * as debug from '../debug'
import { getGlobalSshKeyPath, getImagesDir } from './paths'
import {
  buildCloudInitMetaData,
  buildCloudInitUserData,
  getFirecrackerArtifactUrls,
} from './provision'
import {
  ensureInstanceDir,
  getInstanceFile,
  removeVmState,
  writeVmState,
} from './state'
import type { VmExecOptions, VmState } from './types'
import { commandExists, run, shellEscape } from './utils'

const REQUIRED_COMMANDS = [
  'firectl',
  'firecracker',
  'virtiofsd',
  'cloud-localds',
  'ssh',
  'ssh-keygen',
  'ip',
  'iptables',
]

function ensureDependencies(): void {
  const missing = REQUIRED_COMMANDS.filter((cmd) => !commandExists(cmd))
  if (missing.length > 0) {
    throw new Error(
      `Missing Firecracker dependencies: ${missing.join(', ')}. Install them and retry.`,
    )
  }
}

function ensureDownload(url: string, destination: string): void {
  if (fs.existsSync(destination)) return

  fs.mkdirSync(path.dirname(destination), { recursive: true })
  const result = run('curl', ['-fsSL', '-o', destination, url], {
    inheritStdio: true,
  })
  if (!result.ok) {
    throw new Error(`Failed to download artifact: ${url}`)
  }
}

function ensureSshKey(): { privateKey: string; publicKey: string } {
  const privateKey = getGlobalSshKeyPath()
  const publicKey = `${privateKey}.pub`

  if (!fs.existsSync(privateKey) || !fs.existsSync(publicKey)) {
    const result = run('ssh-keygen', [
      '-t',
      'ed25519',
      '-f',
      privateKey,
      '-N',
      '',
      '-q',
    ])
    if (!result.ok) {
      throw new Error('Failed generating SSH key for Firecracker VM access.')
    }
  }

  return { privateKey, publicKey }
}

function computeSshPort(id: string): number {
  let hash = 0
  for (const ch of id) {
    hash = (hash * 31 + ch.charCodeAt(0)) % 1000
  }
  return 2200 + hash
}

function ensureTapNetwork(state: VmState): {
  tapDevice: string
  sshPort: number
} {
  const sshPort = state.sshPort ?? computeSshPort(state.id)
  const tapDevice = state.tapDevice ?? `yolotap-${state.id.slice(0, 8)}`
  const hostCidr = '172.16.127.1/24'

  run('sudo', ['ip', 'tuntap', 'add', tapDevice, 'mode', 'tap'])
  run('sudo', ['ip', 'addr', 'add', hostCidr, 'dev', tapDevice])
  run('sudo', ['ip', 'link', 'set', tapDevice, 'up'])
  run('sudo', ['sysctl', '-w', 'net.ipv4.ip_forward=1'])

  const natRule = [
    '-t',
    'nat',
    '-A',
    'POSTROUTING',
    '-s',
    '172.16.127.0/24',
    '!',
    '-o',
    tapDevice,
    '-j',
    'MASQUERADE',
  ]
  run('sudo', ['iptables', ...natRule])

  const forwardRule = [
    '-t',
    'nat',
    '-A',
    'PREROUTING',
    '-p',
    'tcp',
    '--dport',
    String(sshPort),
    '-j',
    'DNAT',
    '--to-destination',
    '172.16.127.2:22',
  ]
  run('sudo', ['iptables', ...forwardRule])

  return { tapDevice, sshPort }
}

function ensureCloudInit(state: VmState, sshPublicKey: string): string {
  const userDataPath = getInstanceFile(state.id, 'user-data')
  const metaDataPath = getInstanceFile(state.id, 'meta-data')
  const seedPath = getInstanceFile(state.id, 'seed.img')

  fs.writeFileSync(userDataPath, buildCloudInitUserData(sshPublicKey.trim()))
  fs.writeFileSync(metaDataPath, buildCloudInitMetaData(state.id))

  const seedResult = run('cloud-localds', [
    seedPath,
    userDataPath,
    metaDataPath,
  ])
  if (!seedResult.ok) {
    throw new Error('Failed to build cloud-init seed image for Firecracker VM.')
  }

  return seedPath
}

function ensureRootfs(state: VmState, baseRootfsPath: string): string {
  const rootfsPath = getInstanceFile(state.id, 'rootfs.ext4')
  if (!fs.existsSync(rootfsPath)) {
    fs.copyFileSync(baseRootfsPath, rootfsPath)
    const diskGb = process.env.YOLOBOX_VM_DISK_GB || '4'
    run('truncate', ['-s', `${diskGb}G`, rootfsPath])
    run('resize2fs', [rootfsPath])
  }
  return rootfsPath
}

function startVirtiofsd(sharedDir: string, socketPath: string): number {
  const command = `nohup virtiofsd --socket-path ${shellEscape(socketPath)} --shared-dir ${shellEscape(sharedDir)} >/dev/null 2>&1 & echo $!`
  const result = run('sh', ['-lc', command])
  if (!result.ok) {
    throw new Error('Failed to start virtiofsd.')
  }
  const pid = Number.parseInt(result.stdout.trim(), 10)
  return Number.isNaN(pid) ? 0 : pid
}

function waitForSsh(state: VmState, privateKeyPath: string): void {
  const port = String(state.sshPort)
  for (let i = 0; i < 120; i++) {
    const probe = run('ssh', [
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      'ConnectTimeout=2',
      '-i',
      privateKeyPath,
      '-p',
      port,
      'dev@127.0.0.1',
      'echo ready',
    ])
    if (probe.ok) return
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
  }

  throw new Error('Timed out waiting for Firecracker VM SSH access.')
}

export function isFirecrackerRunning(state: VmState): boolean {
  if (!state.pid) return false
  const check = run('sh', ['-lc', `kill -0 ${state.pid}`])
  return check.ok
}

export function ensureFirecrackerRunning(state: VmState): VmState {
  ensureDependencies()
  ensureInstanceDir(state.id)

  if (isFirecrackerRunning(state)) {
    return { ...state, statusHint: 'running' }
  }

  const { privateKey, publicKey } = ensureSshKey()
  const imagesDir = getImagesDir()
  const { kernelUrl, rootfsUrl } = getFirecrackerArtifactUrls()

  const kernelPath = path.join(
    imagesDir,
    `firecracker-${process.arch}-vmlinux.bin`,
  )
  const baseRootfsPath = path.join(
    imagesDir,
    `firecracker-${process.arch}-base.ext4`,
  )

  ensureDownload(kernelUrl, kernelPath)
  ensureDownload(rootfsUrl, baseRootfsPath)

  const rootfsPath = ensureRootfs(state, baseRootfsPath)
  const sshPublicKey = fs.readFileSync(publicKey, 'utf-8')
  const seedPath = ensureCloudInit(state, sshPublicKey)

  const { tapDevice, sshPort } = ensureTapNetwork(state)
  const worktreeSocket = getInstanceFile(state.id, 'worktree.virtiofs.sock')
  const gitSocket = getInstanceFile(state.id, 'git.virtiofs.sock')
  startVirtiofsd(state.worktreePath, worktreeSocket)
  startVirtiofsd(state.gitDir, gitSocket)

  const metadataPath = getInstanceFile(state.id, 'metadata.json')
  fs.writeFileSync(
    metadataPath,
    JSON.stringify({
      vm: state.id,
      repoPath: state.repoPath,
    }),
  )

  const socketPath = getInstanceFile(state.id, 'firecracker.socket')
  const logPath = getInstanceFile(state.id, 'firecracker.log')

  const firectlCmd = [
    'firectl',
    '--kernel',
    shellEscape(kernelPath),
    '--root-drive',
    shellEscape(rootfsPath),
    '--root-drive',
    shellEscape(seedPath),
    '--tap-device',
    shellEscape(`${tapDevice}/AA:FC:00:00:00:01`),
    '--socket-path',
    shellEscape(socketPath),
    '--metadata-file',
    shellEscape(metadataPath),
    '--ncpus',
    shellEscape(process.env.YOLOBOX_VM_CPUS || '2'),
    '--memory',
    shellEscape(process.env.YOLOBOX_VM_MEMORY_MB || '2048'),
    '--firecracker-binary',
    '$(command -v firecracker)',
  ].join(' ')

  const launchCmd = `nohup ${firectlCmd} > ${shellEscape(logPath)} 2>&1 & echo $!`
  const launch = run('sh', ['-lc', launchCmd])
  if (!launch.ok) {
    throw new Error('Failed to start Firecracker VM with firectl.')
  }

  const pid = Number.parseInt(launch.stdout.trim(), 10)
  const nextState: VmState = {
    ...state,
    pid: Number.isNaN(pid) ? undefined : pid,
    sshPort,
    tapDevice,
    statusHint: 'running',
  }

  writeVmState(nextState)
  waitForSsh(nextState, privateKey)
  return nextState
}

export function execInFirecracker(
  state: VmState,
  options: VmExecOptions,
): number {
  const privateKey = getGlobalSshKeyPath()
  const port = String(state.sshPort ?? computeSshPort(state.id))

  const envPairs: string[] = [`YOLOBOX_ID=${options.id}`]
  if (options.gitIdentity?.name) {
    envPairs.push(`GIT_AUTHOR_NAME=${options.gitIdentity.name}`)
    envPairs.push(`GIT_COMMITTER_NAME=${options.gitIdentity.name}`)
  }
  if (options.gitIdentity?.email) {
    envPairs.push(`GIT_AUTHOR_EMAIL=${options.gitIdentity.email}`)
    envPairs.push(`GIT_COMMITTER_EMAIL=${options.gitIdentity.email}`)
  }
  if (options.claudeOauthToken) {
    envPairs.push(`CLAUDE_CODE_OAUTH_TOKEN=${options.claudeOauthToken}`)
  }

  const envPart = envPairs.map((pair) => shellEscape(pair)).join(' ')
  const cmdPart = options.command.map((arg) => shellEscape(arg)).join(' ')
  const remote = `env ${envPart} yolobox-exec ${cmdPart}`

  const result = run(
    'ssh',
    [
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-i',
      privateKey,
      '-p',
      port,
      'dev@127.0.0.1',
      remote,
    ],
    { inheritStdio: true },
  )
  return result.status
}

export function stopFirecracker(state: VmState): boolean {
  if (state.pid) {
    run('sh', ['-lc', `kill ${state.pid}`])
  }

  if (state.tapDevice) {
    run('sudo', ['ip', 'link', 'set', state.tapDevice, 'down'])
    run('sudo', ['ip', 'tuntap', 'del', state.tapDevice, 'mode', 'tap'])
  }

  return true
}

export function removeFirecracker(state: VmState): boolean {
  stopFirecracker(state)
  removeVmState(state.id)
  debug.log(`Removed Firecracker VM state for ${state.id}`)
  return true
}
