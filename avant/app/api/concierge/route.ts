import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { askConcierge, type ChatTurn } from '@/lib/ai/concierge'
import { offlineConcierge } from '@/lib/ai/offline'
import { getCar } from '@/lib/data'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'
import { toCardData } from '@/lib/card-data'

export const runtime = 'nodejs'

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(16)
    .refine((m) => m[m.length - 1].role === 'user', 'Last message must be from the user')
    .refine((m) => m[0].role === 'user', 'First message must be from the user'),
})

export async function POST(req: NextRequest) {
  const blocked = await guard(req, { limit: LIMITS.concierge, limitKey: 'concierge' })
  if (blocked) return blocked

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await readJson(req))
  } catch {
    return problem(400, 'Invalid conversation.')
  }

  const history = body.messages as ChatTurn[]
  const last = history[history.length - 1].content
  let reply = process.env.ANTHROPIC_API_KEY ? null : offlineConcierge(last)

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
  return NextResponse.json({ text: reply.text, cars, mode: reply.mode })
}
