/**
 * Browser hardening — the headers every page and API answer leaves with, and
 * the small crypto helpers the rest of the door uses.
 *
 * In plain words: a Content Security Policy (CSP) tells the browser which
 * scripts, styles, images and fonts a page may load. Gavel allows its own
 * files, Google Fonts, and listing photos from any https:// auction CDN, and
 * nothing else. Inline scripts are blocked unless they carry the one-time
 * nonce the server minted for that page, so a script that someone manages to
 * inject into the HTML will not run. The other headers stop the app being
 * framed by another site, stop the browser guessing file types, and stop the
 * page leaking its address to sites it links to.
 *
 * `safeEqual` compares two secrets without leaking, through timing, how many
 * characters matched. Both sides are hashed first so lengths never differ.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** SHA-256 of a string or bytes, as raw bytes. */
function sha256(value: string | Uint8Array): Buffer {
  return createHash('sha256').update(value).digest()
}

/** SHA-256 of a string, as lower-case hex. Used to store access codes. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function comparable(v: unknown): v is string | Uint8Array {
  return typeof v === 'string' || v instanceof Uint8Array
}

/**
 * Constant-time equality for secrets (PINs, codes, signatures).
 * Anything that is not a string or bytes is never equal to anything, so an
 * `undefined` PIN can never match the text "undefined".
 */
export function safeEqual(a: unknown, b: unknown): boolean {
  if (!comparable(a) || !comparable(b)) return false
  return timingSafeEqual(sha256(a), sha256(b))
}

/** A fresh, unguessable nonce for one HTML response. 128 bits, base64. */
export function newNonce(): string {
  return randomBytes(16).toString('base64')
}

/**
 * The CSP for a page rendered with `nonce`.
 * No 'unsafe-inline' for scripts, ever. Styles allow inline because the UI
 * sets a few style attributes from JavaScript and Google Fonts serves CSS.
 * Images allow any https: origin because listing photos come from auction CDNs.
 */
export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "worker-src 'self'",
  ].join('; ')
}

/** Every browser feature Gavel does not use, switched off for this origin. */
const PERMISSIONS_POLICY = [
  'accelerometer', 'ambient-light-sensor', 'autoplay', 'battery', 'camera', 'display-capture',
  'document-domain', 'encrypted-media', 'fullscreen', 'geolocation', 'gyroscope', 'hid',
  'idle-detection', 'magnetometer', 'microphone', 'midi', 'payment', 'picture-in-picture',
  'publickey-credentials-get', 'screen-wake-lock', 'serial', 'sync-xhr', 'usb', 'web-share',
  'xr-spatial-tracking',
]
  .map((f) => `${f}=()`)
  .join(', ')

/**
 * The header set for every response. Lower-case names so node:http sends
 * them as-is. Cache-Control for API answers is the server's job (no-store).
 * Strict-Transport-Security is also the server's call: send it only when the
 * app is actually served over HTTPS, or a plain-http laptop setup breaks.
 */
export function securityHeaders(nonce: string): Record<string, string> {
  return {
    'content-security-policy': contentSecurityPolicy(nonce),
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': PERMISSIONS_POLICY,
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'x-permitted-cross-domain-policies': 'none',
  }
}

/**
 * Stamp `nonce="…"` onto every <script …> tag in an HTML document, replacing
 * any nonce that is already there. Closing tags and custom elements such as
 * <script-loader> are left alone.
 */
export function withNonce(html: string, nonce: string): string {
  const safe = nonce.replace(/["<>&]/g, '')
  return html.replace(/<script(?=[\s>\/])([^>]*)>/gi, (_m, attrs: string) => {
    const rest = attrs.replace(/\s+nonce\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    return `<script nonce="${safe}"${rest}>`
  })
}
