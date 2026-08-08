import type { Metadata } from 'next'
import { BookCard } from '@/components/cards'
import { PageHero } from '@/components/ui'
import { digitalProducts, gumroadUrl, healthBooks, mindBooks } from '@/lib/content'

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

      {digitalProducts.length > 0 ? (
        <section className="section" style={{ background: 'var(--ink)' }}>
          <div className="section-inner">
            <div className="section-header">
              <p className="eyebrow">Instant downloads</p>
              <h2 className="gsap-headline">
                Print it, fill it in,
                <br />
                <em>put it to work.</em>
              </h2>
            </div>

            <div className="download-grid gsap-stagger">
              {digitalProducts.map((item) => (
                <article className="download-card" key={item.slug} data-reveal>
                  <div className="download-card-image">
                    <img src={item.coverImage} alt={item.imageAlt} loading="lazy" />
                    <span className="download-format">{item.format}</span>
                  </div>
                  <h3 className="download-title">{item.title}</h3>
                  <p className="download-subtitle">{item.subtitle}</p>
                  <p className="download-desc">{item.description}</p>
                  <ul className="download-bullets">
                    {item.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <div className="download-foot">
                    <span className="download-price">{item.price}</span>
                    <a
                      className="book-buy-btn"
                      href={gumroadUrl(item)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.price.toLowerCase() === 'free' ? 'Download ↗' : 'Get it ↗'}
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}
