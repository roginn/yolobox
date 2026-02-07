import { defineCommand } from 'citty'
import {
  isValidToken,
  loadToken,
  maskToken,
  removeToken,
  resolveToken,
  saveToken,
} from '../lib/auth'
import * as ui from '../lib/ui'

export default defineCommand({
  meta: {
    name: 'auth',
    description: 'Configure Claude Code authentication for containers',
  },
  args: {
    token: {
      type: 'positional',
      description: 'OAuth token from `claude setup-token`',
      required: false,
    },
    remove: {
      type: 'boolean',
      description: 'Remove stored token',
      default: false,
    },
    status: {
      type: 'boolean',
      description: 'Show current auth status',
      default: false,
    },
  },
  run: async ({ args }) => {
    ui.intro()

    // --status: show current auth state
    if (args.status) {
      showStatus()
      return
    }

    // --remove: delete stored token
    if (args.remove) {
      const removed = removeToken()
      if (removed) {
        ui.success('Auth token removed.')
      } else {
        ui.warn('No stored token found.')
      }
      return
    }

    // yolobox auth <token>: store the provided token
    if (args.token) {
      const token = args.token as string
      if (!isValidToken(token)) {
        ui.error(
          'Invalid token. Expected a token starting with "sk-ant-".\nRun `claude setup-token` to generate a valid token.',
        )
        process.exit(1)
      }
      saveToken(token)
      ui.success(`Token saved. (${maskToken(token)})`)
      ui.info('Claude will authenticate automatically in new containers.')
      return
    }

    // yolobox auth (no args): try env var, or show instructions
    const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
    if (envToken) {
      if (!isValidToken(envToken)) {
        ui.error(
          'CLAUDE_CODE_OAUTH_TOKEN is set but does not look like a valid token.',
        )
        process.exit(1)
      }
      saveToken(envToken)
      ui.success(
        `Token captured from CLAUDE_CODE_OAUTH_TOKEN. (${maskToken(envToken)})`,
      )
      ui.info('Claude will authenticate automatically in new containers.')
      return
    }

    // No token provided, no env var -- show instructions
    const existing = loadToken()
    if (existing) {
      ui.success(`Already authenticated. (${maskToken(existing)})`)
      ui.info(
        'Run `yolobox auth --status` for details or `yolobox auth --remove` to clear.',
      )
      return
    }

    ui.info('Set up Claude Code authentication for yolobox containers.\n')
    ui.info('Step 1: Generate a token on your host machine:')
    ui.info('  $ claude setup-token\n')
    ui.info('Step 2: Pass the token to yolobox:')
    ui.info('  $ yolobox auth <token>\n')
    ui.info('Or set the CLAUDE_CODE_OAUTH_TOKEN env var and run:')
    ui.info('  $ export CLAUDE_CODE_OAUTH_TOKEN=<token>')
    ui.info('  $ yolobox auth')
  },
})

function showStatus(): void {
  const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
  const storedToken = loadToken()
  const activeToken = resolveToken()

  if (!activeToken) {
    ui.warn('Not authenticated. Run `yolobox auth` for setup instructions.')
    return
  }

  ui.success(`Authenticated. (${maskToken(activeToken)})`)

  if (envToken) {
    ui.info('Source: CLAUDE_CODE_OAUTH_TOKEN environment variable')
  }
  if (storedToken) {
    ui.info(
      envToken
        ? `Stored token also available (${maskToken(storedToken)})`
        : 'Source: ~/.yolobox/auth.json',
    )
  }
}
