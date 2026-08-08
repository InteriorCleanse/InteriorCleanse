import Link from 'next/link'
import { CartButton } from './cart'
import { BRAND_NAME, SITE } from '@/lib/site-config'

const NAV: [string, string][] = [
  ['Shop', '/shop/'],
  ['Library', '/library/'],
  ['Spirit', '/spirit/'],
  ['Journal', '/journal/'],
  ['About', '/about/'],
]

const FOOTER_LEGAL: [string, string][] = [
  ['Affiliate disclosure', '/legal/affiliate-disclosure/'],
  ['Privacy policy', '/legal/privacy-policy/'],
  ['Terms', '/legal/terms/'],
]

function Wordmark() {
  return (
    <Link href="/" className="wordmark">
      INTERIOR<em>◇</em>CLEANSE
    </Link>
  )
}

export function Header() {
  return (
    <header className="site-header">
      <Wordmark />
      <nav className="site-nav">
        {NAV.map(([label, href]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
        <CartButton />
      </nav>
    </header>
  )
}

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
