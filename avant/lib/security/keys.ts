/**
 * Key material from the environment.
 *
 * In production a missing secret is a hard error at request time. In
 * development and in unconfigured demo deployments a per-process random key
 * is used instead and `isDemo()` reports it, so nothing silently pretends to
 * be secure: sessions reset on restart and the UI shows DEMO.
 */

import { decodeKey, randomBytes } from './crypto'

const ephemeral = new Map<string, Uint8Array>()

function fromEnv(name: string): Uint8Array | null {
  const raw = process.env[name]
  if (!raw) return null
  const key = decodeKey(raw)
  if (key.length < 32) throw new Error(`${name} must decode to at least 32 bytes`)
  return key.slice(0, 32)
}

function orEphemeral(name: string): Uint8Array {
  const key = fromEnv(name)
  if (key) return key
  if (process.env.AVANT_REQUIRE_SECRETS === '1') throw new Error(`${name} is required`)
  let k = ephemeral.get(name)
  if (!k) {
    k = randomBytes(32)
    ephemeral.set(name, k)
  }
  return k
}

export const sessionKey = () => orEphemeral('AVANT_SESSION_SECRET')

/** Current key first, then the previous one for rotation. */
export function encryptionKeys(): Uint8Array[] {
  const current = orEphemeral('AVANT_ENCRYPTION_KEY')
  const previous = fromEnv('AVANT_ENCRYPTION_KEY_PREVIOUS')
  return previous ? [current, previous] : [current]
}

export const vaultSigningKey = () => fromEnv('AVANT_VAULT_SIGNING_KEY')

export function isDemo(): boolean {
  return !process.env.AVANT_SESSION_SECRET || !process.env.AVANT_ENCRYPTION_KEY
}
