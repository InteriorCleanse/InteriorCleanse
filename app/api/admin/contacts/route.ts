import { NextResponse } from 'next/server'
import { errorBody } from '@/lib/env'
import { getContacts } from '@/lib/admin-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type { AdminContact } from '@/lib/admin-data'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)

    return NextResponse.json(await getContacts(limit, offset))
  } catch (e) {
    console.error('[admin/contacts]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
