/**
 * WHO IS REALLY ASKING — two checks that run before any route.
 *
 * 1. The Host header must name this computer. A web page on another site can
 *    point its own domain at 127.0.0.1 (DNS rebinding); the browser then
 *    treats this app as that site's origin and lets the page read it, CSRF
 *    token included. The one thing it cannot change is the Host header, which
 *    still names the attacker's domain. Only localhost, 127.0.0.1 and [::1]
 *    pass, plus this computer's own network names when phone access is on,
 *    plus anything listed in MRCASH_ALLOWED_HOSTS (a tunnel or proxy name).
 *
 * 2. A request that came through a proxy or tunnel is not "this computer",
 *    even though its socket is loopback. Caddy, nginx, cloudflared, ngrok and
 *    Tailscale all add a forwarding header; when one is present the request
 *    meets the PIN like any other device.
 *
 * Pure apart from reading the network interfaces; no logging.
 */
import { networkInterfaces, hostname } from 'node:os'

const FORWARDING_HEADERS = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip']

/** Did a proxy or tunnel hand us this request? */
export function forwardedBy(headers: Record<string, string | string[] | undefined>): boolean {
  return FORWARDING_HEADERS.some((h) => headers[h] !== undefined)
}

/** The hostname part of a Host header, lower-cased, or null when it does not parse. */
export function hostOf(host: string | undefined): string | null {
  if (!host) return null
  try {
    const name = new URL(`http://${host}`).hostname
    return name ? name.replace(/\.$/, '') : null
  } catch {
    return null
  }
}

/** The names this computer answers to. */
export function allowedHosts(opts: { allowPhone: boolean; extra?: string }): Set<string> {
  const out = new Set(['localhost', '127.0.0.1', '[::1]'])
  for (const h of (opts.extra ?? '').split(',')) {
    const name = hostOf(h.trim())
    if (name) out.add(name)
  }
  if (opts.allowPhone) {
    for (const list of Object.values(networkInterfaces())) {
      for (const ni of list ?? []) out.add(ni.family === 'IPv6' ? `[${ni.address.split('%')[0]}]` : ni.address)
    }
    const me = hostname().toLowerCase()
    if (me) { out.add(me); out.add(`${me}.local`) }
  }
  return out
}

/** Does this Host header name this computer? A missing or malformed one does not. */
export function hostAllowed(host: string | undefined, allowed: Set<string>): boolean {
  const name = hostOf(host)
  return name !== null && allowed.has(name)
}
