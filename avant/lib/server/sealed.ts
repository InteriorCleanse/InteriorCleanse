/**
 * Field-level encryption for the most sensitive free text: messages,
 * delivery addresses and pickup instructions (which can hold lockbox codes).
 * AES-256-GCM via lib/security/crypto.ts, with the row as associated data,
 * so a sealed value copied onto another row will not open. A database dump,
 * backup or replica on its own reveals none of it.
 *
 * Values written before encryption existed (no "v1." prefix) are read as is.
 */

import { open, seal } from '../security/crypto.ts'
import { encryptionKeys } from '../security/keys.ts'

export async function sealText(plain: string, context: string): Promise<string> {
  return plain ? seal(plain, encryptionKeys()[0], context) : ''
}

export async function openText(value: string | null | undefined, context: string): Promise<string> {
  if (!value) return ''
  if (!value.startsWith('v1.')) return value
  return (await open(value, encryptionKeys(), context)) ?? ''
}
