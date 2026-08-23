/**
 * The connector sync contract.
 *
 * An adapter's only job is to turn a vendor's API into normalised records for a
 * time window. It does not decide when to run, how far back to go, what to do
 * about a 429, or how anything is written. Those are the same for every vendor
 * and live in `run.ts`, so a new connector is a translation problem rather than
 * a distributed-systems problem.
 *
 * Everything here is plain data with an injected `fetch`, which is what makes a
 * connector testable against recorded fixtures with no keys and no network.
 */

export type SyncWindow = {
  /** Inclusive. Records at exactly this instant are fetched. */
  start: Date
  /** Exclusive upper bound, so adjacent windows cannot double-count. */
  end: Date
}

/** A customer, as far as a payment processor or storefront knows one. */
export type NormalisedCustomer = {
  externalId: string
  email: string | null
  firstName: string | null
  lastName: string | null
}

export type NormalisedLineItem = {
  productExternalId: string | null
  variantExternalId: string | null
  sku: string | null
  name: string
  quantity: number
  /** Minor units, before discount. */
  grossMinor: number
  discountMinor: number
}

export type NormalisedOrder = {
  externalId: string
  orderNumber: string | null
  currency: string
  placedAt: Date
  shippingRevenueMinor: number
  taxMinor: number
  /** What the processor kept. Zero is a claim; null means "not known here". */
  paymentFeesMinor: number | null
  marketplaceFeesMinor: number | null
  isTest: boolean
  customer: NormalisedCustomer | null
  items: NormalisedLineItem[]
}

export type NormalisedRefund = {
  externalId: string
  /** The order this refunds, by the same external id space as the order. */
  orderExternalId: string
  amountMinor: number
  currency: string
  refundedAt: Date
}

export type SyncPage = {
  orders: NormalisedOrder[]
  refunds: NormalisedRefund[]
  /**
   * Opaque continuation token, or null when the vendor says there is no more.
   * Never interpreted by the runner — only handed back to the adapter.
   */
  cursor: string | null
}

/**
 * Why a sync stopped, in the terms the health model already speaks.
 *
 * The distinction that matters operationally is between "your key is wrong"
 * (nobody should retry; a human must act) and "the vendor is busy" (retry is
 * exactly right). Collapsing them into a generic failure is how connections end
 * up quietly dead for a week.
 */
export type SyncFailureKind =
  | 'auth'
  | 'rate_limited'
  | 'vendor_unavailable'
  | 'bad_response'
  | 'network'
  | 'misconfigured'

export class SyncError extends Error {
  constructor(
    message: string,
    readonly kind: SyncFailureKind,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'SyncError'
  }
}

export type AdapterContext = {
  /** Plaintext credentials, already opened from the vault by the caller. */
  credentials: Record<string, string>
  /** Non-secret connection settings, e.g. a Shopify shop domain. */
  settings: Record<string, unknown>
  window: SyncWindow
  /** Injected so adapters are testable against fixtures with no network. */
  fetch: typeof globalThis.fetch
  /** Injected for deterministic backoff in tests. */
  sleep: (ms: number) => Promise<void>
}

export type SyncAdapter = {
  provider: string
  /**
   * Fetches one page. Called repeatedly with the cursor it returned, until it
   * returns `cursor: null` or the runner's page budget is spent.
   */
  fetchPage(context: AdapterContext, cursor: string | null): Promise<SyncPage>
}

/** What the runner writes. Implemented against Supabase, faked in tests. */
export type SyncSink = {
  /**
   * Persists a page. Must be idempotent on `(organization_id, source,
   * external_id)`: windows deliberately overlap, so the same order arrives
   * more than once by design.
   */
  write(page: SyncPage): Promise<{ written: number }>
}

export type SyncOutcome = {
  status: 'succeeded' | 'partial' | 'failed'
  recordsRead: number
  recordsWritten: number
  window: SyncWindow
  /**
   * Set when the page budget ran out before the vendor did. The window stays
   * open: `nextWindowStart` is where the following run must resume, and it is
   * *not* the window end.
   */
  truncated: boolean
  nextWindowStart: Date
  error: string | null
  failureKind: SyncFailureKind | null
  /** What the connection's status column should become. */
  connectionStatus: 'connected' | 'degraded' | 'error' | 'revoked'
}
