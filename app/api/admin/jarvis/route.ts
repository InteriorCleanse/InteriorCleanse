import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { env, configured, errorBody } from '@/lib/env'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'
import { getAnalytics, getOrders, getRevenueForPeriod, type RevenuePeriod } from '@/lib/admin-data'
import { checkIntegrations, summarise } from '@/lib/jarvis-integrations'
import { sendAiEmail } from '@/lib/ai-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * JARVIS — the conversational layer over the business data.
 *
 * Lives under /api/admin so middleware.ts gates it, and re-verifies the session
 * itself so the dashboard is never the only guard (the same belt-and-braces
 * pattern the other admin routes use). Every tool reads through lib/admin-data,
 * so what JARVIS says out loud and what /admin renders come from one query.
 */

/** Override with JARVIS_MODEL to trade capability for cost without a code change. */
const MODEL = process.env.JARVIS_MODEL || 'claude-opus-5'

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_revenue',
    description:
      'Total revenue, order count and average order value over a period. Call this whenever the owner asks how sales are, how the business is doing, or about money over a time window.',
    input_schema: {
      type: 'object',
      properties: { period: { type: 'string', enum: ['today', 'week', 'month', 'all'] } },
      required: ['period'],
    },
  },
  {
    name: 'get_recent_orders',
    description:
      'Recent paid orders with customer, amount, products and Printful fulfilment status. Call this when the owner asks who bought, what shipped, or wants to see individual orders.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'How many to return. Default 10, max 100.' } },
    },
  },
  {
    name: 'get_subscriber_count',
    description:
      'Email list size and where subscribers came from. Call this when the owner asks about the mailing list, subscribers, or audience.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_top_products',
    description:
      'Best selling products by units sold over the last 8 weeks. Call this when the owner asks what is selling or what to make more of.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'send_email_to_customer',
    description:
      'Generate a lifecycle email with Claude and send it through Brevo. This sends a real email to a real person — only call it when the owner has clearly asked for it to be sent, not when they are just discussing the idea.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Recipient email address.' },
        firstName: { type: 'string', description: 'Recipient first name, if known.' },
        trigger: {
          type: 'string',
          enum: ['welcome', 'post-purchase', 'abandoned-cart', 'review-request', 'win-back', 'cross-sell'],
          description: 'Which lifecycle email to write.',
        },
        products: { type: 'array', items: { type: 'string' }, description: 'Products to reference.' },
        orderTotal: { type: 'number', description: 'Order total, for post-purchase.' },
      },
      required: ['email', 'trigger'],
    },
  },
  {
    name: 'write_tiktok_script',
    description:
      'Write a faceless TikTok script for a product, with hook, tension, reveal, proof and CTA. Call this when the owner asks for a script, a video idea, or content for TikTok.',
    input_schema: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'The product the script is about.' },
        painPoint: { type: 'string', description: 'Optional customer pain point to lead with.' },
      },
      required: ['product'],
    },
  },
  {
    name: 'check_integrations',
    description:
      'Check which integrations are connected and whether their keys actually work against the live provider. Call this when the owner asks what is connected, what is broken, or what still needs setting up.',
    input_schema: { type: 'object', properties: {} },
  },
]

const JARVIS_SYSTEM = `You are JARVIS, the AI business assistant for InteriorCleanse
— a home lifestyle brand selling candles, home organizing books, curated cleaning
products, Christian books, digital guides, and merch.

Brand slogan: "For mind, home, body and spirit"
Website: interiorcleanse.com
TikTok: @interiorcleanse

YOUR PERSONALITY:
- Calm, competent, slightly dry wit — like Jarvis from Iron Man
- Address the owner directly and warmly
- Never over-explain. Give the answer, then offer next steps.
- Proactive: if you notice something worth acting on, say so

WHAT YOU CAN DO:
- Report revenue, orders, subscribers, top products
- Draft and send lifecycle email to a customer
- Write TikTok scripts on demand
- Check which integrations are connected
- Advise on business decisions using the real data

HOW TO ANSWER:
You are being spoken to by voice, and your reply is read aloud. Keep the spoken
reply to three sentences or fewer unless the owner asks for detail. Lead with the
answer. The interface renders the full tool data as cards underneath you, so
summarise rather than reading out lists or tables.

Speak numbers the way a person would — "four hundred and twenty dollars across
six orders", not "$420.00 / 6".

Never invent revenue, orders, or subscriber figures. If a tool reports that an
integration is not configured, say plainly which one and that the setup steps are
on the connections page. A quiet number is usually a real zero: this shop is early,
so report zero without apologising for it.

Sending email is the one irreversible thing you do. Confirm the recipient and the
purpose before calling send_email_to_customer unless the owner has already been
explicit.

End with a suggested next action when there is a useful one — not on every reply.`

const TIKTOK_SYSTEM = `Write faceless TikTok scripts for InteriorCleanse.
Format: HOOK (0-3s, pain point), TENSION (3-10s, why it persists),
REVEAL (10-22s, the product as answer), PROOF (22-27s, one concrete detail),
CTA (27-30s, soft).
Include 3 hook variations and 3 caption options.
Voice: calm, expert, never hype.`

