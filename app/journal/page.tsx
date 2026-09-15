import type { Metadata } from 'next'
import { ArticleCard } from '@/components/cards'
import { PageHero } from '@/components/ui'
import { articles } from '@/lib/content'

export const metadata: Metadata = {
  title: 'The Journal',
  description:
    'Editorial notes from InteriorCleanse on home rituals, cleaning edits, evening resets, and the small decisions that make a quieter home.',
  alternates: { canonical: '/journal/' },
}

export default function Journal() {
  return (
    <>
      <PageHero
        eyebrow="The journal"
        title={
          <>
            Editorial notes for a
            <br />
            <em>quieter home.</em>
          </>
        }
      />
      <section className="section" style={{ background: 'var(--ink)' }}>
        <div className="section-inner">
          <div className="grid-2">
            {articles.map((a) => (
              <ArticleCard article={a} key={a.slug} />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
