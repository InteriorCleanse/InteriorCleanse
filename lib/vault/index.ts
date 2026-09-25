import { VaultError, type KeyEncryptionKeyProvider } from './types'
import { assertNotPlaceholder, parseKeyMaterial, staticKeyProvider } from './providers'

export * from './types'
export { sealSecret, openSecret, rewrapSecret, maskSecret } from './envelope'
export { staticKeyProvider, kmsProvider, parseKeyMaterial } from './providers'

/**
 * Resolves the configured key provider.
 *
 * Cached per process because parsing is pure and the alternative is re-reading
 * key material on every request. Never called in the browser — `sealSecret` and
 * `openSecret` are server-only by construction, and this throws if that is ever
 * violated so the failure is loud rather than a silently shipped key.
 */
let cached: KeyEncryptionKeyProvider | null = null

export function vaultProvider(): KeyEncryptionKeyProvider {
  if (typeof window !== 'undefined') {
    throw new VaultError('The vault was reached from the browser. This is a bug.', 'not_configured')
  }
  if (cached) return cached

  const raw = process.env.VAULT_MASTER_KEY
  if (!raw) {
    throw new VaultError(
      'VAULT_MASTER_KEY is not set, so credentials cannot be stored. Generate one with: npm run keygen',
      'not_configured',
    )
  }

  const currentKeyId = process.env.VAULT_MASTER_KEY_ID?.trim() || 'k1'
  const keys = new Map<string, Buffer>()

  const current = parseKeyMaterial(raw, 'VAULT_MASTER_KEY')
  assertNotPlaceholder(current)
  keys.set(currentKeyId, current)

  // Retired keys stay readable until every secret has been rewrapped. Removing
  // one before that is what turns a rotation into data loss.
  for (const entry of (process.env.VAULT_PREVIOUS_KEYS ?? '').split(',')) {
    const [id, material] = entry.split(':')
    if (!id?.trim() || !material?.trim()) continue
    keys.set(id.trim(), parseKeyMaterial(material, `VAULT_PREVIOUS_KEYS[${id.trim()}]`))
  }

  cached = staticKeyProvider({ currentKeyId, keys })
  return cached
}

/** True when credentials can be stored at all — lets surfaces say so honestly. */
export function isVaultConfigured(): boolean {
  return Boolean(process.env.VAULT_MASTER_KEY)
}

/** Test seam: forget the cached provider after changing the environment. */
export function resetVaultProvider(): void {
  cached = null
}
