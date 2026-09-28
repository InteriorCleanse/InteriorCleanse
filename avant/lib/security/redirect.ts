/**
 * Post-verification redirect target. Only a path on this site is allowed:
 * no scheme, no host, no protocol-relative `//`, and none of the tricks that
 * browsers normalise into one (`/\evil.com`, `/<TAB>/evil.com`).
 */

const FALLBACK = '/search'

export function safeNext(raw: string | null | undefined, origin = 'https://avant.invalid'): string {
  if (!raw || raw.length > 512) return FALLBACK
  // Backslashes and control characters (tab, newline, NUL, DEL) are what
  // turn an innocent-looking path into another host once a browser cleans it.
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return FALLBACK
  if (!raw.startsWith('/') || raw.startsWith('//')) return FALLBACK
  let url: URL
  try {
    url = new URL(raw, origin)
  } catch {
    return FALLBACK
  }
  if (url.origin !== new URL(origin).origin) return FALLBACK
  return `${url.pathname}${url.search}${url.hash}`
}
