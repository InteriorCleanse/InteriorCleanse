/**
 * Authorizing a scheduled request.
 *
 * Scheduled endpoints have no session, so a shared secret is the whole of the
 * authentication. Two details are load-bearing:
 *
 * **Constant-time comparison.** `a === b` returns as soon as two bytes differ,
 * which leaks the length of the matching prefix to anyone who can measure the
 * response. That is enough to recover a secret byte by byte.
 *
 * **404, not 401.** A 401 confirms the endpoint exists and that a secret is
 * worth guessing. These routes have no legitimate human caller, so there is
 * nobody to inform.
 */

export function isCronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) return false

  const provided =
    request.headers.get('x-cron-secret') ??
    // Vercel Cron sends its own bearer token; accepting it here means the
    // platform scheduler works without a second secret to keep in step.
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''

  return timingSafeEqual(provided, expected)
}

/** The response for an unauthorized scheduled request. Deliberately a 404. */
export function cronDenied(): Response {
  return new Response('Not found', { status: 404 })
}

export function timingSafeEqual(a: string, b: string): boolean {
  // The length check is itself a leak of the length, which is not secret and
  // is not recoverable byte by byte the way a prefix is.
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
