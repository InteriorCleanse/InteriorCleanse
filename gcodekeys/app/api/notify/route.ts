import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Drop waitlist. Preview build only validates and acknowledges; wire this to
// your email tool (Brevo, Resend, etc.) before launch. No data is stored here.
export async function POST(req: Request) {
  try {
    const { email, dropId } = (await req.json()) as { email?: string; dropId?: string }
    const ok = !!email && /.+@.+\..+/.test(email)
    if (!ok) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })
    // TODO(launch): persist { email, dropId } to the email provider.
    return NextResponse.json({ ok: true, preview: true, dropId: dropId ?? null })
  } catch {
    return NextResponse.json({ error: 'Could not sign you up.' }, { status: 400 })
  }
}
