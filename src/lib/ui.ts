import * as p from '@clack/prompts'
import pc from 'picocolors'

export function intro() {
  p.intro(pc.bgCyan(pc.black(` yolobox v${__VERSION__} `)))
}

export function success(message: string) {
  p.log.success(message)
}

export function error(message: string) {
  p.log.error(pc.red(message))
}

export function warn(message: string) {
  p.log.warn(pc.yellow(message))
}

export function info(message: string) {
  p.log.info(message)
}

export function outro(message: string) {
  p.outro(message)
}

export { p as prompts, pc as colors }
