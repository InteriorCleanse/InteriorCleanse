import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BookLd, BreadcrumbLd } from '@/components/StructuredData'
import { Button } from '@/components/ui'
import { allBooks, getBook } from '@/lib/content'
import { amazonListing } from '@/lib/amazon'
import { ObjectStage } from '@/components/3d/ObjectStage'

export function generateStaticParams() {
  return allBooks.map((b) => ({ slug: b.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const b = getBook(params.slug)
  if (!b) return { title: 'Book' }
  return {
    title: b.title,
    description: b.hook,
    alternates: { canonical: `/library/${b.slug}/` },
    openGraph: {
      title: b.title,
      description: b.hook,
      images: [b.coverImage],
      url: `/library/${b.slug}/`,
    },
  }
}

export default function BookPage({ params }: { params: { slug: string } }) {
  const b = getBook(params.slug)
  if (!b) notFound()
  const paperback = amazonListing(b.paperbackUrl)
  const kindle = amazonListing(b.kindleUrl)

  return (
    <section
      className="section"
      style={{
        background: b.track === 'health' ? 'var(--body-bg)' : 'var(--mind-bg)',
        paddingTop: 'calc(var(--header-h) + 6rem)',
      }}
    >
      <BookLd book={b} />
      <BreadcrumbLd
        trail={[
          { name: 'The Library', path: '/library/' },
          { name: b.title, path: `/library/${b.slug}/` },
        ]}
      />
      <div className="book-detail-grid">
        <div className="book-detail-stage" data-reveal>
          <ObjectStage
            object={{ kind: 'book', cover: b.coverImage, spineColor: b.spineColor ?? '#3F6A4C', title: b.title }}
            name={b.title}
            poster={b.coverImage}
            posterAlt={b.imageAlt}
          />
        </div>
        <div>
          <p className="eyebrow">The Library</p>
          <h1 className="book-detail-title gsap-headline">{b.title}</h1>
          {b.subtitle ? <p className="book-detail-subtitle">{b.subtitle}</p> : null}
          <div className="prose">
            <p className="lead">{b.hook}</p>
          </div>

          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.8rem',
              fontWeight: 350,
              marginTop: '3rem',
              color: 'var(--bone)',
            }}
          >
            What you&rsquo;ll learn
          </h2>
          <ol className="book-learn-list">
            {b.bullets.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>

          {paperback || kindle ? (
            <div className="hero-actions">
              {paperback ? (
                <Button href={paperback} external>
                  Buy the paperback ↗
                </Button>
              ) : null}
              {kindle ? (
                <Button href={kindle} variant={paperback ? 'ghost' : undefined} external>
                  Kindle edition ↗
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="book-detail-soon">
              Coming to Amazon in paperback and Kindle. The listing goes up here the day it is live.
            </p>
          )}

          <div className="prose" style={{ marginTop: '4rem' }}>
            <h2>About the author</h2>
            <p>
              InteriorCleanse is an editorial home project focused on calmer systems,
              warmer minimalism, and practical design decisions that make everyday
              maintenance easier.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
