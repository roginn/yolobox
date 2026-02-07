import { defineCommand } from 'citty'
import * as ui from '../lib/ui'
import * as git from '../lib/git'
import * as docker from '../lib/docker'
import * as worktree from '../lib/worktree'
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
      const shouldInit = await ui.prompts.confirm({
        message: 'No git repo found. Initialize one here?',
      })
      if (ui.prompts.isCancel(shouldInit) || !shouldInit) {
        ui.error('yolobox needs a git repo for worktrees.')
        process.exit(1)
      }
      git.initRepo()
      ui.success('Initialized git repo')
    } else {
      ui.success('Git repo detected')
    }

    // Worktrees need at least one commit
    if (!git.hasCommits()) {
      git.createInitialCommit()
      ui.success('Created initial commit')
    }

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

    // Git identity
    const gitIdentity = git.getGitIdentity()

    // Start container (detached)
    const started = docker.startContainer({
      id,
      worktreePath,
      gitDir,
      gitIdentity,
      image: DOCKER_IMAGE,
      repoPath: repoRoot,
    })

    if (!started) {
      ui.error('Failed to start container.')
      process.exit(1)
    }

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

    // Attach to container (blocks until session exits)
    docker.execInContainer(id, command)
  },
})
