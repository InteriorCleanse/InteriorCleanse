import { NextResponse, type NextRequest } from 'next/server'
import { sharedLimit } from '@/lib/server/limits'
import { readUnsubscribeToken, unsubscribe } from '@/lib/server/prefs'
import { clientIp } from '@/lib/security/request'

export const runtime = 'nodejs'

/** The link in an email body opens a confirmation page; nothing changes on a GET (mail scanners follow links). */
export function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t') ?? ''
  return NextResponse.redirect(new URL(`/unsubscribe?t=${encodeURIComponent(t)}`, req.nextUrl.origin), 303)
}

/**
 * Turns the emails off. Accepts the mail provider's one-click POST
 * (RFC 8058: form body "List-Unsubscribe=One-Click", token in the URL),
 * which comes from the provider's servers without an Origin, and the
 * confirmation page's POST. The signed token is the authority, so no
 * session or origin check applies; requests are rate-limited by address.
 */
export async function POST(req: NextRequest) {
  const limited = await sharedLimit({ capacity: 30, refillPerSec: 30 / 600 }, `unsubscribe:${clientIp(req)}`)
  if (limited) return limited
  let token = req.nextUrl.searchParams.get('t') ?? ''
  if (!token && (req.headers.get('content-type') ?? '').includes('application/json')) {
    token = String(((await req.json().catch(() => ({}))) as { t?: unknown }).t ?? '')
  }
  const parsed = await readUnsubscribeToken(token)
  if (!parsed) return NextResponse.json({ error: 'That link isn’t valid. Change email settings from your Profile.' }, { status: 400 })
  await unsubscribe(parsed.userId, parsed.category)
  return NextResponse.json({ ok: true, category: parsed.category }, { headers: { 'cache-control': 'no-store' } })
}