type ToolOutput = Record<string, unknown> | unknown[]

async function executeTool(name: string, input: Record<string, unknown>): Promise<ToolOutput> {
  switch (name) {
    case 'get_revenue':
      return getRevenueForPeriod((input.period as RevenuePeriod) ?? 'today')

    case 'get_recent_orders': {
      const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 100)
      const { orders, configured: ok } = await getOrders()
      if (!ok) return { configured: false, message: 'Stripe is not configured, so there are no orders to read.' }
      return orders.slice(0, limit).map((o) => ({
        customer: o.customer,
        email: o.email,
        amount: o.amount,
        date: o.date.slice(0, 10),
        products: o.products.join(', ') || 'Order',
        fulfillment: o.fulfillment,
      }))
    }

    case 'get_subscriber_count': {
      if (!configured.brevo()) {
        return { configured: false, message: 'Brevo is not configured, so the list size is unknown.' }
      }
      const { listSize, trafficSources } = await getAnalytics()
      return { totalSubscribers: listSize, sources: trafficSources }
    }

    case 'get_top_products': {
      const { topProducts } = await getAnalytics()
      return topProducts.map((p) => ({ product: p.name, unitsSold: p.units }))
    }

    case 'send_email_to_customer': {
      const generated = await sendAiEmail({
        to: String(input.email),
        firstName: String(input.firstName || 'there'),
        trigger: input.trigger as Parameters<typeof sendAiEmail>[0]['trigger'],
        products: Array.isArray(input.products) ? (input.products as string[]) : undefined,
        orderTotal: typeof input.orderTotal === 'number' ? input.orderTotal : undefined,
      })
      return { sent: true, to: input.email, subject: generated.subject, preview: generated.previewText }
    }

    case 'write_tiktok_script': {
      const script = await new Anthropic({ apiKey: env.anthropicKey() }).messages.create({
        model: MODEL,
        max_tokens: 4000,
        system: TIKTOK_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Product: ${input.product}${input.painPoint ? `\nPain point angle: ${input.painPoint}` : ''}`,
          },
        ],
      })
      return {
        product: input.product,
        script: script.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim(),
      }
    }

    case 'check_integrations':
      return summarise(await checkIntegrations({ deep: true }))

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

/**
 * Tool failures come back to Claude as tool_result errors rather than throwing,
 * so it explains "Stripe isn't connected" instead of the turn dying — and never
 * substitutes a plausible number for one it could not fetch.
 */
async function runTool(name: string, input: Record<string, unknown>) {
  try {
    return { ok: true as const, result: await executeTool(name, input) }
  } catch (e) {
    console.error(`[jarvis:${name}]`, e)
    return { ok: false as const, result: errorBody(e) }
  }
}

type IncomingMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(req: Request) {
  // Middleware already gated this route; re-checking keeps the guarantee local
  // to the handler, matching the other admin routes.
  const cookie = req.headers.get('cookie') ?? ''
  const token = cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ADMIN_COOKIE}=`))
    ?.slice(ADMIN_COOKIE.length + 1)

  if (!(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!configured.anthropic()) {
    return NextResponse.json(
      {
        reply:
          'My connection to Claude is not configured yet. Add ANTHROPIC_API_KEY in Vercel and redeploy — the steps are on the connections page.',
        toolResults: [],
        error: 'ANTHROPIC_API_KEY is not configured.',
      },
      { status: 503 },
    )
  }

  let incoming: IncomingMessage[]
  try {
    const body = (await req.json()) as { messages?: IncomingMessage[] }
    incoming = Array.isArray(body.messages) ? body.messages : []
  } catch {
    return NextResponse.json({ error: 'Body must be JSON with a "messages" array.' }, { status: 400 })
  }

  if (incoming.length === 0) {
    return NextResponse.json({ error: 'No messages supplied.' }, { status: 400 })
  }

  const anthropic = new Anthropic({ apiKey: env.anthropicKey() })
  const conversation: Anthropic.MessageParam[] = incoming.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const toolResults: Array<{ tool: string; ok: boolean; result: ToolOutput }> = []
  let reply = ''

  try {
    for (let turn = 0; turn < 5; turn++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: JARVIS_SYSTEM,
        tools: TOOLS,
        messages: conversation,
      })

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
      if (text) reply = text

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      )
      if (toolUses.length === 0) break

      conversation.push({ role: 'assistant', content: response.content })

      const results = await Promise.all(
        toolUses.map(async (use) => {
          const { ok, result } = await runTool(use.name, (use.input ?? {}) as Record<string, unknown>)
          toolResults.push({ tool: use.name, ok, result })
          return {
            type: 'tool_result' as const,
            tool_use_id: use.id,
            content: JSON.stringify(result),
            is_error: !ok,
          }
        }),
      )

      conversation.push({ role: 'user', content: results })
    }
  } catch (e) {
    console.error('[jarvis]', e)
    return NextResponse.json(
      { ...errorBody(e), reply: 'Something went wrong reaching Claude. The error is on screen.', toolResults },
      { status: 502 },
    )
  }

  return NextResponse.json({ reply, toolResults })
}
