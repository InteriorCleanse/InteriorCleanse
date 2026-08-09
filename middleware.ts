import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Edge gate for authenticated surfaces.
 *
 * Responsibilities, deliberately narrow:
 *   1. Refresh the Supabase session cookie so long sessions do not silently expire.
 *   2. Redirect unauthenticated requests away from /app and /owner-admin.
 *   3. Bounce signed-in users off /login and /signup.
 *
 * What it does NOT do: role or entitlement checks. Those need database reads
 * that do not belong on the Edge, and a JWT claim would go stale the moment a
 * role changed or a subscription lapsed. Authorization is decided server-side
 * per request (lib/session.ts) and backstopped by RLS. Middleware that pretends
 * to authorize is worse than middleware that admits it only authenticates.
 */

const PROTECTED_PREFIXES = ['/app', '/owner-admin']
const AUTH_PAGES = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  const { response, user, configured } = await updateSession(request)
  const { pathname } = request.nextUrl

  // Without Supabase configured there is no auth to enforce; let the public
  // site render and let protected pages show their own Not Configured state.
  if (!configured) return response

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )

  if (isProtected && !user) {
    const login = request.nextUrl.clone()
    login.pathname = '/login'
    login.search = ''
    // Preserve intent so the user lands where they were headed after signing in.
    login.searchParams.set('next', pathname)
    return NextResponse.redirect(login)
  }

  if (user && AUTH_PAGES.includes(pathname)) {
    const app = request.nextUrl.clone()
    app.pathname = '/app/command-center'
    app.search = ''
    return NextResponse.redirect(app)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. The session cookie must
     * refresh on ordinary page loads too, not only on protected routes.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
