import { SyncError, type SyncFailureKind } from './types'

/**
 * The HTTP behaviour every connector needs and none should reimplement.
 *
 * Vendor APIs fail in a small number of shapes and each one has a different
 * correct response. Getting this wrong is not a cosmetic problem: retrying a
 * 401 hammers a vendor with a key they have already rejected, and *not*
 * retrying a 429 turns a busy minute into a day of stale numbers.
 *
 *   401 / 403  the credential is wrong or revoked. Never retry. A human must act.
 *   429        back off. Honour `Retry-After` when the vendor sends one —
 *              it knows when the window resets and we are guessing.
 *   5xx        the vendor is having a bad time. Retry a few times, then stop.
 *   4xx other  our request is wrong. Retrying an identical bad request is
 *              pointless, so it fails immediately and loudly.
 *
 * No response body is ever put in an error message. Vendor errors quote the
 * offending request, and the offending request contains the API key.
 */

export type HttpOptions = {
  fetch: typeof globalThis.fetch
  sleep: (ms: number) => Promise<void>
  /** Total attempts including the first. */
  maxAttempts?: number
  /** Base for exponential backoff, doubled each attempt. */
  backoffMs?: number
  /** Abort a single attempt after this long. */
  timeoutMs?: number
}

const DEFAULT_MAX_ATTEMPTS = 4
const DEFAULT_BACKOFF_MS = 500
const DEFAULT_TIMEOUT_MS = 20_000

/** Cap on honouring `Retry-After`: past this we would rather fail the run. */
const MAX_RETRY_AFTER_MS = 60_000

export async function requestJson<T>(
  url: string,
  init: RequestInit,
  options: HttpOptions,
): Promise<{ body: T; headers: Headers }> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let lastError: SyncError | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response
    try {
      response = await withTimeout(options.fetch, url, init, timeoutMs)
    } catch (cause) {
      lastError = new SyncError(
        describeNetworkFailure(cause),
        'network',
        true,
      )
      if (attempt === maxAttempts) break
      await options.sleep(backoffMs * 2 ** (attempt - 1))
      continue
    }

    if (response.ok) {
      let body: T
      try {
        body = (await response.json()) as T
      } catch {
        // A 200 that is not JSON is usually a captive portal, a proxy error
        // page, or an API version that changed shape underneath us.
        throw new SyncError(
          'The response was not valid JSON. Something between us and the vendor may be rewriting it.',
          'bad_response',
          false,
        )
      }
      return { body, headers: response.headers }
    }

    const failure = classify(response.status)
    // Drain the body so the connection can be reused, and discard it: it is
    // the most likely place for a credential to be echoed back.
    await response.text().catch(() => '')

    if (!failure.retryable || attempt === maxAttempts) {
      throw new SyncError(failure.message, failure.kind, failure.retryable)
    }

    const retryAfter = parseRetryAfter(response.headers.get('retry-after'))
    await options.sleep(retryAfter ?? backoffMs * 2 ** (attempt - 1))
    lastError = new SyncError(failure.message, failure.kind, true)
  }

  throw (
    lastError ??
    new SyncError('The request failed for an unknown reason.', 'network', true)
  )
}

async function withTimeout(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function classify(status: number): {
  kind: SyncFailureKind
  retryable: boolean
  message: string
} {
  if (status === 401 || status === 403) {
    return {
      kind: 'auth',
      retryable: false,
      message:
        'The vendor rejected the stored credential. It has most likely been rotated or revoked — reconnect the integration.',
    }
  }
  if (status === 429) {
    return {
      kind: 'rate_limited',
      retryable: true,
      message: 'The vendor is rate limiting us. The next run will pick up where this one stopped.',
    }
  }
  if (status >= 500) {
    return {
      kind: 'vendor_unavailable',
      retryable: true,
      message: `The vendor returned ${status}. This is their side, not ours.`,
    }
  }
  return {
    kind: 'bad_response',
    retryable: false,
    message: `The vendor rejected the request with ${status}. Retrying an identical request will not help.`,
  }
}

/** Accepts both forms in RFC 9110: delay-seconds and an HTTP-date. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null

  const seconds = Number(header.trim())
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS)
  }

  const date = Date.parse(header)
  if (Number.isNaN(date)) return null
  return Math.min(Math.max(date - now, 0), MAX_RETRY_AFTER_MS)
}

function describeNetworkFailure(cause: unknown): string {
  if (cause instanceof Error && cause.name === 'AbortError') {
    return 'The vendor did not respond in time.'
  }
  // Deliberately not the raw message: DNS and TLS errors sometimes include the
  // full request URL, and for some vendors the key travels in the query string.
  return 'The vendor could not be reached.'
}
