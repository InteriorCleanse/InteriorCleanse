/**
 * The only personal data AVANT keeps about a driver, and how it is stored.
 *
 * Kept: age in whole years, years licensed, licence expiry month, issuing
 * state, whether the driving record is clean, how and when this was verified.
 * Never kept: name, date of birth, licence number, address, document images,
 * selfies. Those stay with the verification provider, and AVANT asks the
 * provider to redact them as soon as the check is done.
 *
 * Storage: the record is sealed (AES-256-GCM) inside the app, with the
 * record key as associated data, before it goes anywhere. It then lives
 * either in the vault service (services/vault, on Cloudflare or self-hosted
 * open-compute) or, when no vault is configured, in an httpOnly cookie.
 * Neither place can read it without AVANT_ENCRYPTION_KEY.
 */

import { cookies } from 'next/headers'
import { z } from 'zod'
import { open, seal } from './security/crypto'
import { encryptionKeys } from './security/keys'
import { recordKey } from './security/session'
import { vaultDelete, vaultGet, vaultPut, vaultConfigured } from './vault-client'
import type { DriverFacts } from './types'

export const DriverRecordSchema = z
  .object({
    v: z.literal(1),
    age: z.number().int().min(0).max(120).nullable(),
    licenceYears: z.number().int().min(0).max(90).nullable(),
    licenceExpires: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
    licenceState: z.string().regex(/^[A-Z]{2}$/).nullable(),
    cleanRecord: z.boolean(),
    verified: z.boolean(),
    method: z.enum(['stripe_identity', 'demo']).nullable(),
    verifiedAt: z.string().nullable(),
    /** Provider session id, kept for audit and redaction, not identity. */
    providerRef: z.string().max(80).nullable(),
    pendingProviderRef: z.string().max(80).nullable(),
    attestedLicenceYears: z.number().int().min(0).max(90).nullable(),
  })
  .strict()

export type DriverRecord = z.infer<typeof DriverRecordSchema>

export const EMPTY_RECORD: DriverRecord = {
  v: 1,
  age: null,
  licenceYears: null,
  licenceExpires: null,
  licenceState: null,
  cleanRecord: false,
  verified: false,
  method: null,
  verifiedAt: null,
  providerRef: null,
  pendingProviderRef: null,
  attestedLicenceYears: null,
}

const COOKIE = 'avant_dr'

export function toFacts(r: DriverRecord): DriverFacts {
  return {
    age: r.age,
    licenceYears: r.licenceYears,
    licenceExpires: r.licenceExpires,
    licenceState: r.licenceState,
    cleanRecord: r.cleanRecord,
    verified: r.verified,
  }
}

export async function loadRecord(sessionId: string): Promise<DriverRecord> {
  const key = await recordKey(sessionId)
  const sealed = vaultConfigured() ? await vaultGet(key) : (await cookies()).get(COOKIE)?.value ?? null
  if (!sealed) return EMPTY_RECORD
  const plain = await open(sealed, encryptionKeys(), key)
  if (!plain) return EMPTY_RECORD
  const parsed = DriverRecordSchema.safeParse(JSON.parse(plain))
  return parsed.success ? parsed.data : EMPTY_RECORD
}

export async function saveRecord(sessionId: string, record: DriverRecord): Promise<void> {
  const valid = DriverRecordSchema.parse(record)
  const key = await recordKey(sessionId)
  const sealed = await seal(JSON.stringify(valid), encryptionKeys()[0], key)
  if (vaultConfigured()) {
    await vaultPut(key, sealed)
  } else {
    ;(await cookies()).set(COOKIE, sealed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
}

export async function deleteRecord(sessionId: string): Promise<void> {
  const key = await recordKey(sessionId)
  if (vaultConfigured()) await vaultDelete(key)
  ;(await cookies()).delete(COOKIE)
}

/**
 * Webhook path: the vault is addressed by record key, with no session in
 * hand. Returns null when nothing is stored, so a late event can never
 * recreate a record the driver has deleted.
 */
export async function loadByKey(key: string): Promise<DriverRecord | null> {
  if (!vaultConfigured()) return null
  const sealed = await vaultGet(key)
  if (!sealed) return null
  const plain = await open(sealed, encryptionKeys(), key)
  if (!plain) return null
  const parsed = DriverRecordSchema.safeParse(JSON.parse(plain))
  return parsed.success ? parsed.data : null
}

export async function saveByKey(key: string, record: DriverRecord): Promise<void> {
  if (!vaultConfigured()) throw new Error('saveByKey needs the vault')
  const valid = DriverRecordSchema.parse(record)
  await vaultPut(key, await seal(JSON.stringify(valid), encryptionKeys()[0], key))
}
