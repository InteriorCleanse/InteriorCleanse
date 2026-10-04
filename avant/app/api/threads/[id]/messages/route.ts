import { after as afterResponse, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { deliverNotificationEmails } from '@/lib/server/email'
import { MAX_MESSAGE, messagesIn, sendMessage, threadOpen } from '@/lib/server/inbox'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const user = await currentUser()
  if (!user) return signInRequired()
  const after = req.nextUrl.searchParams.get('after')
  const id = (await params).id
  const messages = await messagesIn(user.id, id, after && !Number.isNaN(Date.parse(after)) ? after : undefined)
  return messages ? NextResponse.json({ messages, open: await threadOpen(user.id, id) }) : problem(404, 'Conversation not found.')
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const blocked = await guard(req, { limit: LIMITS.message, limitKey: 'message' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = z.object({ body: z.string().trim().min(1).max(MAX_MESSAGE) }).strict().safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Write a message first.')
  const id = (await params).id
  const open = await threadOpen(user.id, id)
  if (open === null) return problem(404, 'Conversation not found.')
  if (!open) return problem(409, 'This conversation has closed. For anything about a past trip, ask AVANT support.')
  const message = await sendMessage(user.id, id, parsed.data.body)
  if (!message) return problem(404, 'Conversation not found.')
  afterResponse(() => deliverNotificationEmails())
  return NextResponse.json({ message })
}
