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

export { SiteHeader as Header } from './SiteHeader'

export function Footer() {
  // A letter close rather than the four-column link grid: the store signs off
  // like a note from the house, with one sign-up and a single line of links.
  return (
    <footer className="site-footer foot-letter">
      <div className="foot-letter__note">
        <p className="foot-letter__close">
          From our house to yours.
          <span className="foot-letter__sign">InteriorCleanse</span>
        </p>
        <p className="foot-letter__ps">
          Letters back are welcome at{' '}
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. Or leave an
          address for the occasional note when there is something worth sending.
        </p>
        {/* Always present, no modal required — the sign-up must never depend
            on a visitor having triggered something. */}
        <GuestBookForm variant="compact" id="guestbook-email-footer" />
      </div>

      <nav className="foot-letter__index" aria-label="Footer">
        <ul className="foot-letter__links">
          {NAV.map(([label, href]) => (
            <li key={href}>
              <Link href={href}>{label}</Link>
            </li>
          ))}
          <li>
            <Link href="/contact/">Contact</Link>
          </li>
          <li>
            <a href={SITE.social.tiktok} target="_blank" rel="noreferrer">
              TikTok ↗
            </a>
          </li>
          <li>
            <a href={SITE.social.instagram} target="_blank" rel="noreferrer">
              Instagram ↗
            </a>
          </li>
        </ul>
        <ul className="foot-letter__links foot-letter__links--legal">
          {FOOTER_LEGAL.map(([label, href]) => (
            <li key={href}>
              <Link href={href}>{label}</Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="footer-base">
        <span>
          © {new Date().getFullYear()} {BRAND_NAME}
        </span>
        <span>{SITE.affiliateDisclosure}</span>
      </div>
    </footer>
  )
}
