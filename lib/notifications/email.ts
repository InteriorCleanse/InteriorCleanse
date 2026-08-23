/**
 * Email transport.
 *
 * Deliberately the thinnest possible layer over one HTTP API, with no SDK and
 * no SMTP client. Three properties matter more than features here:
 *
 * **It is honest when unconfigured.** `configured: false` is a value the rest
 * of the system reads and reports, not an exception thrown at send time. A
 * deployment without an email provider must still evaluate rules, record
 * notifications, and show them in the app — it simply says nothing was emailed
 * and why.
 *
 * **It never throws.** A send is one part of a loop over many recipients. An
 * exception on the third person must not stop the fourth, and it must not lose
 * the delivery record that says what happened to the third.
 *
 * **It reports refusals separately from failures.** A bounced address and a
 * provider outage are different problems with different owners, and lumping
 * them into "failed" means nobody chases either.
 */

export type EmailMessage = {
  to: string
  subject: string
  text: string
  html: string
}

export type SendResult =
  | { sent: true; providerId: string | null }
  | { sent: false; retryable: boolean; detail: string }

export type EmailTransport = {
  name: string
  /** False means no provider is set up; callers must say so rather than pretend. */
  configured: boolean
  send(message: EmailMessage): Promise<SendResult>
}

/** Used when nothing is configured. Refuses, with a reason a human can act on. */
export function unconfiguredTransport(): EmailTransport {
  return {
    name: 'none',
    configured: false,
    async send() {
      return {
        sent: false,
        retryable: false,
        detail: 'No email provider is configured on this deployment (RESEND_API_KEY is unset).',
      }
    },
  }
}

/**
 * Resend, over its HTTP API.
 *
 * Chosen because it is one authenticated POST with no SDK, which keeps the
 * dependency surface of the thing that sends mail to zero. Swapping providers
 * means writing another 30-line function against this interface.
 */
export function resendTransport(options: {
  apiKey: string
  from: string
  fetch?: typeof globalThis.fetch
}): EmailTransport {
  const fetchImpl = options.fetch ?? globalThis.fetch

  return {
    name: 'resend',
    configured: true,
    async send(message) {
      let response: Response
      try {
        response = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: options.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
        })
      } catch {
        // Not the recipient's fault and not permanent. Worth retrying.
        return { sent: false, retryable: true, detail: 'The email provider could not be reached.' }
      }

      if (response.ok) {
        const body = (await response.json().catch(() => ({}))) as { id?: string }
        return { sent: true, providerId: body.id ?? null }
      }

      // The body is discarded rather than logged: provider errors echo the
      // request, and the request contains the recipient's address.
      await response.text().catch(() => '')

      if (response.status === 401 || response.status === 403) {
        return {
          sent: false,
          retryable: false,
          detail: 'The email provider rejected our API key.',
        }
      }
      if (response.status === 422 || response.status === 400) {
        return {
          sent: false,
          retryable: false,
          detail: 'The provider rejected the message — most likely an invalid recipient address.',
        }
      }
      return {
        sent: false,
        retryable: true,
        detail: `The email provider returned ${response.status}.`,
      }
    },
  }
}

/** Records what would have been sent. For local development and tests. */
export function captureTransport(): EmailTransport & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = []
  return {
    name: 'capture',
    configured: true,
    sent,
    async send(message) {
      sent.push(message)
      return { sent: true, providerId: null }
    },
  }
}

export function emailTransport(fetchImpl?: typeof globalThis.fetch): EmailTransport {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.EMAIL_FROM?.trim()
  if (!apiKey || !from) return unconfiguredTransport()
  return resendTransport({ apiKey, from, fetch: fetchImpl })
}

// ── Rendering ────────────────────────────────────────────────────────────────

/**
 * Renders a notification as text and HTML.
 *
 * The plain-text part is written first and is not an afterthought: it is what
 * a screen reader, a text-only client and every spam filter actually read. The
 * HTML carries no images, no tracking pixel and no external stylesheet — an
 * alert email that needs the network to be legible is not an alert.
 *
 * The evidence line is the point of the whole message. "Refund rate is high" is
 * an anxiety; "Refund rate 8.2% against a 5% threshold, yesterday" is something
 * a person can act on without opening anything.
 */
export type NotificationEmail = {
  title: string
  body: string
  /** "Refund rate 8.2% against a 5.0% threshold" — already formatted. */
  evidence: string | null
  period: string
  workspace: string
  isDemo: boolean
  /** Absolute URL back into the app. */
  link: string
  /** Absolute URL to the notification settings, for the required opt-out. */
  preferencesUrl: string
}

export function renderNotificationEmail(input: NotificationEmail): { text: string; html: string } {
  const demoNotice = input.isDemo
    ? 'This workspace is running on demonstration data. These figures are not real.'
    : null

  const lines = [
    input.title,
    '',
    input.body,
    ...(input.evidence ? ['', input.evidence] : []),
    '',
    `Period: ${input.period}`,
    ...(demoNotice ? ['', demoNotice] : []),
    '',
    `Open it: ${input.link}`,
    '',
    '—',
    `${input.workspace}`,
    `Change what you are emailed about: ${input.preferencesUrl}`,
  ]

  return { text: lines.join('\n'), html: html(input, demoNotice) }
}

function html(input: NotificationEmail, demoNotice: string | null): string {
  // Inline styles and a table-free layout: every email client disagrees about
  // everything else, and a stylesheet is stripped by most of them.
  return [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">`,
    demoNotice
      ? `<p style="margin:0 0 16px;padding:8px 12px;background:#fef3c7;border-radius:6px;font-size:13px;color:#78350f">${escapeHtml(demoNotice)}</p>`
      : '',
    `<h1 style="margin:0 0 12px;font-size:18px;font-weight:600">${escapeHtml(input.title)}</h1>`,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${escapeHtml(input.body)}</p>`,
    input.evidence
      ? `<p style="margin:0 0 12px;padding:12px;background:#f4f4f5;border-radius:6px;font-size:14px;font-variant-numeric:tabular-nums">${escapeHtml(input.evidence)}</p>`
      : '',
    `<p style="margin:0 0 20px;font-size:13px;color:#71717a">Period: ${escapeHtml(input.period)}</p>`,
    `<p style="margin:0 0 24px"><a href="${escapeAttr(input.link)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-size:14px">Open ${escapeHtml(input.workspace)}</a></p>`,
    `<hr style="border:none;border-top:1px solid #e4e4e7;margin:0 0 12px">`,
    `<p style="margin:0;font-size:12px;color:#71717a">${escapeHtml(input.workspace)} · <a href="${escapeAttr(input.preferencesUrl)}" style="color:#71717a">Change what you are emailed about</a></p>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join('')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Escapes a URL for an attribute, and refuses anything that is not http(s).
 *
 * A notification body can contain text derived from tenant data. A `javascript:`
 * or `data:` URL reaching an href is a stored-XSS delivery mechanism in every
 * webmail client that renders HTML.
 */
function escapeAttr(value: string): string {
  const safe = /^https?:\/\//i.test(value) ? value : '#'
  return escapeHtml(safe)
}
