import { ImageResponse } from 'next/og'
import { getCatalogProduct, publishedProducts } from '@/lib/catalog'
import { getScene, type SceneId } from '@/lib/scenes'
import { SITE } from '@/lib/site-config'

export const runtime = 'nodejs'
export const alt = 'InteriorCleanse'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export function generateStaticParams() {
  return publishedProducts().map((p) => ({ slug: p.slug }))
}

/** True only for a URL that answers 200 right now — a missing poster is skipped, not embedded as a broken tile. */
async function reachable(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  const abs = url.startsWith('/') ? `${SITE.url}${url}` : url
  try {
    const res = await fetch(abs, { method: 'HEAD', cache: 'no-store' })
    return res.ok ? abs : null
  } catch {
    return null
  }
}

/**
 * The social card: the product standing in its environment.
 *
 * The environment poster is the backdrop when it exists, the site's ink
 * gradient when it does not; the product image sits on the right on a soft
 * plinth, and the name and price on the left in bone. Everything degrades to
 * a typeset card rather than a broken one, because a share card is often the
 * first thing a stranger sees.
 */
export default async function OpenGraphImage({ params }: { params: { slug: string } }) {
  const p = getCatalogProduct(params.slug)
  const scene = p ? getScene(p.environment as SceneId) : undefined
  const [poster, hero] = await Promise.all([
    reachable(scene?.posterImage),
    reachable(p?.images.transparent ?? p?.images.hero),
  ])
  const price =
    p && p.price > 0
      ? p.purchaseType === 'stripe' || p.purchaseType === 'gumroad'
        ? `$${p.price % 1 === 0 ? p.price : p.price.toFixed(2)}`
        : `From $${p.price}`
      : ''

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: 'radial-gradient(120% 90% at 65% 40%, #2a231c 0%, #14110e 55%, #0A0A0A 100%)',
          fontFamily: 'Georgia, serif',
          color: '#F7F4EF',
        }}
      >
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" width={1200} height={630} style={{ position: 'absolute', inset: 0, objectFit: 'cover' }} />
        ) : null}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(100deg, rgba(10,10,10,0.88) 0%, rgba(10,10,10,0.7) 35%, rgba(10,10,10,0.25) 62%, rgba(10,10,10,0.1) 100%)',
          }}
        />
        <div style={{ position: 'absolute', left: 72, top: 64, display: 'flex', alignItems: 'center', gap: 14, fontSize: 22, letterSpacing: 6 }}>
          <span>INTERIOR</span>
          <span style={{ color: '#A9895A' }}>◇</span>
          <span>CLEANSE</span>
        </div>
        <div style={{ position: 'absolute', left: 72, bottom: 84, display: 'flex', flexDirection: 'column', maxWidth: 620 }}>
          <div style={{ fontSize: 18, letterSpacing: 5, color: '#A9895A', textTransform: 'uppercase', marginBottom: 18 }}>
            {p ? `${p.category} · the ${p.environment}` : 'The Collection'}
          </div>
          <div style={{ fontSize: 60, lineHeight: 1.02, letterSpacing: -1.5 }}>{p?.name ?? 'InteriorCleanse'}</div>
          {price ? <div style={{ fontSize: 30, marginTop: 22, color: 'rgba(247,244,239,0.8)' }}>{price}</div> : null}
        </div>
        {hero ? (
          <div
            style={{
              position: 'absolute',
              right: 88,
              top: 95,
              width: 400,
              height: 440,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <div style={{ position: 'absolute', bottom: 8, width: 300, height: 34, borderRadius: 150, background: 'rgba(0,0,0,0.55)', filter: 'blur(14px)' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero} alt="" width={400} height={420} style={{ objectFit: 'contain', filter: 'drop-shadow(0 30px 40px rgba(0,0,0,0.5))' }} />
          </div>
        ) : null}
      </div>
    ),
    { ...size }
  )
}
