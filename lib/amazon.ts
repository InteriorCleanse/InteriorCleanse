/**
 * The real Amazon listing behind a link, or null while the link is still a
 * placeholder (the Amazon home page, a search, the Kindle storefront). Only a
 * product page (`/dp/…`, `/gp/product/…`) or Amazon's own short links count,
 * so no visitor is sent to a generic page labelled as this book.
 */
export function amazonListing(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'amzn.to' || host === 'a.co') return u.pathname.length > 1 ? url : null
    if (!/(^|\.)amazon\.[a-z.]+$/.test(host)) return null
    return /\/(dp|gp\/product)\/[A-Z0-9]{10}/i.test(u.pathname) ? url : null
  } catch {
    return null
  }
}
