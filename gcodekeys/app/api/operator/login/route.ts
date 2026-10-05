import { NextResponse } from 'next/server'
import {
  OP_COOKIE,
  checkOperatorPassword,
  cookieOptions,
  createOperatorToken,
  operatorAuthConfigured,
} from '@/lib/operator-auth'

export const runtime = 'nodejs'

// POST { password } -> sets the signed operator session cookie on success.
export async function POST(req: Request) {
  if (!operatorAuthConfigured()) {
    return NextResponse.json(
      { error: 'Operator access is not configured yet. Set OPERATOR_PASSWORD in Vercel.' },
      { status: 501 },
    )
  }
  let password = ''
  try {
    const body = (await req.json()) as { password?: string }
    password = body.password ?? ''
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }

  if (!(await checkOperatorPassword(password))) {
    return NextResponse.json({ error: 'Incorrect passkey.' }, { status: 401 })
  }

  const token = await createOperatorToken()
  if (!token) return NextResponse.json({ error: 'Session secret missing.' }, { status: 500 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(OP_COOKIE, token, cookieOptions())
  return res
}

// DELETE -> clears the session cookie (logout).
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(OP_COOKIE, '', { ...cookieOptions(), maxAge: 0 })
  return res
}
