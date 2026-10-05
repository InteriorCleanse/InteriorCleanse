/**
 * Clickwrap evidence. Each time someone accepts a document (terms at
 * sign-up, trip terms at booking, the host agreement at listing), one row
 * records the exact version, when, and for which trip or listing.
 */

import { LEGAL_VERSIONS, type LegalDocument } from '../legal.ts'
import { randomId } from '../security/crypto.ts'
import { db, type Db } from './db.ts'

export async function recordConsent(
  userId: string,
  documents: LegalDocument[],
  context: 'signup' | 'booking' | 'listing' | 'update',
  subjectId: string | null = null,
  q?: Db,
): Promise<void> {
  const d = q ?? (await db())
  for (const doc of documents) {
    await d.query(`insert into consents (id, user_id, document, version, context, subject_id) values ($1, $2, $3, $4, $5, $6)`, [
      randomId(12),
      userId,
      doc,
      LEGAL_VERSIONS[doc],
      context,
      subjectId,
    ])
  }
}

export interface ConsentRecord {
  document: LegalDocument
  version: string
  context: string
  subjectId: string | null
  acceptedAt: string
}

export async function consentsFor(userId: string): Promise<ConsentRecord[]> {
  const rows = await (await db()).query<{ document: LegalDocument; version: string; context: string; subject_id: string | null; accepted_at: string | Date }>(
    `select document, version, context, subject_id, accepted_at from consents where user_id = $1 order by accepted_at desc`,
    [userId],
  )
  return rows.map((r) => ({ document: r.document, version: r.version, context: r.context, subjectId: r.subject_id, acceptedAt: new Date(r.accepted_at).toISOString() }))
}

/** Account-wide documents (terms, privacy) whose current version this person hasn't accepted yet. */
export async function outdatedConsents(userId: string): Promise<('terms' | 'privacy')[]> {
  const rows = await (await db()).query<{ document: 'terms' | 'privacy'; version: string }>(
    `select document, max(version) as version from consents where user_id = $1 and document in ('terms', 'privacy') group by document`,
    [userId],
  )
  return (['terms', 'privacy'] as const).filter((doc) => {
    const accepted = rows.find((r) => r.document === doc)?.version
    // Accounts from before consent records existed are asked too.
    return !accepted || accepted < LEGAL_VERSIONS[doc]
  })
}
