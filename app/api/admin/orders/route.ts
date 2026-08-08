import { NextResponse } from 'next/server'
import { errorBody } from '@/lib/env'
import { getOrders } from '@/lib/admin-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type { AdminOrder } from '@/lib/admin-data'

export async function GET() {
  try {
    return NextResponse.json(await getOrders())
  } catch (e) {
    console.error('[admin/orders]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
