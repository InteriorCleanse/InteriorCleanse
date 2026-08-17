import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import {
  VaultError,
  type KeyEncryptionKeyProvider,
  type SealedSecret,
  type SecretContext,
} from './types'

/**
 * Envelope encryption.
 *
 * One random 256-bit data key per secret, used once, wrapped by the master key
 * and stored beside the ciphertext. AES-256-GCM throughout, so tampering is
 * detected rather than producing plausible garbage.
 *
 * The additional authenticated data is the load-bearing detail: it binds the
 * ciphertext to one organization, one credential row, and one field. Move the
 * bytes anywhere else and the tag check fails. Without it, a database write
 * that swapped two rows would quietly hand one tenant another's key.
 */

const ALGORITHM = 'aes-256-gcm'
const DATA_KEY_BYTES = 32
const IV_BYTES = 12

/** The AAD string. Order is fixed; the separator cannot appear in a UUID. */
function aad(context: SecretContext): Buffer {
  return Buffer.from(
    `v1|${context.organizationId}|${context.credentialId}|${context.field}`,
    'utf8',
  )
}

export async function sealSecret(
  plaintext: string,
  context: SecretContext,
  kek: KeyEncryptionKeyProvider,
): Promise<SealedSecret> {
  if (plaintext.length === 0) {
    throw new VaultError('Refusing to seal an empty secret.', 'bad_key')
  }

  const dataKey = randomBytes(DATA_KEY_BYTES)
  const iv = randomBytes(IV_BYTES)

  const cipher = createCipheriv(ALGORITHM, dataKey, iv)
  cipher.setAAD(aad(context))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  const wrappedKey = await kek.wrap(dataKey)
  // The plaintext data key is not needed again. Zeroing it does not make the
  // process memory-safe, but it shortens the window in which a core dump has it.
  dataKey.fill(0)

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    wrappedKey,
    version: 1,
  }
}

export async function openSecret(
  sealed: SealedSecret,
  context: SecretContext,
  kek: KeyEncryptionKeyProvider,
): Promise<string> {
  if (sealed.version !== 1) {
    throw new VaultError(`Unknown sealed-secret version ${sealed.version}.`, 'unknown_key_version')
  }

  const dataKey = await kek.unwrap(sealed.wrappedKey)

  try {
    const decipher = createDecipheriv(ALGORITHM, dataKey, Buffer.from(sealed.iv, 'base64'))
    decipher.setAAD(aad(context))
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
      decipher.final(),
    ])
    return plaintext.toString('utf8')
  } catch {
    // GCM cannot distinguish "someone edited the ciphertext" from "this row was
    // moved to another tenant" — both are authentication failures, and both
    // mean the same thing operationally: do not use this value.
    throw new VaultError(
      'This credential could not be opened. It has been altered, or it does not belong to this workspace.',
      'tampered',
    )
  } finally {
    dataKey.fill(0)
  }
}

/**
 * Rewraps a secret under the KEK's current key without ever exposing the
 * plaintext credential. This is what makes master-key rotation cheap: the
 * ciphertext is untouched, only the small wrapped data key changes.
 */
export async function rewrapSecret(
  sealed: SealedSecret,
  kek: KeyEncryptionKeyProvider,
): Promise<SealedSecret> {
  if (sealed.wrappedKey.keyId === kek.currentKeyId) return sealed

  const dataKey = await kek.unwrap(sealed.wrappedKey)
  try {
    const wrappedKey = await kek.wrap(dataKey)
    return { ...sealed, wrappedKey }
  } finally {
    dataKey.fill(0)
  }
}

/**
 * The masked form shown after saving — the only representation of a credential
 * that ever goes back to a browser.
 *
 * Shows the vendor prefix and the last four characters, which is enough for a
 * person to tell two keys apart, and no help at all to anyone else. Short
 * secrets are masked entirely rather than leaking a meaningful fraction.
 */
export function maskSecret(plaintext: string): string {
  const trimmed = plaintext.trim()
  if (trimmed.length < 8) return '••••••••'

  const prefixMatch = /^([a-z]{2,6}(?:_[a-z]{2,6})?_)/i.exec(trimmed)
  const prefix = prefixMatch?.[1] ?? ''
  const last4 = trimmed.slice(-4)
  return `${prefix}••••${last4}`
}
