/**
 * Which address to rate-limit by.
 *
 * `X-Forwarded-For` is a list anyone can prepend to, so its first entry is
 * whatever the caller wants it to be. Only entries added by proxies we run
 * are trustworthy, and those are at the right-hand end.
 *
 * - On Vercel, `x-real-ip` is set by the platform edge and cannot be forged.
 * - Elsewhere, set AVANT_TRUSTED_PROXY_HOPS to the number of proxies in front
 *   of the app. The client is that many entries from the right. The default
 *   is 0: forwarding headers are ignored and every caller shares one bucket,
 *   which fails safe (strict) rather than open (spoofable).
 */

export interface IpEnv {
  VERCEL?: string
  AVANT_TRUSTED_PROXY_HOPS?: string
  AVANT_REQUIRE_SECRETS?: string
}

export function pickClientIp(headers: Headers, env: IpEnv = process.env as IpEnv): string {
  if (env.VERCEL) {
    const real = headers.get('x-real-ip')?.trim()
    if (real) return real
  }
  // In production off Vercel, the proxy count must be stated, even as "0":
  // the default would put every visitor in one rate-limit bucket.
  if (env.AVANT_REQUIRE_SECRETS === '1' && env.AVANT_TRUSTED_PROXY_HOPS === undefined) {
    throw new Error('Set AVANT_TRUSTED_PROXY_HOPS when not running on Vercel')
  }
  const hops = Math.max(0, Math.min(10, Number.parseInt(env.AVANT_TRUSTED_PROXY_HOPS ?? '0', 10) || 0))
  if (hops === 0) return 'direct'
  const chain = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (chain.length === 0) return headers.get('x-real-ip')?.trim() || 'unknown'
  // Fewer entries than trusted hops means the header did not come through
  // all our proxies; use the leftmost we have rather than trusting nothing.
  return chain[Math.max(0, chain.length - hops)]
}
