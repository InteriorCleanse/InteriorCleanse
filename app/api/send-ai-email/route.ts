import { NextResponse } from 'next/server'
import { errorBody } from '@/lib/env'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import {
  generateEmail,
  renderEmailHTML,
  sendAiEmail,
  type EmailTrigger,
  type GeneratedEmail,
} from '@/lib/ai-email'
import { sendTransactionalEmail } from '@/lib/brevo'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

const TRIGGERS: EmailTrigger[] = [
  'welcome',
  'post-purchase',
  'abandoned-cart',
  'review-request',
  'win-back',
  'cross-sell',
]

/**
 * Admin-only: generating costs Claude tokens and sending puts mail in a
 * stranger's inbox from the brand's domain, so this endpoint is gated even
 * though /api/send-ai-email sits outside the /api/admin middleware matcher.
 *
 * `preview: true` generates without sending, which is what the composer's
 * "Generate with Claude" button uses.
 */
export async function POST(req: Request) {
  try {
    const authed = await verifySessionToken(cookies().get(ADMIN_COOKIE)?.value)
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as {
      to?: string
      firstName?: string
      trigger?: EmailTrigger
      products?: string[]
      orderTotal?: number
      preview?: boolean
      /**
       * An edited email to send verbatim. When present, Claude is not called
       * again — otherwise the composer's edits would be silently discarded and
       * the recipient would get freshly generated copy nobody reviewed.
       */
      email?: Partial<GeneratedEmail>
    }

    const trigger = body.trigger ?? 'welcome'
    if (!TRIGGERS.includes(trigger)) {
      return NextResponse.json({ error: `Unknown trigger: ${trigger}` }, { status: 400 })
    }

    const firstName = body.firstName || 'there'

    if (body.preview) {
      const email = await generateEmail({
        trigger,
        firstName,
        products: body.products,
        orderTotal: body.orderTotal,
      })
      return NextResponse.json({ sent: false, email, html: renderEmailHTML(email) })
    }

    if (!body.to) {
      return NextResponse.json({ error: 'A recipient is required.' }, { status: 400 })
    }

    // Send the reviewed copy exactly as approved.
    if (body.email?.subject && body.email?.body) {
      const edited: GeneratedEmail = {
        subject: body.email.subject,
        previewText: body.email.previewText ?? '',
        body: body.email.body,
        ctaText: body.email.ctaText || 'Visit InteriorCleanse',
        ctaUrl: body.email.ctaUrl || `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/shop/`,
      }

      await sendTransactionalEmail({
        to: body.to,
        name: firstName,
        subject: edited.subject,
        htmlContent: renderEmailHTML(edited),
      })

      return NextResponse.json({ sent: true, email: edited, edited: true })
    }

    const email = await sendAiEmail({
      to: body.to,
      firstName,
      trigger,
      products: body.products,
      orderTotal: body.orderTotal,
    })

    return NextResponse.json({ sent: true, email })
  } catch (e) {
    console.error('[send-ai-email]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
