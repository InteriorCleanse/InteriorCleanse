/**
 * .env loading, once, with Node's own loader. Values already in the shell win;
 * a missing or malformed file changes nothing. Never logs a value.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ENV_PATH = join(HERE, '..', '.env')

let loaded = false
export function loadEnv(): void {
  if (loaded) return
  loaded = true
  if (!existsSync(ENV_PATH)) return
  try { process.loadEnvFile(ENV_PATH) } catch { /* reported by the doctor */ }
}

export function env(name: string): string {
  loadEnv()
  return (process.env[name] ?? '').trim()
}

export function flag(name: string): boolean {
  return env(name) === '1'
}
