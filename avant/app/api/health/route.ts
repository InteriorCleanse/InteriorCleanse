import { NextResponse } from 'next/server'
import { modes } from '@/lib/modes'

export const runtime = 'nodejs'

export function GET() {
  return NextResponse.json({ ok: true, modes: modes() })
}
