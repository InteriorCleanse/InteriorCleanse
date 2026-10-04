/**
 * Email through Resend (https://resend.com) when RESEND_API_KEY and
 * AVANT_EMAIL_FROM are set; otherwise nothing is sent and the app works
 * the same, in-app only.
 *
 * Notifications are an outbox: each row is emailed once (emailed_at), so a
 * crash between "saved" and "sent" means a late email, never a lost one or
 * a duplicate send from a retried request.
 */

import { db } from './db.ts'
import { siteUrl } from './stripe.ts'

export const emailConfigured = (): boolean => Boolean(process.env.RESEND_API_KEY && process.env.AVANT_EMAIL_FROM)

export async function sendEmail(msg: { to: string; subject: string; text: string; idempotencyKey?: string }): Promise<boolean> {
  if (!emailConfigured()) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
        ...(msg.idempotencyKey ? { 'idempotency-key': msg.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: process.env.AVANT_EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) console.error(`email: Resend ${res.status}`)
    return res.ok
  } catch {
    console.error('email: send failed')
    return false
  }
}

const FOOTER = `\n\n—\nAVANT · Cars worth remembering, from people who care for them.\nYou’re receiving this because you have an AVANT account.`

/** Emails notifications not yet sent (from the last day only). */
export async function deliverNotificationEmails(limit = 25): Promise<number> {
  if (!emailConfigured()) return 0
  const d = await db()
  const rows = await d.query<{ id: string; title: string; body: string; href: string; email: string; name: string }>(
    `select n.id, n.title, n.body, n.href, u.email, u.name from notifications n join users u on u.id = n.user_id
     where n.emailed_at is null and n.created_at > now() - interval '1 day' and u.deleted_at is null
     order by n.created_at limit $1`,
    [limit],
  )
  let sent = 0
  for (const n of rows) {
    // Claim the row first, so two runners never both send it.
    const claimed = await d.query(`update notifications set emailed_at = now() where id = $1 and emailed_at is null returning id`, [n.id])
    if (!claimed.length) continue
    const ok = await sendEmail({
      to: n.email,
      subject: n.title,
      text: `Hi ${n.name.split(/\s+/)[0]},\n\n${n.body}\n\n${siteUrl()}${n.href}${FOOTER}`,
      idempotencyKey: `notification-${n.id}`,
    })
    if (ok) sent += 1
    else await d.query(`update notifications set emailed_at = null where id = $1`, [n.id])
  }
  return sent
}

export function resetEmail(name: string, link: string): { subject: string; text: string } {
  return {
    subject: 'Reset your AVANT password',
    text: `Hi ${name.split(/\s+/)[0]},\n\nSomeone (hopefully you) asked to reset the password on your AVANT account. This link works once, for the next hour:\n\n${link}\n\nIf it wasn’t you, ignore this email; your password stays as it is.${FOOTER}`,
  }
}

export function verifyEmailMessage(name: string, link: string): { subject: string; text: string } {
  return {
    subject: 'Confirm your email for AVANT',
    text: `Hi ${name.split(/\s+/)[0]},\n\nWelcome to AVANT. Confirm this is your email address to finish creating your account. The link works once, for the next 24 hours:\n\n${link}\n\nIf you didn’t sign up, ignore this email and no account will be activated.${FOOTER}`,
  }
}

/** Sent instead of a second account when someone signs up with an address that already has one. */
export function existingAccountMessage(name: string, site: string): { subject: string; text: string } {
  return {
    subject: 'You already have an AVANT account',
    text: `Hi ${name.split(/\s+/)[0]},\n\nSomeone (hopefully you) tried to create an AVANT account with this email, but you already have one. Sign in at ${site}/signin, or reset your password at ${site}/forgot.\n\nIf this wasn’t you, you can ignore this email; nothing has changed.${FOOTER}`,
  }
}
