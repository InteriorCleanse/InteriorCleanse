import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui'
import { allBooks, getBook } from '@/lib/content'

export function generateStaticParams() {
  return allBooks.map((b) => ({ slug: b.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const b = getBook(params.slug)
  if (!b) return { title: 'Book' }
  return { title: b.title, description: b.hook }
}

export default function BookPage({ params }: { params: { slug: string } }) {
  const b = getBook(params.slug)
  if (!b) notFound()

  return (
    <section
      className="section"
      style={{
        background: b.track === 'health' ? '#0D1B2A' : 'var(--mind-bg)',
        paddingTop: 'calc(var(--header-h) + 6rem)',
      }}
    >
      <div className="book-detail-grid">
        <img
          src={b.coverImage}
          alt={b.imageAlt}
          className="book-detail-cover"
          data-reveal
        />
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

          <div className="hero-actions">
            <Button href={b.paperbackUrl} external>
              Buy the paperback ↗
            </Button>
            <Button href={b.kindleUrl} variant="ghost" external>
              Kindle edition ↗
            </Button>
          </div>

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
