/**
 * Guards every mutating API route runs before touching its body:
 * same-origin check (CSRF), JSON content type, body size cap, rate limit.
 * Returns a Response to send back, or null to continue.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { take, type Limit } from './rate-limit'

const MAX_BODY_BYTES = 32 * 1024

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') ?? 'unknown').trim()
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

/** Reads a JSON body with a hard size cap even when content-length lies. */
export async function readJson(req: NextRequest): Promise<unknown> {
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) throw new Error('too large')
  return JSON.parse(text)
}
