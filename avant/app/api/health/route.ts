import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/** Liveness only. What is configured is not an unauthenticated caller's business. */
export function GET() {
  return NextResponse.json({ ok: true })
}
