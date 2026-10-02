import { NextResponse } from 'next/server'
import { tripsFor } from '@/lib/server/bookings'
import { currentUser, signInRequired } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function GET() {
  const user = await currentUser()
  if (!user) return signInRequired()
  return NextResponse.json({ trips: await tripsFor(user.id) })
}
