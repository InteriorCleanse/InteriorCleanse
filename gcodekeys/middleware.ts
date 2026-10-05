import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { OP_COOKIE, verifyOperatorToken } from '@/lib/operator-auth'

// Gate the operator console and the operator-only APIs on a valid signed
// session cookie. The login page and its auth endpoint stay public; the Stripe
// webhook is public by necessity (Stripe calls it) and verifies its own
// signature. Each protected route re-checks independently — this is a first
// gate, not the only one.
const PROTECTED_PAGES = ['/operator']
const PUBLIC_WITHIN = ['/operator/login']
const PROTECTED_APIS = ['/api/checkout', '/api/operator']
const PUBLIC_APIS = ['/api/operator/login']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isProtectedApi =
    PROTECTED_APIS.some((p) => pathname === p || pathname.startsWith(p + '/')) &&
    !PUBLIC_APIS.some((p) => pathname === p || pathname.startsWith(p + '/'))

  const isProtectedPage =
    PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/')) &&
    !PUBLIC_WITHIN.some((p) => pathname === p || pathname.startsWith(p + '/'))

  if (!isProtectedApi && !isProtectedPage) return NextResponse.next()

  const ok = await verifyOperatorToken(req.cookies.get(OP_COOKIE)?.value)
  if (ok) return NextResponse.next()

  if (isProtectedApi) {
    return NextResponse.json({ error: 'Operator authentication required.' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/operator/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/operator/:path*', '/api/checkout/:path*', '/api/operator/:path*'],
}
