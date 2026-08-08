import { NextResponse } from 'next/server'
import { errorBody } from '@/lib/env'
import {
  ADMIN_COOKIE,
  checkPassword,
  cookieOptions,
  createSessionToken,
} from '@/lib/admin-auth'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const { password } = (await req.json()) as { password?: string }

    if (!password || !checkPassword(password)) {
      // Deliberately vague, and slow enough to blunt scripted guessing.
      await new Promise((r) => setTimeout(r, 500))
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
    }

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
