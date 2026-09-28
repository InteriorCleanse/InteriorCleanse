import { NextResponse, type NextRequest } from 'next/server'
import { IMAGE_ORIGINS } from '@/lib/assets'

/**
 * Per-request Content-Security-Policy with a nonce. Next.js reads the nonce
 * from this header and stamps it onto its own scripts, so no inline script
 * runs unless we put it there. 'strict-dynamic' lets those trusted scripts
 * load their chunks; nothing else executes.
 */
const MAP_ORIGINS = ['https://tiles.openfreemap.org']

export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID())
  const dev = process.env.NODE_ENV !== 'production'
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${[...IMAGE_ORIGINS, ...MAP_ORIGINS].join(' ')}`,
    `font-src 'self' data:`,
    `connect-src 'self' ${MAP_ORIGINS.join(' ')}`,
    `worker-src 'self' blob:`,
    `child-src blob:`,
    `frame-src 'none'`,
    `form-action 'self' https://checkout.stripe.com https://verify.stripe.com`,
    `frame-ancestors 'none'`,
    `base-uri 'none'`,
    `object-src 'none'`,
    dev ? '' : 'upgrade-insecure-requests',
  ]
    .filter(Boolean)
    .join('; ')

  const headers = new Headers(req.headers)
  headers.set('x-nonce', nonce)
  headers.set('content-security-policy', csp)
  const res = NextResponse.next({ request: { headers } })
  res.headers.set('content-security-policy', csp)
  return res
}

export const config = {
  matcher: [{ source: '/((?!api|_next/static|_next/image|img|maplibre|favicon.ico).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }] }],
}
