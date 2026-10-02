import { NextResponse, type NextRequest } from 'next/server'
import { tripFor } from '@/lib/server/bookings'
import { currentUser, signInRequired } from '@/lib/server/session'
import { problem } from '@/lib/security/request'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) return signInRequired()
  const trip = await tripFor(user.id, (await params).id)
  return trip ? NextResponse.json({ trip }) : problem(404, 'Trip not found.')
}
