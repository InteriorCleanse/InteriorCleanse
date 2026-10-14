import type { Metadata } from 'next'
import Link from 'next/link'
import { GUIDES } from '@/lib/guides'
import { EmailCapture } from '@/components/EmailCapture'

export const metadata: Metadata = {
  title: 'The Garage — guides for car owners',
  description:
    'Plain-English guides on car keys and ownership: what key you have, what to do if you lose it, and how to never overpay. Free to read.',
}

export default function Garage() {
  return (
    <main className="wrap" style={{ paddingBlock: '48px 64px' }}>
      <div className="kicker" style={{ color: 'var(--gold)' }}>The Garage</div>
      <h1 style={{ fontSize: 'clamp(2.2rem,5.5vw,3.4rem)', margin: '.4rem 0 0', letterSpacing: '-.02em' }}>
        Know your keys. Keep your money.
      </h1>
      <p className="sub" style={{ fontSize: '1.08rem' }}>
        Short, honest guides for car owners — the things worth knowing before a key ever goes missing. Free to read, no account needed.
      </p>

      <div className="guidegrid">
        {GUIDES.map((g) => (
          <Link key={g.slug} href={`/garage/${g.slug}/`} className="guidecard">
            <div className="guidecard-tag">{g.tag}{g.flagship ? ' · Free guide' : ''}</div>
            <h2>{g.title}</h2>
            <p>{g.dek}</p>
            <div className="guidecard-foot">
              <span>{g.readMins} min read</span>
              <span className="arrow" aria-hidden="true">→</span>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 34 }}>
        <EmailCapture source="garage" />
      </div>
    </main>
  )
}
