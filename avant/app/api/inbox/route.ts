import { NextResponse } from 'next/server'
import { threadsFor, unreadCounts } from '@/lib/server/inbox'
import { currentUser, signInRequired } from '@/lib/server/session'

export const runtime = 'nodejs'

export async function GET() {
  const user = await currentUser()
  if (!user) return signInRequired()
  return NextResponse.json({ threads: await threadsFor(user.id), unread: await unreadCounts(user.id) })
}
