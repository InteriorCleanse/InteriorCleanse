import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { askConcierge } from '@/lib/ai/concierge'
import { offlineConcierge } from '@/lib/ai/offline'
import { getCar } from '@/lib/data'
import { sessionKey } from '@/lib/security/keys'
import { LIMITS, take } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'
import { requireSession } from '@/lib/security/session'
import { signTurn, trustedHistory } from '@/lib/security/turns'
import { toCardData } from '@/lib/card-data'

export const runtime = 'nodejs'

const Body = z.object({
  messages: z
    .array(
      z
        .object({
          role: z.enum(['user', 'assistant']),
          content: z.string().trim().min(1).max(2000),
          sig: z.string().max(64).optional(),
        })
        .strict(),
    )
    .min(1)
    .max(16)
    .refine((m) => m[m.length - 1].role === 'user', 'Last message must be from the user'),
})

/** Model calls per server instance per UTC day; a backstop, not a budget. */
const DAILY_CAP = Number(process.env.AVANT_AI_DAILY_CAP ?? '2000')
let day = ''
let used = 0

function underDailyCap(): boolean {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== day) {
    day = today
    used = 0
  }
  if (used >= DAILY_CAP) return false
  used += 1
  return true
}

export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.concierge, limitKey: 'concierge' })
  if (blocked) return blocked

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await readJson(req))
  } catch {
    return problem(400, 'Invalid conversation.')
  }

  const sid = await requireSession()
  const quota = take(`concierge-session:${sid}`, LIMITS.conciergeSession)
  if (!quota.ok) return problem(429, 'Too many questions today. The Help pages and your trip page have the answers too.', { 'Retry-After': String(quota.retryAfterSec) })

  // Only replies this server signed for this session count as the concierge's words.
  const history = await trustedHistory(body.messages, sid, sessionKey())
  if (!history.length) return problem(400, 'Invalid conversation.')
  const last = history[history.length - 1].content
  let reply = process.env.ANTHROPIC_API_KEY && underDailyCap() ? null : offlineConcierge(last)

  if (!reply) {
    try {
      reply = await askConcierge(history)
    } catch (err) {
      // Never leak provider errors; degrade to the rules-based answer.
      if (err instanceof Anthropic.RateLimitError) console.warn('concierge: rate limited upstream')
      else if (err instanceof Anthropic.APIError) console.error(`concierge: API ${err.status}`)
      else console.error('concierge: unexpected error')
      reply = offlineConcierge(last)
    }
  }

  const cars = reply.carSlugs.map(getCar).filter((c): c is NonNullable<typeof c> => Boolean(c)).map(toCardData)
  return NextResponse.json({ text: reply.text, cars, mode: reply.mode, sig: await signTurn(sid, reply.text.trim(), sessionKey()) })
}
