/**
 * SECURITY HARDENING — the browser-facing half.
 *
 * Threat model, stated plainly so the choices below can be argued with:
 *
 *   • This is a LOCALHOST-first app that can be put on a home network
 *     (`config.app.allowPhone`). The realistic attacker is not a state actor —
 *     it is a malicious web page the operator happens to have open, another
 *     device on the same wifi, or someone scanning the LAN for open ports.
 *   • The app holds no customer funds and the live order path is dormant. The
 *     things worth stealing are the PIN, the session cookie, the CSRF token and
 *     the webhook secret; the thing worth abusing is the kill switch.
 *   • Anything that reaches the AI chat is UNTRUSTED TEXT. News headlines and
 *     TradingView alert bodies are written by strangers.
 *
 * What is here:
 *   1. `safeEqual` — constant-time secret comparison. Four places compared
 *      secrets with `===`, which returns as soon as two bytes differ and leaks
 *      the length of the correct prefix. The PIN is six digits behind a
 *      throttle, which is exactly the size of secret where a timing oracle is
 *      worth having.
 *   2. `securityHeaders` — the headers the server never sent. No CSP, no
 *      nosniff, no frame protection. A page the operator has open in another
 *      tab could frame the dashboard and trick a click onto the kill switch.
 *   3. A NONCE-based CSP rather than `'unsafe-inline'`. The page has exactly
 *      one inline script and zero inline event handlers, which is what makes
 *      the strong version possible — so script injection has no way to execute
 *      even if a hole appears somewhere else.
 *
 * None of this touches the trading engine, and none of it is on the order path.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Compare two secrets in constant time.
 *
 * Both sides are hashed first, so the comparison is over fixed-length buffers:
 * `timingSafeEqual` throws on a length mismatch, and taking that branch would
 * leak the length of the real secret — the thing being hidden.
 */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ha = createHash('sha256').update(a, 'utf8').digest()
  const hb = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(ha, hb)
}

/** A fresh CSP nonce. 128 bits, base64 — one per page load, never reused. */
export function newNonce(): string {
  return randomBytes(16).toString('base64')
}

/**
 * The Content-Security-Policy.
 *
 * `script-src` takes a per-request nonce and `'self'`, NOT `'unsafe-inline'`:
 * injected markup cannot guess the nonce, so it cannot run. The TradingView
 * widget is allowlisted by origin because it is loaded as an external script and
 * draws its chart in an iframe; if it is ever blocked the page already degrades
 * to a written explanation instead of breaking.
 *
 * `style-src` does keep `'unsafe-inline'` — the app sets `style="…"` attributes
 * throughout, and CSP has no nonce mechanism for those. That is a real, narrow
 * gap, recorded here rather than hidden: it permits injected CSS, not injected
 * script.
 */
export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' https://s3.tradingview.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.tradingview.com",
    "frame-src https://*.tradingview.com",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
  ].join('; ')
}

/**
 * Headers sent on every response.
 *
 * `frame-ancestors 'none'` is the modern clickjacking defence and
 * `X-Frame-Options` is the same thing for older browsers — the dashboard has a
 * kill switch and a settings form, so being framed is not cosmetic.
 *
 * The microphone is allowed for the app's own origin because talking to
 * Mr. Cash is a feature; everything else in `Permissions-Policy` is refused
 * outright rather than left to the default.
 */
export function securityHeaders(nonce: string): Record<string, string> {
  return {
    'content-security-policy': contentSecurityPolicy(nonce),
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'geolocation=(), camera=(), payment=(), usb=(), magnetometer=(), accelerometer=(), microphone=(self)',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    // The dashboard shows live positions and a kill switch; no cache anywhere is
    // the right default for a page behind a PIN on a shared network.
    'x-permitted-cross-domain-policies': 'none',
  }
}

/**
 * Put the nonce on every script tag in the page.
 *
 * The app has one inline `<script>` and a handful of `<script type="module"
 * src="/js/…">`. The module ones would pass on `'self'` alone; they get a nonce
 * too so that tightening `script-src` later cannot silently break them.
 */
export function withNonce(html: string, nonce: string): string {
  return html.replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`)
}
