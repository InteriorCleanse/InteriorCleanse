import type { Metadata } from 'next'
import { ArticleCard } from '@/components/cards'
import { PageHero } from '@/components/ui'
import { articles } from '@/lib/content'

export const metadata: Metadata = {
  title: 'The Journal',
  description: 'Editorial notes on home rituals, cleaning edits, and a quieter home.',
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
