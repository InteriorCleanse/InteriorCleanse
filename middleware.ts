import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth'

/**
 * Gate for /admin and /api/admin.
 *
 * The signature is verified here rather than merely checking that a cookie
 * exists — an unverified presence check is trivially forged. Each admin API
 * route re-checks independently so the dashboard is never the only guard.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // The login page and its POST handler must stay reachable while logged out.
  if (pathname.startsWith('/admin/login') || pathname.startsWith('/api/admin/login')) {
    return NextResponse.next()
  }

  const authed = await verifySessionToken(req.cookies.get(ADMIN_COOKIE)?.value)
  if (authed) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const login = req.nextUrl.clone()
  login.pathname = '/admin/login'
  login.search = ''
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
