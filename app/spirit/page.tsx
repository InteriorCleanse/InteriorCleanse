import type { Metadata } from 'next'
import { BabylonViewerLoader } from '@/components/3d/BabylonViewerLoader'
import { SpiritCard } from '@/components/cards'
import { TrackIcon } from '@/components/TrackIcon'
import { DisclosureBox } from '@/components/ui'
import { spiritBooks } from '@/lib/content'

export const metadata: Metadata = {
  title: 'The Faith Library',
  description:
    'Christian books, Bibles, devotionals, and coloring books for every member of the family.',
}

export default function Spirit() {
  return (
    <>
      <section
        className="section"
        style={{
          background: 'var(--spirit-bg)',
          paddingTop: 'calc(var(--header-h) + 6rem)',
          paddingBottom: '4rem',
        }}
      >
        <div className="section-inner">
          <div className="split-grid">
            <div>
              <div className="track-eyebrow-row">
                <TrackIcon name="star" />
                <span className="eyebrow" style={{ color: 'var(--spirit-accent)' }}>
                  For the spirit — the faith library
                </span>
              </div>
              <h1
                className="gsap-headline"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(3rem, 7vw, 7rem)',
                  fontWeight: 300,
                  lineHeight: 0.85,
                  letterSpacing: '-0.05em',
                  color: 'var(--spirit-accent)',
                  marginTop: '1.5rem',
                }}
              >
                Books for a life
                <br />
                <em style={{ fontStyle: 'italic', color: '#D4AF6A' }}>rooted in faith.</em>
              </h1>
              <p className="page-hero-sub">
                Bibles, devotionals, and coloring books chosen to be used — kept on the
                nightstand, carried to church, and worked through together.
              </p>
            </div>
            <BabylonViewerLoader height={440} label="◇ DRAG TO ROTATE" />
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--spirit-bg)', paddingTop: 0 }}>
        <div className="section-inner">
          <div className="grid-4 gsap-stagger">
            {spiritBooks.map((book) => (
              <SpiritCard book={book} key={book.slug} />
            ))}
          </div>
          <div style={{ marginTop: '5rem' }}>
            <DisclosureBox />
          </div>
        </div>
      </section>
    </>
  )
}
