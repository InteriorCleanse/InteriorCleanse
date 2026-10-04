import Link from 'next/link'
import { Wordmark } from './Logo'

export function SiteFooter() {
  return (
    <footer>
      <div className="wrap">
        <div className="footgrid">
          <div>
            <div className="brand" style={{ marginBottom: 10 }}><Wordmark /></div>
            <p className="ex" style={{ color: 'var(--neon)' }}>&gt;_ THE CODE THAT CUTS</p>
          </div>
          <nav className="footnav" aria-label="Footer">
            <Link href="/#build">Build a fob</Link>
            <Link href="/#shop">Shop</Link>
            <Link href="/#replace">Replace by VIN</Link>
            <Link href="/coverage/">Coverage</Link>
            <Link href="/how-it-works/">How it works</Link>
            <Link href="/faq/">FAQ</Link>
          </nav>
        </div>
        <p className="disc">
          Preview build of gcodekeys.com. Products shown are the planned catalog and all prices are <b>examples</b> to set before launch, not live charges. GCode Keys is an independent automotive key service, not a dealer or manufacturer. Keys are programmed at the vehicle after proof of ownership. Coverage is most makes and models; some late-model vehicles are dealer-only and are referred out. Drop timers are illustrative.
        </p>
      </div>
    </footer>
  )
}
