import { defineCommand } from 'citty'
import { spawnSync } from 'node:child_process'

export default defineCommand({
  meta: {
    name: 'help',
    description: 'Show help information',
  },
  run: async () => {
    // Execute yolobox --help to show the same output
    const result = spawnSync(process.argv[0], [process.argv[1], '--help'], {
      stdio: 'inherit',
    })
    process.exit(result.status || 0)
  },
})
