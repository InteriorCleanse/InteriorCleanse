import { NextResponse } from 'next/server'
import { errorBody } from '@/lib/env'
import {
  ADMIN_COOKIE,
  checkPassword,
  cookieOptions,
  createSessionToken,
} from '@/lib/admin-auth'

export const runtime = 'nodejs'

/**
 * Lockout: five wrong passwords from one address locks that address out for
 * fifteen minutes. Like the subscribe limiter this lives in module scope, so on
 * serverless it is per-instance and resets on a cold start. It stops a script
 * hammering one instance; a Vercel Firewall rule on /api/admin/login is the
 * durable version.
 */
const WINDOW_MS = 15 * 60_000
const MAX_FAILURES = 5
const failures = new Map<string, { count: number; resetAt: number }>()

function lockedOut(ip: string): boolean {
  const e = failures.get(ip)
  if (!e) return false
  if (Date.now() > e.resetAt) {
    failures.delete(ip)
    return false
  }
  return e.count >= MAX_FAILURES
}

function recordFailure(ip: string) {
  const now = Date.now()
  const e = failures.get(ip)
  if (!e || now > e.resetAt) failures.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  else e.count += 1
}

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      'unknown'

    if (lockedOut(ip)) {
      return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 })
    }

    const { password } = (await req.json()) as { password?: string }

    if (!password || !checkPassword(password)) {
      recordFailure(ip)
      // Deliberately vague, and slow enough to blunt scripted guessing.
      await new Promise((r) => setTimeout(r, 500))
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
    }

    failures.delete(ip)

    const res = NextResponse.json({ ok: true })
    res.cookies.set(ADMIN_COOKIE, await createSessionToken(), cookieOptions)
    return res
  } catch (e) {
    console.error('[admin/login]', e)
    return NextResponse.json(errorBody(e), { status: 500 })
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, '', { ...cookieOptions, maxAge: 0 })
  return res
}
