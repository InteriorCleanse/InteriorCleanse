import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { articles, getArticle } from '@/lib/content'

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const a = getArticle(params.slug)
  if (!a) return { title: 'Journal' }
  return { title: a.title, description: a.excerpt }
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const a = getArticle(params.slug)
  if (!a) notFound()

  return (
    <section className="section" style={{ paddingTop: 'calc(var(--header-h) + 6rem)' }}>
      <article className="article-body">
        <p className="eyebrow">{a.eyebrow}</p>
        <h1
          className="gsap-headline"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
            fontWeight: 320,
            lineHeight: 0.95,
            letterSpacing: '-0.04em',
            color: 'var(--bone)',
            marginTop: '1.5rem',
          }}
        >
          {a.title}
        </h1>
        <p className="article-meta">
          <time dateTime={a.date}>{a.date}</time>
        </p>
        <img src={a.image} alt={a.imageAlt} className="article-hero-image" />
        <div className="prose">
          {a.body.map((p, i) => (
            <p key={p} className={i === 0 ? 'prose-dropcap lead' : undefined}>
              {p}
            </p>
          ))}
        </div>
      </article>
    </section>
  )
}
