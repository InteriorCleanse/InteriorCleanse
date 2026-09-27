import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const KINDS = new Set(['build-waitlist', 'private-call', 'general'])
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Small in-memory limiter: fine for one Vercel instance, resets on cold start.
const hits = new Map<string, { n: number; t: number }>()
function limited(ip: string) {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || now - h.t > 60_000) {
    hits.set(ip, { n: 1, t: now })
    return false
  }
  h.n += 1
  return h.n > 5
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (limited(ip)) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // Honeypot filled means a bot; answer as if accepted and store nothing.
  if (typeof body.company_url === 'string' && body.company_url.length > 0) {
    return NextResponse.json({ ok: true })
  }

  const kind = String(body.kind || '')
  const name = String(body.name || '').trim().slice(0, 120)
  const email = String(body.email || '').trim().slice(0, 200)
  const context = String(body.context || '').trim().slice(0, 200)
  const message = String(body.message || '').trim().slice(0, 2000)

  if (!KINDS.has(kind)) return NextResponse.json({ error: 'Unknown form.' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  if (!EMAIL.test(email)) return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })

  const key = process.env.BREVO_API_KEY
  if (!key) return NextResponse.json({ error: 'Form not configured.' }, { status: 503 })

  const listId = Number(process.env.BREVO_LIST_ID || 1)
  const res = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      email,
      updateEnabled: true,
      listIds: [listId],
      attributes: {
        FIRSTNAME: name,
        FH_KIND: kind,
        FH_CONTEXT: context,
        FH_MESSAGE: message,
        FH_DATE: new Date().toISOString().slice(0, 10),
      },
    }),
  })

  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '')
    console.error('[inquiry] brevo', res.status, text.slice(0, 200))
    return NextResponse.json({ error: 'Could not save the message.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
