import type { Metadata } from 'next'
import Link from 'next/link'
import { ShopBrowser } from '@/components/product/ShopBrowser'
import { EnvironmentHero } from '@/components/hero/EnvironmentHero'
import { DisclosureBox } from '@/components/ui'
import { COLLECTIONS } from '@/lib/collections'
import { allProducts } from '@/lib/content'
import { getScene } from '@/lib/scenes'

export const metadata: Metadata = {
  title: 'Shop the Edit',
  description:
    'Curated cleaning picks, hand-poured candles, prints, mugs and apparel — objects selected for how beautifully they serve.',
}

export default function Shop() {
  const sunroom = getScene('sunroom')
  const gallery = getScene('gallery')
  const atelier = getScene('atelier')

  return (
    <>
      {sunroom ? <EnvironmentHero scene={sunroom} height="band" id="home" /> : null}

      {/* One grid, driven by the filters. The old split into fixed "for the
          home" and "for the body" sections is now the collection nav — showing
          both would mean a search for "candle" still rendered the whole
          catalogue underneath the filtered result. */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="section-inner">
          <nav className="collection-nav" aria-label="Collections">
            {COLLECTIONS.map((c) => (
              <Link key={c.slug} href={`/shop/${c.slug}/`}>
                {c.title}
              </Link>
            ))}
          </nav>

          <ShopBrowser products={allProducts} />

          <div style={{ marginTop: '5rem' }}>
            <DisclosureBox />
          </div>
        </div>
      </section>

      {gallery ? (
        <EnvironmentHero scene={gallery} height="band" id="digital" headingLevel="h2" />
      ) : null}
      {atelier ? <EnvironmentHero scene={atelier} height="band" id="body" headingLevel="h2" /> : null}
    </>
  )
}
