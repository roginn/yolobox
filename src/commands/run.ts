import { defineCommand } from 'citty'
import * as ui from '../lib/ui'
import * as git from '../lib/git'
import * as docker from '../lib/docker'
import * as worktree from '../lib/worktree'
import * as ssh from '../lib/ssh'
import { generateId } from '../lib/id'

const DOCKER_IMAGE = process.env.YOLOBOX_IMAGE || 'yolobox:local'

export default defineCommand({
  meta: {
    name: 'run',
    description: 'Launch a new yolobox',
  },
  args: {
    prompt: {
      type: 'string',
      alias: 'p',
      description: 'Pass an initial prompt to Claude',
    },
    shell: {
      type: 'boolean',
      alias: 's',
      description: 'Open bash shell instead of Claude',
    },
    name: {
      type: 'string',
      alias: 'n',
      description: 'Use a specific name instead of random',
    },
  },
  run: async ({ args }) => {
    ui.intro()

    // Check Docker
    if (!docker.isDockerRunning()) {
      ui.error('Docker is not running. Start Docker Desktop and try again.')
      process.exit(1)
    }
    ui.success('Docker is running')

    // Check git repo
    if (!git.isInsideGitRepo()) {
      ui.error('Not a git repo. yolobox needs git worktrees — run this inside a repo.')
      process.exit(1)
    }
    ui.success('Git repo detected')

    const repoRoot = git.getRepoRoot()
    const gitDir = git.getGitDir()

    // Generate or validate ID
    let id: string
    if (args.name) {
      id = args.name
    } else {
      const branches = new Set(git.getBranches())
      const existingWorktrees = new Set(worktree.getExistingWorktreeIds(repoRoot))
      const taken = new Set([...branches, ...existingWorktrees])
      id = generateId(taken)
    }

    // Create worktree
    const worktreePath = worktree.createWorktree(repoRoot, id)
    ui.success(`Created worktree .yolobox/${id} (branch: ${id})`)

    // Ensure .gitignore
    worktree.ensureGitignore(repoRoot)

    // SSH forwarding
    const sshArgs = ssh.getSSHForwardingArgs()
    if (sshArgs) {
      ui.success('SSH agent forwarded')
    } else {
      ui.warn('No SSH agent detected. Git push/pull won\'t work inside the container.')
    }

    // Git identity
    const gitIdentity = git.getGitIdentity()

    // Build command
    let command: string[]
    if (args.shell) {
      command = ['bash']
    } else if (args.prompt) {
      command = ['claude', '--dangerously-skip-permissions', '-p', args.prompt]
    } else {
      command = ['claude', '--dangerously-skip-permissions']
    }

    ui.outro(`Launching ${id}...`)

    // Run container (blocks until exit)
    const exitCode = docker.runContainer({
      id,
      worktreePath,
      gitDir,
      ssh: sshArgs,
      gitIdentity,
      image: DOCKER_IMAGE,
      command,
    })

    process.exit(exitCode)
  },
})
