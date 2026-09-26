import type { Metadata } from 'next'
import Link from 'next/link'
import { ScrollGalleryLoader } from '@/components/3d/SceneLoaders'
import { ResidenceHero } from '@/components/hero/ResidenceHero'
import { ArticleCard, BookCard, ProductCard } from '@/components/cards'
import { ProductBrowser } from '@/components/browse/ProductBrowser'
import { Marquee } from '@/components/motion/Marquee'
import { TrackScene } from '@/components/TrackScene'
import { ArrowOrb } from '@/components/ui/ArrowOrb'
import { GuestBook } from '@/components/GuestBook'
import { LineIcon, type IconName } from '@/components/icons/LineIcon'
import { TrackIcon } from '@/components/TrackIcon'
import { allProducts, articles, mindBooks } from '@/lib/content'
import { getScene, resolveFeatured } from '@/lib/scenes'

// `trailingSlash: true` means the canonical form of every URL carries one.
// Each page declares its own; a site-wide canonical of '/' told search engines
// every page was a copy of the homepage.
export const metadata: Metadata = { alternates: { canonical: '/' } }

const TRUST: { text: string; icon: IconName }[] = [
  { text: 'Secure checkout via Amazon & TikTok Shop', icon: 'shield' },
  { text: 'Hand-poured candles, made with care', icon: 'flame' },
  { text: 'Books written and published by the founder', icon: 'book' },
  { text: 'Free shipping on Printful orders over $75', icon: 'ship' },
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
        {TRUST.map(({ text, icon }) => (
          <div key={text} className="trust-item">
            <span className="trust-icon">
              <LineIcon name={icon} size={22} />
            </span>
            <span className="trust-text">{text}</span>
          </div>
        ))}
      </section>

      {/* SWIPE BROWSER — one product at a time over the scene. Every product
          here is also in the plain grid at /shop, never trapped in this UI. */}
      <ProductBrowser
        products={allProducts}
        label="Browse the edit"
        backdrop={getScene('showroom')?.posterImage ?? null}
      />

      {/* Editorial ticker — the range at a glance, and the moment the page
          reads as considered rather than templated. */}
      <Marquee
        items={[
          'Hand-poured candles',
          'Considered objects',
          'Books by the founder',
          'Digital downloads',
          'A calmer home',
          'Wall art',
          'The edit',
        ]}
      />

      {/* 3D SCROLL GALLERY */}
      <ScrollGalleryLoader products={featured} />

      {/* EDITORIAL TRIPTYCH */}
      <section className="triptych" aria-label="InteriorCleanse editorial" data-cursor-label="Editorial">
        {[
          [
            'https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260925_224901_39dacf9b-ba7d-4cc7-ae1f-a812ae30cc77.png',
            'A pale oak console with a hand-poured candle and a stack of linen-bound books in morning light',
          ],
          [
            'https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260925_224901_3ec3cf93-a32b-49c0-aead-249d0bcb268e.png',
            'A bed dressed in washed oatmeal linen in a calm sunlit bedroom',
          ],
          [
            'https://d8j0ntlcm91z4.cloudfront.net/user_3HcoDUttWldZsray5X12PGDUTBl/hf_20260925_224901_a9fbe1d6-8801-4663-8d17-6e026debf376.png',
            'A limestone kitchen counter with a stoneware mug and folded linen',
          ],
        ].map(([src, alt]) => (
          <div key={alt} className="triptych-col">
            <img src={src} alt={alt} loading="lazy" />
          </div>
        ))}
      </section>

      {/* MIND */}
      <section className="track-section track-mind" data-cursor-label="The library">
        <TrackScene scene={getScene('library')} />
        <div className="track-inner">
          <div className="track-text">
            <div className="track-eyebrow-row">
              <TrackIcon name="book" />
              <span className="eyebrow" style={{ color: 'var(--mind-accent)' }}>
                For the mind — the library
              </span>
            </div>
            <span className="rule-draw" aria-hidden="true" />
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
              Enter the library
              <ArrowOrb />
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
      <section className="track-section track-home" data-cursor-label="The edit">
        <TrackScene scene={getScene('atrium')} />
        <div className="track-inner reverse">
          <div className="track-text">
            <div className="track-eyebrow-row">
              <TrackIcon name="sparkle" />
              <span className="eyebrow" style={{ color: 'var(--home-accent)' }}>
                For the home — the edit
              </span>
            </div>
            <span className="rule-draw" aria-hidden="true" />
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
              Shop the home edit
              <ArrowOrb />
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
      <section className="track-section track-body" data-cursor-label="The ritual">
        <TrackScene scene={getScene('conservatory')} />
        <div className="track-inner">
          <div className="track-text">
            <div className="track-eyebrow-row">
              <TrackIcon name="flame" />
              <span className="eyebrow" style={{ color: 'var(--body-accent)' }}>
                For the body — the ritual
              </span>
            </div>
            <span className="rule-draw" aria-hidden="true" />
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
              Shop body &amp; ritual
              <ArrowOrb />
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
      <section className="track-section track-spirit" data-cursor-label="The faith library">
        <TrackScene scene={getScene('chapel')} />
        <div className="track-inner reverse">
          <div className="track-text">
            <div className="track-eyebrow-row">
              <TrackIcon name="star" />
              <span className="eyebrow" style={{ color: 'var(--spirit-accent)' }}>
                For the spirit — the faith library
              </span>
            </div>
            <span className="rule-draw" aria-hidden="true" />
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
              Enter the faith library
              <ArrowOrb />
            </Link>
          </div>
          {/* The threshold, in the spirit's colour: the same doorway-and-sun as
              the mark, breathing slowly. The room's chapel footage plays behind. */}
          <div className="spirit-threshold-wrap" data-reveal>
            <svg className="spirit-threshold" viewBox="0 0 48 48" aria-hidden="true">
              <defs>
                <linearGradient id="spirit-sun" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E6CB96" />
                  <stop offset="100%" stopColor="#8E6FB0" />
                </linearGradient>
                <radialGradient id="spirit-glow" cx="50%" cy="68%" r="55%">
                  <stop offset="0%" stopColor="#E6CB96" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#E6CB96" stopOpacity="0" />
                </radialGradient>
                <clipPath id="spirit-clip">
                  <rect x="12" y="18" width="24" height="14" />
                </clipPath>
              </defs>
              <circle className="spirit-glow" cx="24" cy="32" r="18" fill="url(#spirit-glow)" />
              <g fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round">
                <path d="M11 42 V23 A13 13 0 0 1 37 23 V42" />
                <path d="M8.5 42 H39.5" opacity="0.5" />
                <path d="M17.5 32 H30.5" />
              </g>
              <g clipPath="url(#spirit-clip)">
                <circle className="spirit-sun" cx="24" cy="32" r="5" fill="url(#spirit-sun)" />
              </g>
              <g stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.7">
                <path d="M24 19.5 V22.5" />
                <path d="M17.6 22.4 L19.8 24.6" />
                <path d="M30.4 22.4 L28.2 24.6" />
              </g>
            </svg>
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
