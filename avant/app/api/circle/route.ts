import { NextResponse } from 'next/server'
import { circleFor, referralCodeFor } from '@/lib/server/advantage'
import { creditHistory } from '@/lib/server/credit'
import { currentUser, signInRequired } from '@/lib/server/session'

export const runtime = 'nodejs'

/** The guest's Circle tier, credit wallet and referral code. */
export async function GET() {
  const user = await currentUser()
  if (!user) return signInRequired()
  const [circle, code, history] = await Promise.all([circleFor(user.id), referralCodeFor(user.id), creditHistory(user.id)])
  return NextResponse.json({ circle, referralCode: code, history })
}
