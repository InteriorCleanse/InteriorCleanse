import { NextResponse } from 'next/server'
import { listingsForHost } from '@/lib/server/listings'
import { currentUser, signInRequired } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function GET() {
  const user = await currentUser()
  if (!user) return signInRequired()
  return NextResponse.json({ listings: await listingsForHost(user.id) })
}
