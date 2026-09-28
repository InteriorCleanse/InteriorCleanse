/**
 * Guards every mutating API route runs before touching its body:
 * same-origin check (CSRF), JSON content type, body size cap, rate limit.
 * Returns a Response to send back, or null to continue.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { pickClientIp } from './client-ip'
import { take, type Limit } from './rate-limit'

const MAX_BODY_BYTES = 32 * 1024

export function clientIp(req: NextRequest): string {
  return pickClientIp(req.headers)
}

export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  if (!origin) return site === 'same-origin' || site === 'none' || site === null
  try {
    return new URL(origin).host === req.headers.get('host')
  } catch {
    return false
  }
}

export function problem(status: number, message: string, extra?: HeadersInit): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: extra })
}

export async function guard(
  req: NextRequest,
  opts: { limit: Limit; limitKey: string; requireJson?: boolean },
): Promise<NextResponse | null> {
  if (!sameOrigin(req)) return problem(403, 'Cross-site request refused.')
  if (opts.requireJson !== false && req.method !== 'GET' && req.method !== 'DELETE') {
    const type = req.headers.get('content-type') ?? ''
    if (!type.startsWith('application/json')) return problem(415, 'Send JSON.')
    const length = Number(req.headers.get('content-length') ?? '0')
    if (length > MAX_BODY_BYTES) return problem(413, 'Request too large.')
  }
  const result = take(`${opts.limitKey}:${clientIp(req)}`, opts.limit)
  if (!result.ok) return problem(429, 'Too many requests. Try again shortly.', { 'Retry-After': String(result.retryAfterSec) })
  return null
}

/**
 * Reads the body as text, counting bytes as they arrive and stopping at the
 * cap, so a missing or lying content-length cannot make us buffer more.
 */
export async function readCapped(req: NextRequest, maxBytes = MAX_BODY_BYTES): Promise<string> {
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error('too large')
    }
    chunks.push(value)
  }
  const all = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(all)
}

/** Reads a JSON body with a hard size cap even when content-length lies. */
export async function readJson(req: NextRequest): Promise<unknown> {
  return JSON.parse(await readCapped(req))
}
