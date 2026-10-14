// Transactional email via Resend's REST API (no SDK dependency). No-ops with a
// log when RESEND_API_KEY is unset, so preview and dev never fail on email.
//
// Set in Vercel:
//   RESEND_API_KEY      from resend.com
//   EMAIL_FROM          a verified sender, e.g. "GCode Keys <hello@gcodekeys.com>"
//   OPERATOR_EMAIL      where new-order + payment alerts go (dispatch inbox)

const KEY = process.env.RESEND_API_KEY
const FROM = process.env.EMAIL_FROM || 'GCode Keys <onboarding@resend.dev>'
export const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL || ''

export function emailEnabled(): boolean {
  return !!KEY
}

type SendArgs = { to: string | string[]; subject: string; html: string; replyTo?: string }

export async function sendEmail({ to, subject, html, replyTo }: SendArgs): Promise<boolean> {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (!recipients.length) return false
  if (!KEY) {
    console.log(`[email:noop] to=${recipients.join(',')} subject="${subject}" (set RESEND_API_KEY to send)`)
    return false
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: recipients, subject, html, reply_to: replyTo }),
      cache: 'no-store',
    })
    if (!r.ok) {
      console.error(`[email] send failed: ${r.status} ${await r.text().catch(() => '')}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[email] send error', err)
    return false
  }
}

// Minimal on-brand wrapper so emails look like the site, not a default template.
export function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#020604;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#eafff4">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px">
      <div style="font-weight:700;letter-spacing:.04em;font-size:20px;color:#15e37a">GCODE <span style="color:#eafff4">KEYS</span></div>
      <div style="height:1px;background:rgba(21,227,122,.25);margin:16px 0 24px"></div>
      <h1 style="font-size:20px;margin:0 0 12px;color:#eafff4">${title}</h1>
      <div style="font-size:14px;line-height:1.6;color:#d7fff0">${body}</div>
      <div style="height:1px;background:rgba(21,227,122,.18);margin:28px 0 14px"></div>
      <div style="font-size:11px;color:#6f8c7f">GCode Keys · the code that cuts · keys are programmed at the vehicle after proof of ownership.</div>
    </div></body></html>`
}
