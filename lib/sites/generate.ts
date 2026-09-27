/**
 * Turning a brief into a one-page site.
 *
 * The model writes the page; this module decides what it is asked for and
 * what it is allowed to hand back. The rules exist for two reasons that pull
 * the same way: a page that loads nothing from anywhere else is a page that
 * works forever and leaks nothing, and a page a sandboxed preview can show
 * safely is a page with no external script, frame or redirect in it.
 *
 * Pure. The call to the model is injected by the caller so this is tested
 * without a key and without a network.
 */

/** Matches the column check in 0015. */
export const SITE_HTML_LIMIT = 400_000

export type SiteBrief = { name: string; brief: string; style?: string }

export function siteSystemPrompt(): string {
  return [
    'You build one-page websites. You are given a name and a plain-language brief and you return exactly one complete HTML5 document, nothing else: no explanation, no markdown fences, no text before <!doctype html> or after </html>.',
    '',
    'Rules the document must follow:',
    '- Self-contained. All CSS in a <style> element. JavaScript only if the page genuinely needs it (a mobile menu, a form that shows a thank-you), and then only inline in a <script> element. Never load a script, stylesheet, font, frame or image from another site, with one exception: a Google Fonts stylesheet from fonts.googleapis.com is allowed.',
    '- No <iframe>, <object>, <embed>, <base>, or meta refresh. Forms must not post anywhere; a form shows a message and nothing more.',
    '- Images are inline SVG, CSS gradients, or nothing. Do not reference image files you do not have.',
    '- Responsive from a phone up, with a real <title>, semantic landmarks, alt text on every meaningful graphic, and text that meets WCAG AA contrast.',
    '- Use only facts from the brief. Where a fact is needed and the brief does not give it — an address, a price, opening hours, a phone number — write a visible placeholder in square brackets such as [opening hours] rather than inventing one.',
    '- Good, restrained design: a clear hierarchy, one accent colour, generous spacing, no stock phrases. It should look like a page someone paid for.',
    '- Keep it under 60 KB.',
  ].join('\n')
}

export function siteUserPrompt(input: SiteBrief): string {
  return [
    `Site name: ${input.name}`,
    input.style ? `Style notes: ${input.style}` : null,
    '',
    'Brief:',
    input.brief,
  ]
    .filter((line) => line !== null)
    .join('\n')
}

/**
 * The document out of whatever the model wrapped it in. Fences and preamble
 * are stripped; the result is the first doctype or <html> through the last
 * </html>, or the trimmed text when neither is there so validation can say
 * exactly what is wrong.
 */
export function extractHtml(text: string): string {
  const unfenced = text.replace(/```(?:html)?\s*([\s\S]*?)```/gi, '$1')
  const lower = unfenced.toLowerCase()
  const doctype = lower.indexOf('<!doctype')
  const htmlTag = lower.indexOf('<html')
  const start = doctype >= 0 ? doctype : htmlTag
  const end = lower.lastIndexOf('</html>')
  if (start < 0 || end < 0 || end < start) return unfenced.trim()
  return unfenced.slice(start, end + '</html>'.length).trim()
}

const FORBIDDEN: [RegExp, string][] = [
  [/<script[^>]*\ssrc\s*=/i, 'loads a script from elsewhere'],
  [/<iframe\b/i, 'contains a frame'],
  [/<object\b/i, 'contains an embedded object'],
  [/<embed\b/i, 'contains an embedded object'],
  [/<base\b/i, 'sets a base URL'],
  [/<meta[^>]+http-equiv\s*=\s*["']?refresh/i, 'redirects'],
]

const ALLOWED_LINK = /^https:\/\/fonts\.googleapis\.com\//i

/** Whether a generated document is one we will store and show. */
export function validateSiteHtml(html: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = html.trim()
  if (!trimmed) return { ok: false, reason: 'The model returned no page.' }
  if (!/<html[\s>]/i.test(trimmed) || !/<\/html>/i.test(trimmed)) {
    return { ok: false, reason: 'The model did not return a complete HTML document.' }
  }
  if (trimmed.length > SITE_HTML_LIMIT) {
    return { ok: false, reason: 'The page is too large to store.' }
  }
  for (const [pattern, what] of FORBIDDEN) {
    if (pattern.test(trimmed)) return { ok: false, reason: `The page ${what}, which is not allowed.` }
  }
  // A stylesheet link is allowed from Google Fonts and nowhere else; every
  // other <link> is something loaded from another site.
  for (const match of trimmed.matchAll(/<link\b[^>]*>/gi)) {
    const href = /href\s*=\s*["']([^"']*)["']/i.exec(match[0])?.[1] ?? ''
    if (!ALLOWED_LINK.test(href)) {
      return { ok: false, reason: 'The page links to a resource on another site, which is not allowed.' }
    }
  }
  return { ok: true }
}

/** The response headers that keep a stored page from touching this product. */
export function siteContentSecurityPolicy(): string {
  return [
    // A unique origin: the page cannot read this app's cookies or storage.
    'sandbox allow-scripts allow-popups',
    "default-src 'none'",
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com data:',
    'img-src data: https:',
    "script-src 'unsafe-inline'",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; ')
}
