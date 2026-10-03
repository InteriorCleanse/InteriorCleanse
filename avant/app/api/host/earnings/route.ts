import { NextResponse } from 'next/server'
import { earningsFor } from '@/lib/server/payouts'
import { currentUser, signInRequired } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function GET() {
  const user = await currentUser()
  if (!user) return signInRequired()
  return NextResponse.json(await earningsFor(user.id))
}
