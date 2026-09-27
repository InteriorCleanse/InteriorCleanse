import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const KINDS = new Set(['build-waitlist', 'private-call', 'general'])
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Best-effort limiter for one instance. Vercel's WAF rate limit is the real
// control in production; this stops the trivial case and prunes itself.
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
  return h.n > 5
}

const bad = (error: string, status: number) => NextResponse.json({ error }, { status })
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max)

export async function POST(req: Request) {
  if (!(req.headers.get('content-type') || '').startsWith('application/json')) return bad('Invalid request.', 415)
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return bad('Invalid request.', 403)

  const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (limited(ip)) return bad('Too many requests. Try again in a minute.', 429)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return bad('Invalid request.', 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('Invalid request.', 400)
  const b = body as Record<string, unknown>

  // Honeypot filled means a bot; answer as if accepted and store nothing.
  if (typeof b.company_url === 'string' && b.company_url.length > 0) return NextResponse.json({ ok: true })

  const kind = String(b.kind || '')
  const name = clean(b.name, 120)
  const email = clean(b.email, 254)
  const context = clean(b.context, 200)
  const message = clean(b.message, 2000)

  if (!KINDS.has(kind)) return bad('Unknown form.', 400)
  if (!name) return bad('Name is required.', 400)
  if (!EMAIL.test(email) || email.includes('..')) return bad('A valid email is required.', 400)

  const key = process.env.BREVO_API_KEY
  if (!key) return bad('Form not configured.', 503)
  const listId = Number(process.env.BREVO_LIST_ID || 1)
  const inbox = process.env.INQUIRY_TO || process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'hello@freeholdprivate.com'
  const sender = process.env.BREVO_SENDER || inbox
  const headers = { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' }
  const date = new Date().toISOString().slice(0, 10)

  // The message itself goes to the inbox as an email, so a person reads it.
  const mail = fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sender: { name: 'Freehold site', email: sender },
      to: [{ email: inbox }],
      replyTo: { email, name },
      subject: `[Freehold] ${kind} from ${name}`,
      textContent: `Kind: ${kind}\nName: ${name}\nEmail: ${email}\nContext: ${context || '(none)'}\nDate: ${date}\n\n${message || '(no message)'}\n`,
    }),
  })

  // The address joins the list once; an existing contact is never overwritten.
  const contact = fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, updateEnabled: false, listIds: [listId], attributes: { FIRSTNAME: name, FH_KIND: kind, FH_DATE: date } }),
  })

  try {
    const [m, c] = await Promise.allSettled([mail, contact])
    const mailOk = m.status === 'fulfilled' && (m.value.ok || m.value.status === 201)
    let contactOk = c.status === 'fulfilled' && (c.value.ok || c.value.status === 204)
    if (!contactOk && c.status === 'fulfilled') {
      const text = await c.value.text().catch(() => '')
      contactOk = c.value.status === 400 && /already exist/i.test(text)
      if (!contactOk) console.error('[inquiry] brevo contact', c.value.status, text.slice(0, 200))
    }
    if (!mailOk) {
      const text = m.status === 'fulfilled' ? await m.value.text().catch(() => '') : String(m.reason)
      console.error('[inquiry] brevo email', text.slice(0, 200))
    }
    if (mailOk || contactOk) return NextResponse.json({ ok: true })
    return bad('Could not save the message.', 502)
  } catch (e) {
    console.error('[inquiry] brevo unreachable', e instanceof Error ? e.message : e)
    return bad('Could not save the message.', 502)
  }
}
