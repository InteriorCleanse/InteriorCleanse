/** The one place the version number comes from: package.json. */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export const VERSION: string = (() => {
  try {
    return (JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')) as { version?: string }).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
})()
