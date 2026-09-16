/**
 * Signing for the exchange's SIGNED (read-only, in this phase) endpoints.
 * Binance signs the exact query string with HMAC-SHA256 of the API secret and
 * sends the hex digest as the `signature` parameter, with the API key in the
 * `X-MBX-APIKEY` header. This module does only that — it builds and signs query
 * strings; it never sends anything.
 */

import { createHmac } from 'node:crypto'

/** HMAC-SHA256 of `query` with `secret`, hex-encoded — exactly what Binance expects. */
export function sign(query: string, secret: string): string {
  return createHmac('sha256', secret).update(query).digest('hex')
}

/** Stable query string from params, in insertion order (the order also used to sign). */
export function toQuery(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
}

/**
 * Build a signed query: the caller's params plus `timestamp` (venue clock =
 * local + offset) and `recvWindow`, with the `signature` appended last.
 */
export function signedQuery(params: Record<string, string | number>, secret: string, opts: { timestamp: number; recvWindow?: number }): string {
  const withTime = { ...params, recvWindow: opts.recvWindow ?? 5000, timestamp: opts.timestamp }
  const query = toQuery(withTime)
  return `${query}&signature=${sign(query, secret)}`
}
