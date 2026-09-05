import Link from 'next/link'
import { ScrollGalleryLoader } from '@/components/3d/SceneLoaders'
import { ResidenceHero } from '@/components/hero/ResidenceHero'
import { ArticleCard, BookCard, ProductCard } from '@/components/cards'
import { ProductBrowser } from '@/components/browse/ProductBrowser'
import { GuestBook } from '@/components/GuestBook'
import { StaticMark } from '@/components/StaticMark'
import { TrackIcon } from '@/components/TrackIcon'
import { allProducts, articles, mindBooks } from '@/lib/content'
import { getScene, resolveFeatured } from '@/lib/scenes'

const TRUST: { text: string }[] = [
  { text: 'Secure checkout via Amazon & TikTok Shop' },
  { text: 'Hand-poured candles, made with care' },
  { text: 'Books written and published by the founder' },
  { text: 'Free shipping on Printful orders over $75' },
]

export default function Home() {
  const scene = getScene('atrium')
  const featured = allProducts.filter((p) => p.featured)
  const homeProducts = allProducts.filter((p) => p.category === 'cleaning' || p.category === 'print')
  const bodyProducts = allProducts.filter(
    (p) => p.category === 'candle' || p.category === 'tote' || p.category === 'mug'
  )

  return (
    <>
      {/* HERO — layered: poster/video background, hotspots, interface.
          Fully functional with no video files present. */}
      {scene ? (
        <ResidenceHero
          scene={scene}
          featured={resolveFeatured(scene)}
          carousel={featured.slice(0, 6)}
        />
      ) : null}

      {/* TRUST STRIP */}
      <section className="trust-strip" aria-label="Why InteriorCleanse">
        {TRUST.map(({ text }) => (
          <div key={text} className="trust-item">
            <span className="trust-icon">
              <StaticMark size={30} />
            </span>
            <span className="trust-text">{text}</span>
          </div>
        ))}
      </section>

      {/* SWIPE BROWSER — one product at a time over the scene. Every product
          here is also in the plain grid at /shop, never trapped in this UI. */}
      <ProductBrowser products={allProducts} label="Browse the edit" />

      {/* 3D SCROLL GALLERY */}
      <ScrollGalleryLoader products={featured} />

      {/* EDITORIAL TRIPTYCH */}
      <section className="triptych" aria-label="InteriorCleanse editorial">
        {[
          [
            'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=700&q=90',
            'Architectural interior with natural light and minimal furniture',
          ],
          [
            'https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=700&q=90',
            'Warm minimal living room with botanical details',
          ],
          [
            'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=700&q=90',
            'Moody modern bedroom interior',
          ],
        ].map(([src, alt]) => (
          <div key={alt} className="triptych-col">
            <img src={src} alt={alt} loading="lazy" />
          </div>
        ))}
      </section>

      {/* MIND */}
      <section className="track-section track-mind">
        <div className="track-inner">
          <div className="track-text">
            <div className="track-eyebrow-row">
              <TrackIcon name="book" />
              <span className="eyebrow" style={{ color: 'var(--mind-accent)' }}>
                For the mind — the library
              </span>
            </div>
            <h2 className="track-headline">
              Books that change
              <br />
              how you see
              <br />
              <em>your space.</em>
            </h2>
            <p className="track-body-text">
              Interior design and home organizing guides — written for real homes and
              real lives.
            </p>
            <Link href="/library/" className="track-cta">
              Enter the library →
            </Link>
          </div>
          <div
            className="book-grid gsap-stagger"
            style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '2rem', marginTop: 0 }}
          >
            {mindBooks.slice(0, 2).map((book) => (
              <BookCard book={book} key={book.slug} />
            ))}
          </div>
        </div>
      </section>

      {/* HOME */}
      <section className="track-section track-home">
        <div className="track-inner reverse">
          <div className="track-text">
            <div className="track-eyebrow-row">
              <TrackIcon name="sparkle" />
              <span className="eyebrow" style={{ color: 'var(--home-accent)' }}>
                For the home — the edit
              </span>
            </div>
            <h2 className="track-headline">
              Cleaning and
              <br />
              organizing,
              <br />
              <em>considered.</em>
            </h2>
            <p className="track-body-text">
              Viral TikTok cleaning picks and curated home products — hand-selected for
              how they actually work.
            </p>
            <Link href="/shop/#home" className="track-cta">
              Shop the home edit →
            </Link>
          </div>
          <div
            className="product-grid gsap-stagger"
            style={{ gridTemplateColumns: '1fr 1fr', marginTop: 0 }}
          >
            {homeProducts.slice(0, 2).map((p, i) => (
              <ProductCard product={p} index={i} key={p.slug} />
            ))}
          </div>
        </div>
      </section>

      {/* BODY */}
      <section className="track-section track-body">
        <div className="track-inner">
          <div className="track-text">
            <div className="track-eyebrow-row">
              <TrackIcon name="flame" />
              <span className="eyebrow" style={{ color: 'var(--body-accent)' }}>
                For the body — the ritual
              </span>
            </div>
            <h2 className="track-headline">
              Objects made
              <br />
              to be
              <br />
              <em>lived with.</em>
            </h2>
            <p className="track-body-text">
              Hand-poured candles, considered apparel, and objects that earn their place
              in your home.
            </p>
            <Link href="/shop/#body" className="track-cta">
              Shop body &amp; ritual →
            </Link>
          </div>
          <div
            className="product-grid gsap-stagger"
            style={{ gridTemplateColumns: '1fr 1fr', marginTop: 0 }}
          >
            {bodyProducts.slice(0, 2).map((p, i) => (
              <ProductCard product={p} index={i} key={p.slug} />
            ))}
          </div>
        </div>
      </section>

      {/* SPIRIT */}
      <section className="track-section track-spirit">
        <div className="track-inner reverse">
          <div className="track-text">
            <div className="track-eyebrow-row">
              <TrackIcon name="star" />
              <span className="eyebrow" style={{ color: 'var(--spirit-accent)' }}>
                For the spirit — the faith library
              </span>
            </div>
            <h2 className="track-headline">
              Books for a
              <br />
              life rooted
              <br />
              <em>in faith.</em>
            </h2>
            <p className="track-body-text">
              Christian books, Bibles, kids coloring books, and devotionals — for every
              member of the family.
            </p>
            <Link href="/spirit/" className="track-cta">
              Enter the faith library →
            </Link>
          </div>
          <div className="spirit-orb-wrap" data-reveal>
            <div className="spirit-orb" />
          </div>
        </div>
      </section>

      {/* MANIFESTO */}
      <section className="manifesto-section" data-reveal>
        <p className="manifesto-text">
          &ldquo;We believe a well-kept home is the foundation of a well-kept life. We
          believe in all four — <em>mind, home, body, and spirit</em> — considered
          together.&rdquo;
        </p>
        <span className="manifesto-attribution">— THE INTERIORCLEANSE PHILOSOPHY</span>
      </section>

      {/* JOURNAL */}
      {articles.length > 0 ? (
        <section className="section" style={{ background: 'var(--ink)' }}>
          <div className="section-inner">
            <div className="section-header">
              <p className="eyebrow">The journal</p>
              <h2 className="gsap-headline">
                Notes on a
                <br />
                <em>considered life.</em>
              </h2>
            </div>
            <div className="grid-2">
              {articles.slice(0, 2).map((a) => (
                <ArticleCard article={a} key={a.slug} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* EMAIL CAPTURE */}
      <section className="email-capture-section">
        <div className="email-capture-inner">
          <p className="eyebrow">Private correspondence</p>
          <h2>
            The next edit,
            <br />
            <em>quietly delivered.</em>
          </h2>
          <GuestBook scene={getScene('guestbook')} />
        </div>
      </section>
    </>
  )
}
