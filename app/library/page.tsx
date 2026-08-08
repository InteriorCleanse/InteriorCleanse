import type { Metadata } from 'next'
import { BookCard } from '@/components/cards'
import { PageHero } from '@/components/ui'
import { healthBooks, mindBooks } from '@/lib/content'

export const metadata: Metadata = {
  title: 'The Library',
  description:
    'Interior design and home organizing books from InteriorCleanse — written for real homes and real lives.',
}

export default function Library() {
  return (
    <>
      <PageHero
        eyebrow="For the mind — the library"
        eyebrowColor="var(--mind-accent)"
        background="var(--mind-bg)"
        title={
          <>
            Books that change
            <br />
            <em style={{ color: 'var(--mind-accent)' }}>how you see your space.</em>
          </>
        }
        sub="Field guides for spaces that support the life within them."
      />

      <section className="section" style={{ background: 'var(--mind-bg)', paddingTop: 0 }}>
        <div className="section-inner">
          <div className="book-grid gsap-stagger" style={{ marginTop: 0 }}>
            {mindBooks.map((book) => (
              <BookCard book={book} key={book.slug} />
            ))}
          </div>
        </div>
      </section>

      {healthBooks.length > 0 ? (
        <section className="section" style={{ background: '#0D1B2A' }}>
          <div className="section-inner">
            <div className="section-header">
              <p className="eyebrow" style={{ color: '#60A5FA' }}>
                Mind &amp; body — health reads
              </p>
              <h2 className="gsap-headline">
                Books for a <em style={{ color: '#60A5FA' }}>healthier life.</em>
              </h2>
            </div>
            <div className="book-grid gsap-stagger" style={{ marginTop: 0 }}>
              {healthBooks.map((book) => (
                <BookCard book={book} key={book.slug} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}
