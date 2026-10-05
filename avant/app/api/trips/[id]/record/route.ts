import { after, NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { confirmReading, recordReading, tripRecord } from '@/lib/server/claims'
import { deliverNotificationEmails } from '@/lib/server/email'
import { currentUser, signInRequired } from '@/lib/server/session'
import { LIMITS } from '@/lib/security/rate-limit'
import { guard, problem, readJson } from '@/lib/security/request'

export const runtime = 'nodejs'

/** The trip record (readings, mileage, claims) for the guest or host of a confirmed trip. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) return signInRequired()
  const record = await tripRecord(user.id, (await params).id)
  return record ? NextResponse.json({ record }) : problem(404, 'Trip not found.')
}

const Body = z.union([
  z.object({ kind: z.enum(['pickup', 'return']), odometer: z.number().int(), fuelPct: z.number().int() }).strict(),
  z.object({ confirm: z.enum(['pickup', 'return']) }).strict(),
])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard(req, { limit: LIMITS.message, limitKey: 'trip-record' })
  if (blocked) return blocked
  const user = await currentUser()
  if (!user) return signInRequired()
  const parsed = Body.safeParse(await readJson(req).catch(() => null))
  if (!parsed.success) return problem(400, 'Enter the odometer and the fuel or charge level.')
  const id = (await params).id
  const b = parsed.data
  const result = 'confirm' in b ? await confirmReading(user.id, id, b.confirm) : await recordReading(user.id, id, b.kind, b.odometer, b.fuelPct)
  if (result === 'not-found') return problem(404, 'Trip not found.')
  if (result === 'not-allowed') return problem(409, 'That reading can’t be changed now.')
  if (typeof result === 'object') return problem(400, result.error)
  after(() => deliverNotificationEmails())
  return NextResponse.json({ ok: true })
}
