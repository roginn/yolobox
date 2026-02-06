import { platform } from 'node:os'

export interface SSHForwardingArgs {
  volumeMount: string
  envVar: string
}

export function getSSHForwardingArgs(currentPlatform = platform()): SSHForwardingArgs | null {
  if (currentPlatform === 'darwin') {
    return {
      volumeMount: '/run/host-services/ssh-auth.sock:/run/host-services/ssh-auth.sock',
      envVar: '/run/host-services/ssh-auth.sock',
    }
  }

  const sock = process.env.SSH_AUTH_SOCK
  if (!sock) return null

  return {
    volumeMount: `${sock}:/ssh-agent`,
    envVar: '/ssh-agent',
  }
}
