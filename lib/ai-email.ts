import Anthropic from '@anthropic-ai/sdk'
import { env } from './env'
import { sendTransactionalEmail } from './brevo'

/**
 * Claude-authored lifecycle email.
 *
 * Exported as a plain function so the Stripe webhook can call it directly.
 * The webhook used to HTTP-POST its own /api/send-ai-email endpoint, which
 * depends on NEXT_PUBLIC_SITE_URL being correct, pays a second cold start
 * inside Stripe's delivery timeout, and fails silently in preview deploys.
 */

export type EmailTrigger =
  | 'welcome'
  | 'post-purchase'
  | 'abandoned-cart'
  | 'review-request'
  | 'win-back'
  | 'cross-sell'

export type GeneratedEmail = {
  subject: string
  previewText: string
  body: string
  ctaText: string
  ctaUrl: string
}

const SYSTEM_PROMPT = `You are the founder of InteriorCleanse, a luxury home lifestyle brand selling home organizing books, hand-poured candles, curated cleaning products, Christian books, and considered merchandise.

Brand slogan: "For mind, home, body and spirit."

Your voice:
- Warm, genuine, personal — like a note from a real person
- Sophisticated but never pretentious
- Never salesy, never uses exclamation marks excessively
- References the customer's specific situation
- 3 short paragraphs maximum
- Sign off: "— The InteriorCleanse Team"

Write emails a real person would actually want to read. Never use phrases like "Don't miss out!", "Act now!", "Limited time offer!" or any generic marketing language.

Write the body as plain text with a blank line between paragraphs.`

/**
 * Structured outputs rather than parsing JSON out of prose — it removes the
 * fenced-code stripping and the JSON.parse that throws on a stray character.
 */
const EMAIL_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    previewText: { type: 'string' },
    body: { type: 'string' },
    ctaText: { type: 'string' },
    ctaUrl: { type: 'string' },
  },
  required: ['subject', 'previewText', 'body', 'ctaText', 'ctaUrl'],
  additionalProperties: false,
} as const

function triggerContext(params: {
  trigger: EmailTrigger
  firstName: string
  products?: string[]
  orderTotal?: number
}): string {
  const { firstName, products = [], orderTotal } = params
  const list = products.join(', ')
  const site = env.siteUrl()

  const contexts: Record<EmailTrigger, string> = {
    welcome: `${firstName} just joined the InteriorCleanse email list from TikTok. Welcome them warmly and offer the free Room Reset Checklist download. Link the CTA to ${site}/library/.`,
    'post-purchase': `${firstName} just purchased: ${list} for $${orderTotal}. Thank them genuinely and set expectations that made-to-order items ship in 2-5 business days. Link the CTA to ${site}/journal/.`,
    'abandoned-cart': `${firstName} added ${list} to their cart but did not complete checkout. Gently remind them without being pushy. Link the CTA to ${site}/shop/.`,
    'review-request': `${firstName} received their order of ${list} about a week ago. Ask genuinely how they are enjoying it and invite a review. Link the CTA to ${site}/contact/.`,
    'win-back': `${firstName} has not opened an email in 30 days. Write a short warm re-engagement note. Do not be desperate. Link the CTA to ${site}/shop/.`,
    'cross-sell': `${firstName} bought ${list}. Suggest one complementary product that genuinely pairs well. Link the CTA to ${site}/shop/.`,
  }

  return contexts[params.trigger] ?? contexts.welcome
}

export async function generateEmail(params: {
  trigger: EmailTrigger
  firstName: string
  products?: string[]
  orderTotal?: number
}): Promise<GeneratedEmail> {
  const anthropic = new Anthropic({ apiKey: env.anthropicKey() })

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    // Thinking off and effort low: this runs inside Stripe's webhook delivery
    // timeout, and a three-paragraph email does not need deliberation.
    thinking: { type: 'disabled' },
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: EMAIL_SCHEMA },
    },
    messages: [{ role: 'user', content: triggerContext(params) }],
  })

  const block = message.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') {
    throw new Error('Claude returned no text content for the email.')
  }

  return JSON.parse(block.text) as GeneratedEmail
}

export function renderEmailHTML(email: GeneratedEmail): string {
  const paragraphs = email.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 20px;font-size:15px;line-height:1.75;color:#3D3B37;">${escapeHtml(p)}</p>`
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(email.previewText)}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#FFFFFF;border:1px solid #E4DFD6;">
        <tr><td style="padding:40px 40px 24px;text-align:center;border-bottom:1px solid #E4DFD6;">
          <p style="margin:0;font-family:Georgia,serif;font-size:15px;letter-spacing:0.18em;color:#1C1A17;">
            INTERIOR<span style="color:#A9895A;">&#9670;</span>CLEANSE
          </p>
          <p style="margin:8px 0 0;font-size:9px;letter-spacing:0.24em;text-transform:uppercase;color:#A9895A;">
            For mind, home, body &amp; spirit
          </p>
        </td></tr>
        <tr><td style="padding:40px;">
          ${paragraphs}
          <table cellpadding="0" cellspacing="0" style="margin:32px 0 0;">
            <tr><td style="background:#A9895A;">
              <a href="${escapeHtml(email.ctaUrl)}" style="display:inline-block;padding:14px 32px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#1C1A17;text-decoration:none;font-weight:600;">
                ${escapeHtml(email.ctaText)}
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #E4DFD6;text-align:center;">
          <p style="margin:0;font-size:11px;color:#8C8479;line-height:1.6;">
            InteriorCleanse &middot; interiorcleanse.com<br>
            <a href="{{unsubscribe}}" style="color:#8C8479;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/** Model output is interpolated into HTML, so it must be escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Generates and sends in one step — the path both the API route and webhook use. */
export async function sendAiEmail(params: {
  to: string
  firstName: string
  trigger: EmailTrigger
  products?: string[]
  orderTotal?: number
}): Promise<GeneratedEmail> {
  const email = await generateEmail(params)
  await sendTransactionalEmail({
    to: params.to,
    name: params.firstName,
    subject: email.subject,
    htmlContent: renderEmailHTML(email),
  })
  return email
}
