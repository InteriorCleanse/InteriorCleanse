import type { Metadata } from 'next'
import { ProductCard } from '@/components/cards'
import { DisclosureBox, PageHero } from '@/components/ui'
import { allProducts } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Shop the Edit',
  description:
    'Curated cleaning picks, hand-poured candles, prints, mugs and apparel — objects selected for how beautifully they serve.',
}

export default function Shop() {
  const homeProducts = allProducts.filter((p) => p.category === 'cleaning')
  const bodyProducts = allProducts.filter((p) =>
    ['candle', 'tote', 'print', 'mug', 'custom'].includes(p.category)
  )

  return (
    <>
      <PageHero
        eyebrow={`The object index / ${allProducts.length} objects / 2026`}
        title={
          <>
            For the home.
            <br />
            <em>For the body.</em>
          </>
        }
        sub="Objects selected not for novelty, but for how beautifully they serve."
      />

      <section id="home" className="section" style={{ background: 'var(--home-bg)' }}>
        <div className="section-inner">
          <div className="section-header">
            <p className="eyebrow" style={{ color: 'var(--home-accent)' }}>
              For the home
            </p>
            <h2 className="gsap-headline">
              Cleaning and organizing,{' '}
              <em style={{ color: 'var(--home-accent)' }}>considered.</em>
            </h2>
          </div>
          <div className="product-grid gsap-stagger" style={{ marginTop: 0 }}>
            {homeProducts.map((p, i) => (
              <ProductCard product={p} index={i} key={p.slug} />
            ))}
          </div>
        </div>
      </section>

      <section id="body" className="section" style={{ background: 'var(--body-bg)' }}>
        <div className="section-inner">
          <div className="section-header">
            <p className="eyebrow" style={{ color: 'var(--body-accent)' }}>
              For the body
            </p>
            <h2 className="gsap-headline">
              Objects made to be{' '}
              <em style={{ color: 'var(--body-accent)' }}>lived with.</em>
            </h2>
          </div>
          <div className="product-grid gsap-stagger" style={{ marginTop: 0 }}>
            {bodyProducts.map((p, i) => (
              <ProductCard product={p} index={i} key={p.slug} />
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
