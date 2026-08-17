import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'
import { VaultError, type KeyEncryptionKeyProvider, type WrappedKey } from './types'

/**
 * Key-encryption-key providers.
 *
 * Two exist deliberately, and the difference between them is stated rather than
 * implied. A launch that ships on the static provider should know it did.
 */

const WRAP_ALGORITHM = 'aes-256-gcm'

/**
 * A master key held in an environment variable.
 *
 * Honest about what it is: fine for local development and a single-tenant
 * self-host, and **not** production-grade for a multi-tenant service. The key
 * sits in process memory and in whatever stores the environment; there is no
 * hardware boundary, no per-unwrap audit trail, and no way to revoke it without
 * a deploy. `productionReady` is false, and the launch checklist reads it.
 *
 * Supports more than one key so rotation works here too: `VAULT_MASTER_KEY` is
 * the current key, and `VAULT_PREVIOUS_KEYS` holds retired ones (id:hex, comma
 * separated) that must still open old data until everything is rewrapped.
 */
export function staticKeyProvider(options: {
  currentKeyId: string
  keys: Map<string, Buffer>
}): KeyEncryptionKeyProvider {
  const current = options.keys.get(options.currentKeyId)
  if (!current) {
    throw new VaultError('The current vault key id is not among the configured keys.', 'bad_key')
  }

  return {
    currentKeyId: options.currentKeyId,
    label: 'Static key from environment',
    productionReady: false,

    async wrap(dataKey) {
      const iv = randomBytes(12)
      const cipher = createCipheriv(WRAP_ALGORITHM, current, iv)
      const wrapped = Buffer.concat([cipher.update(dataKey), cipher.final()])
      const tag = cipher.getAuthTag()
      return {
        keyId: options.currentKeyId,
        material: Buffer.concat([iv, tag, wrapped]).toString('base64'),
      }
    },

    async unwrap(wrapped: WrappedKey) {
      const key = options.keys.get(wrapped.keyId)
      if (!key) {
        // A retired key that was removed before its data was rewrapped. Say
        // exactly that, because the fix is to restore the key, not to re-enter
        // the credential.
        throw new VaultError(
          `This credential was sealed with key "${wrapped.keyId}", which is not configured. Restore that key or reconnect the integration.`,
          'unknown_key_version',
        )
      }

      const raw = Buffer.from(wrapped.material, 'base64')
      const iv = raw.subarray(0, 12)
      const tag = raw.subarray(12, 28)
      const body = raw.subarray(28)

      try {
        const decipher = createDecipheriv(WRAP_ALGORITHM, key, iv)
        decipher.setAuthTag(tag)
        return Buffer.concat([decipher.update(body), decipher.final()])
      } catch {
        throw new VaultError('The wrapped data key failed authentication.', 'tampered')
      }
    },
  }
}

/**
 * Adapter shape for a real KMS (AWS KMS, GCP KMS, Vault Transit).
 *
 * Deliberately just an adapter over two calls, because that is genuinely all a
 * KMS is from here: the key material never arrives, the service wraps and
 * unwraps on our behalf, and every unwrap is logged on their side. Wiring a
 * specific vendor is a deployment decision, so this takes the two functions
 * rather than importing an SDK the self-host build would then have to carry.
 */
export function kmsProvider(options: {
  keyId: string
  label: string
  encrypt: (plaintext: Buffer) => Promise<Buffer>
  decrypt: (ciphertext: Buffer, keyId: string) => Promise<Buffer>
}): KeyEncryptionKeyProvider {
  return {
    currentKeyId: options.keyId,
    label: options.label,
    productionReady: true,
    async wrap(dataKey) {
      const material = await options.encrypt(dataKey)
      return { keyId: options.keyId, material: material.toString('base64') }
    },
    async unwrap(wrapped) {
      return options.decrypt(Buffer.from(wrapped.material, 'base64'), wrapped.keyId)
    },
  }
}

/** Parses a hex key, refusing anything that is not exactly 256 bits. */
export function parseKeyMaterial(hex: string, name: string): Buffer {
  const cleaned = hex.trim()
  if (!/^[0-9a-f]{64}$/i.test(cleaned)) {
    throw new VaultError(
      `${name} must be 64 hex characters (256 bits). Generate one with: npm run keygen`,
      'bad_key',
    )
  }
  return Buffer.from(cleaned, 'hex')
}

/**
 * Refuses a key that is obviously a placeholder. Copying the example value out
 * of `.env.example` into production is a real thing people do, and a vault
 * whose master key is public is not a vault.
 */
export function assertNotPlaceholder(key: Buffer): void {
  const placeholders = [Buffer.alloc(32, 0), Buffer.alloc(32, 0xff)]
  for (const bad of placeholders) {
    if (key.length === bad.length && timingSafeEqual(key, bad)) {
      throw new VaultError('The vault master key is a placeholder value.', 'bad_key')
    }
  }
}
