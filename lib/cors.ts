/**
 * Cross-origin access for the product's own clients.
 *
 * The browser extension runs at a `chrome-extension://` origin and the API
 * would refuse it by default — correctly, because a credentialed cross-origin
 * request is exactly what CSRF is. So access is an allowlist, exact-match, of
 * origins the operator typed into the environment. Nothing here reflects an
 * arbitrary `Origin` header back, and the wildcard is not accepted: with
 * `Allow-Credentials: true` the browser would reject it anyway, and an
 * allowlist that could be `*` is an allowlist someone will set to `*`.
 *
 * The desktop app needs none of this. It loads the site in its own window and
 * is same-origin with it.
 */

/** `chrome-extension://` ids are 32 letters a–p; anything else is a web origin. */
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/
const WEB_ORIGIN = /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/

export const CLIENT_API_PATHS = ['/api/assistant', '/api/session'] as const

/** Parses a comma-separated list, dropping anything that is not an origin. */
export function parseOrigins(raw: string | undefined | null): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const origin = part.trim().toLowerCase().replace(/\/+$/, '')
    if (!origin) continue
    if (EXTENSION_ORIGIN.test(origin) || WEB_ORIGIN.test(origin)) seen.add(origin)
  }
  return [...seen]
}

/** The operator's allowlist, read at call time so the Edge runtime sees it. */
export function clientOrigins(): string[] {
  return parseOrigins(process.env.CLIENT_ORIGINS)
}

/** Whether a path is one the clients are allowed to reach cross-origin. */
export function isClientApiPath(pathname: string): boolean {
  return CLIENT_API_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * The headers to attach for an allowed origin, or null for anyone else.
 *
 * Null means "add nothing": the browser then blocks the response on its own
 * side, which is the failure mode that leaks nothing. `Vary: Origin` keeps a
 * cache from serving one origin's allowance to another.
 */
export function corsHeaders(
  origin: string | null | undefined,
  allowlist: readonly string[],
): Record<string, string> | null {
  if (!origin) return null
  const normalised = origin.toLowerCase().replace(/\/+$/, '')
  if (!allowlist.includes(normalised)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}
