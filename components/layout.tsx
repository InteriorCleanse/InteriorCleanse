import Link from 'next/link'
import { GuestBookForm } from './GuestBook'
import { BRAND_NAME, SITE } from '@/lib/site-config'

const NAV: [string, string][] = [
  ['Shop', '/shop/'],
  ['Library', '/library/'],
  ['Spirit', '/spirit/'],
  ['Journal', '/journal/'],
  ['Partners', '/partners/'],
  ['About', '/about/'],
]

const FOOTER_LEGAL: [string, string][] = [
  ['Affiliate disclosure', '/legal/affiliate-disclosure/'],
  ['Privacy policy', '/legal/privacy-policy/'],
  ['Returns', '/legal/returns/'],
  ['Digital licence', '/legal/digital-license/'],
  ['Terms', '/legal/terms/'],
]

/**
 * Footer wordmark. The ◇ separator is gone from the whole site — it read as
 * decoration rather than as part of the mark, and the master logo has a star
 * divider of its own.
 */
function Wordmark() {
  return (
    <Link href="/" className="wordmark">
      INTERIOR CLEANSE
    </Link>
  )
}

export { SiteHeader as Header } from './SiteHeader'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <Wordmark />
          <p>
            {SITE.tagline}.
            <br />
            Curated objects and ideas for a more considered life.
          </p>
          {/* Always present, no modal required — the sign-up must never depend
              on a visitor having triggered something. */}
          <GuestBookForm variant="compact" id="guestbook-email-footer" />
        </div>
        <div>
          <p className="footer-col-title">Navigate</p>
          <div className="footer-links">
            {NAV.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
            <Link href="/contact/">Contact</Link>
          </div>
        </div>
        <div>
          <p className="footer-col-title">Legal</p>
          <div className="footer-links">
            {FOOTER_LEGAL.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="footer-col-title">Connect</p>
          <div className="footer-links">
            <a href={SITE.social.tiktok} target="_blank" rel="noreferrer">
              TikTok ↗
            </a>
            <a href={SITE.social.instagram} target="_blank" rel="noreferrer">
              Instagram ↗
            </a>
            <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
          </div>
        </div>
      </div>
      <div className="footer-base">
        <span>
          © {new Date().getFullYear()} {BRAND_NAME}
        </span>
        <span>{SITE.affiliateDisclosure}</span>
      </div>
    </footer>
  )
}
