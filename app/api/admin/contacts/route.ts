import { NextResponse } from 'next/server'
import { configured, errorBody } from '@/lib/env'
import { listContacts } from '@/lib/brevo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type AdminContact = {
  email: string
  firstName: string
  lastName: string
  source: string
  signupDate: string | null
  lastOrderDate: string | null
  totalSpent: number
  listIds: number[]
}

export async function GET(req: Request) {
  try {
    if (!configured.brevo()) {
      return NextResponse.json({ contacts: [], configured: false })
    }

    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)

    const data = await listContacts(limit, offset)
    const contacts: AdminContact[] = (data?.contacts ?? []).map((c: any) => {
      const a = c.attributes ?? {}
      return {
        email: c.email,
        firstName: a.FIRSTNAME ?? '',
        lastName: a.LASTNAME ?? '',
        source: a.SOURCE ?? '—',
        signupDate: a.SIGNUP_DATE ?? c.createdAt ?? null,
        lastOrderDate: a.LAST_ORDER_DATE ?? null,
        totalSpent: Number(a.TOTAL_SPENT ?? a.LAST_ORDER_AMOUNT ?? 0),
        listIds: c.listIds ?? [],
      }
    })

    return NextResponse.json({
      contacts,
      total: data?.count ?? contacts.length,
      configured: true,
    })
  } catch (e) {
    console.error('[admin/contacts]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}
