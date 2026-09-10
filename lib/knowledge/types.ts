/**
 * The knowledge and CRM connector contracts.
 *
 * Same shape of split as the commerce sync: an adapter turns one vendor's API
 * into normalised records for a window and knows nothing about retries,
 * cursors persisted between runs, or how anything is written. What differs is
 * the records. A note is text with a title and a place to open it; a deal is
 * money that has not happened yet. Neither is an order, and neither is ever
 * summed with one.
 */

export type KnowledgeDocument = {
  externalId: string
  title: string
  /** Markdown. The runner bounds it; the adapter does not need to. */
  content: string
  url: string | null
  sourceUpdatedAt: Date | null
}

export type CrmContact = {
  externalId: string
  email: string | null
  firstName: string | null
  lastName: string | null
  company: string | null
  sourceUpdatedAt: Date | null
}

export type CrmDeal = {
  externalId: string
  name: string
  /** The vendor's own stage label, verbatim. */
  stage: string
  outcome: 'open' | 'won' | 'lost'
  amountMinor: number | null
  currency: string | null
  /** 0–100 as the vendor reports it, or null. Never invented. */
  probability: number | null
  expectedCloseOn: string | null
  ownerName: string | null
  /** The vendor's id for the contact this deal belongs to, if any. */
  contactExternalId: string | null
  sourceUpdatedAt: Date | null
}

export type KnowledgePage = {
  documents: KnowledgeDocument[]
  /** Opaque continuation, or null when the vendor says there is no more. */
  cursor: string | null
}

export type CrmPage = {
  contacts: CrmContact[]
  deals: CrmDeal[]
  cursor: string | null
}

export type SourceContext = {
  credentials: Record<string, string>
  settings: Record<string, unknown>
  /**
   * Only records changed at or after this instant. Null on the first run, in
   * which case the adapter decides its own bounded backfill.
   */
  since: Date | null
  fetch: typeof globalThis.fetch
  sleep: (ms: number) => Promise<void>
}

export type KnowledgeAdapter = {
  provider: string
  kind: 'knowledge'
  fetchPage(context: SourceContext, cursor: string | null): Promise<KnowledgePage>
}

export type CrmAdapter = {
  provider: string
  kind: 'crm'
  fetchPage(context: SourceContext, cursor: string | null): Promise<CrmPage>
}

export type SourceAdapter = KnowledgeAdapter | CrmAdapter
