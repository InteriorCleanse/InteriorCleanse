import { NextResponse } from 'next/server'
import { OPERATOR_EMAIL, sendEmail, shell } from '@/lib/email'
import { FLAGSHIP } from '@/lib/guides'

export const runtime = 'nodejs'

const KV_URL = process.env.KV_REST_API_URL
const KV_TOKEN = process.env.KV_REST_API_TOKEN

async function kvAppend(email: string, source: string) {
  if (!KV_URL || !KV_TOKEN) {
    console.log(`[subscribe] ${email} (${source}) — set KV + Resend to persist`)
    return
  }
  const entry = JSON.stringify({ email, source, at: new Date().toISOString() })
  await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['LPUSH', 'subscribers', entry]),
    cache: 'no-store',
  }).catch((e) => console.error('[subscribe] kv error', e))
}

// Email capture. Stores the subscriber, emails them the free guide link, and
// pings the operator. The list lives in Vercel KV under "subscribers".
export async function POST(req: Request) {
  let email = ''
  let source = 'site'
  try {
    const body = (await req.json()) as { email?: string; source?: string }
    email = (body.email ?? '').trim()
    source = (body.source ?? 'site').slice(0, 40)
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }
  if (!/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })
  }

  await kvAppend(email, source)

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/+$/, '')
  const guideUrl = `${origin}/garage/${FLAGSHIP.slug}/`

  // Send the subscriber their guide.
  void sendEmail({
    to: email,
    subject: `Your free guide: ${FLAGSHIP.title}`,
    html: shell(
      FLAGSHIP.title,
      `<p>Thanks for joining the GCode Keys garage. Here’s your guide:</p>
       <p><a href="${guideUrl}" style="color:#1fcf86">Read ${FLAGSHIP.title} →</a></p>
       <p>${FLAGSHIP.dek}</p>
       <p>We’ll send the occasional, genuinely useful note on keys and ownership — never spam.</p>`,
    ),
  })
  // Notify the operator.
  if (OPERATOR_EMAIL) {
    void sendEmail({
      to: OPERATOR_EMAIL,
      replyTo: email,
      subject: `New subscriber · ${email}`,
      html: shell('New subscriber', `<p><b>${email}</b> joined via ${source}.</p>`),
    })
  }

  return NextResponse.json({ ok: true })
}
