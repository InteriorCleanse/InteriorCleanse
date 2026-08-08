import type { Metadata } from 'next'
import { PageHero } from '@/components/ui'

export const metadata: Metadata = {
  title: 'About',
  description:
    'InteriorCleanse connects the visual calm of interior design with the practical rituals of keeping a real home.',
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
              Commerce is handled honestly. Product picks route outward to TikTok Shop and
              Amazon, where affiliate attribution and checkout belong. Books route to
              Amazon KDP, where readers can buy paperbacks and Kindle editions directly.
              We never collect payment details on this site.
            </p>
          </div>
          <img
            src="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=85"
            alt="A warm editorial interior with considered furniture and natural light"
            data-reveal
          />
        </div>
      </section>
    </>
  )
}
