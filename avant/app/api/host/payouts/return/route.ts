import { NextResponse, type NextRequest } from 'next/server'
import { refreshAccount } from '@/lib/server/payouts'
import { currentUser } from '@/lib/server/session'

export const runtime = 'nodejs'

/** Stripe sends the host back here after payout setup. */
export async function GET(req: NextRequest) {
  const user = await currentUser()
  const to = new URL('/host/earnings', req.url)
  if (!user) return NextResponse.redirect(new URL('/signin?next=/host/earnings', req.url))
  try {
    const state = await refreshAccount(user.id)
    to.searchParams.set('setup', state.payoutsEnabled ? 'done' : 'pending')
  } catch {
    to.searchParams.set('setup', 'pending')
  }
  return NextResponse.redirect(to)
}
