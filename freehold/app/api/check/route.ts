import { NextResponse } from 'next/server'
import { normaliseDomain } from '@/lib/check-rules'
import { runCheck } from '@/lib/check'

export const runtime = 'nodejs'
export const maxDuration = 30

// Best-effort limiter per instance; the check only reads public DNS.
const hits = new Map<string, { n: number; t: number }>()
function limited(ip: string) {
  const now = Date.now()
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t > 60_000) hits.delete(k)
  const h = hits.get(ip)
  if (!h || now - h.t > 60_000) {
    hits.set(ip, { n: 1, t: now })
    return false
  }
  h.n += 1
  return h.n > 12
}

export async function GET(req: Request) {
  const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (limited(ip)) return NextResponse.json({ error: 'Too many checks from this connection. Try again in a minute.' }, { status: 429 })
  const domain = normaliseDomain(new URL(req.url).searchParams.get('d') || '')
  if (!domain) return NextResponse.json({ error: 'Enter a domain such as example.com.' }, { status: 400 })
  try {
    const result = await runCheck(domain)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } })
  } catch (e) {
    console.error('[check]', domain, e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'The check could not finish. Try again in a minute.' }, { status: 502 })
  }
}
