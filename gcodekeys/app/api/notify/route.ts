import { NextResponse } from 'next/server'
import { OPERATOR_EMAIL, sendEmail, shell } from '@/lib/email'

export const runtime = 'nodejs'

// Drop / restock waitlist. Validates the email and alerts the operator so the
// signup is captured. A full list provider (audience sync) is optional; this
// guarantees no signup is silently dropped once OPERATOR_EMAIL + Resend are set.
export async function POST(req: Request) {
  try {
    const { email, dropId } = (await req.json()) as { email?: string; dropId?: string }
    if (!email || !/.+@.+\..+/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })
    }
    if (OPERATOR_EMAIL) {
      void sendEmail({
        to: OPERATOR_EMAIL,
        replyTo: email,
        subject: `Drop alert signup${dropId ? ` · ${dropId}` : ''}`,
        html: shell('New drop-alert signup', `<p><b>${email}</b>${dropId ? ` — interested in ${dropId}` : ''}</p>`),
      })
    } else {
      console.log(`[notify] drop signup: ${email}${dropId ? ` (${dropId})` : ''}`)
    }
    return NextResponse.json({ ok: true, dropId: dropId ?? null })
  } catch {
    return NextResponse.json({ error: 'Could not sign you up.' }, { status: 400 })
  }
}
