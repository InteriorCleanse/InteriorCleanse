import { NextResponse } from 'next/server'
import { env, configured, errorBody } from '@/lib/env'
import { upsertContact } from '@/lib/brevo'
import { sendAiEmail } from '@/lib/ai-email'

export const runtime = 'nodejs'

/**
 * Public endpoint, so it is rate limited: every call that reaches the welcome
 * email spends Claude tokens and a Brevo send, and an unthrottled endpoint is
 * a bill anyone can run up.
 *
 * This counter lives in module scope, which on serverless means per-instance
 * and reset on cold start — enough to blunt a naive script, not a real
 * distributed limiter. Put Vercel WAF or an Upstash counter in front before
 * running paid traffic (noted in VERCEL_ENV_SETUP.md).
 */
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 5
const hits = new Map<string, { count: number; resetAt: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = hits.get(ip)

  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > MAX_PER_WINDOW
}

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      'unknown'

    if (rateLimited(ip)) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }

    const { email, source } = (await req.json()) as { email?: string; source?: string }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
    }

    if (!configured.brevo()) {
      // No list configured yet — accept the address rather than showing the
      // visitor an error for something only the owner can fix.
      console.warn('[subscribe] BREVO_API_KEY not set; address discarded')
      return NextResponse.json({ subscribed: true, stored: false })
    }

    await upsertContact({
      email,
      attributes: {
        SOURCE: source || 'website',
        SIGNUP_DATE: new Date().toISOString(),
      },
      listIds: [env.brevoSubscriberList()],
    })

    if (configured.anthropic()) {
      try {
        await sendAiEmail({ to: email, firstName: 'there', trigger: 'welcome' })
      } catch (e) {
        // The subscription itself succeeded; a failed welcome note must not
        // read to the visitor as a failed signup.
        console.error('[subscribe] welcome email', e)
      }
    }

    return NextResponse.json({ subscribed: true, stored: true })
  } catch (e) {
    console.error('[subscribe]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
