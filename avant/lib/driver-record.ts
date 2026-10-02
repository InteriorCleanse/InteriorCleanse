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
 * open-compute) or, when no vault is configured, in the app's database.
 * Neither place can read it without AVANT_ENCRYPTION_KEY.
 */

import { z } from 'zod'
import { open, seal } from './security/crypto'
import { encryptionKeys } from './security/keys'
import { recordKey } from './security/session'
import { db } from './server/db'
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

/** Sealed records live in the vault when configured, else in the database. */
async function getSealed(key: string): Promise<string | null> {
  if (vaultConfigured()) return vaultGet(key)
  const [row] = await (await db()).query<{ sealed: string }>(`select sealed from driver_records where key = $1`, [key])
  return row?.sealed ?? null
}

async function putSealed(key: string, sealed: string): Promise<void> {
  if (vaultConfigured()) return vaultPut(key, sealed)
  await (await db()).query(
    `insert into driver_records (key, sealed) values ($1, $2) on conflict (key) do update set sealed = excluded.sealed, updated_at = now()`,
    [key, sealed],
  )
}

async function deleteSealed(key: string): Promise<void> {
  if (vaultConfigured()) return vaultDelete(key)
  await (await db()).query(`delete from driver_records where key = $1`, [key])
}

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
  const sealed = await getSealed(key)
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
  await putSealed(key, sealed)
}

export async function deleteRecord(sessionId: string): Promise<void> {
  await deleteSealed(await recordKey(sessionId))
}

/**
 * Webhook path: the vault is addressed by record key, with no session in
 * hand. Returns null when nothing is stored, so a late event can never
 * recreate a record the driver has deleted.
 */
export async function loadByKey(key: string): Promise<DriverRecord | null> {
  const sealed = await getSealed(key)
  if (!sealed) return null
  const plain = await open(sealed, encryptionKeys(), key)
  if (!plain) return null
  const parsed = DriverRecordSchema.safeParse(JSON.parse(plain))
  return parsed.success ? parsed.data : null
}

export async function saveByKey(key: string, record: DriverRecord): Promise<void> {
  const valid = DriverRecordSchema.parse(record)
  await putSealed(key, await seal(JSON.stringify(valid), encryptionKeys()[0], key))
}
