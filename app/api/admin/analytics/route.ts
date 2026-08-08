import { NextResponse } from 'next/server'
import { errorBody } from '@/lib/env'
import { getAnalytics } from '@/lib/admin-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The query lives in lib/admin-data so the JARVIS tools report the same numbers
// this dashboard shows, rather than a second implementation that can drift.
export type { Analytics } from '@/lib/admin-data'

export async function GET() {
  try {
    return NextResponse.json(await getAnalytics())
  } catch (e) {
    console.error('[admin/analytics]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
