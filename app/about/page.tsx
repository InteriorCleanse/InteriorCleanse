import type { Metadata } from 'next'
import { PageHero } from '@/components/ui'

export const metadata: Metadata = {
  title: 'About',
  description:
    'InteriorCleanse connects the visual calm of interior design with the practical rituals of keeping a real home.',
  alternates: { canonical: '/about/' },
}

export default function About() {
  return (
    <>
      <PageHero
        eyebrow="About InteriorCleanse"
        title={
          <>
            A home should feel
            <br />
            <em>edited, not emptied.</em>
          </>
        }
      />

      <section className="section" style={{ background: 'var(--ink)' }}>
        <div className="split-grid">
          <div className="prose" data-reveal>
            <p className="lead prose-dropcap">
              InteriorCleanse began as a way to connect two parts of domestic life that
              are often separated: the visual calm of interior design and the practical
              rituals of cleaning, sorting, and maintaining a real home.
            </p>
            <p>
              The site is built around four tracks — mind, home, body, and spirit —
              because a well-kept life is rarely just one of them. Books for the mind.
              Cleaning and organizing for the home. Candles and objects for the body.
              Christian literature for the spirit.
            </p>
            <p>
              Commerce is handled honestly. Candles and objects are sold here, and
              checkout runs on Stripe, so card details go to Stripe and never to us.
              Partner picks link out to the partner&apos;s own site, and every one is
              disclosed. Books route to Amazon KDP, where readers can buy paperbacks
              and Kindle editions directly.
            </p>
          </div>
          <img
            src="/media/hf/hf_20260925_224901_3ec3cf93-a32b-49c0-aead-249d0bcb268e.webp"
            alt="A linen-made bed and a stone side table in soft morning light"
            data-reveal
          />
        </div>
      </section>
    </>
  )
}
