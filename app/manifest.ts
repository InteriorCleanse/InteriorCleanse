import type { MetadataRoute } from 'next'
import { BRAND_NAME, SITE } from '@/lib/site-config'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND_NAME} — ${SITE.tagline}`,
    short_name: BRAND_NAME,
    description:
      'Curated objects, interior design books, and considered home goods.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A0A0A',
    theme_color: '#1C1A17',
    icons: [
      { src: '/images/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/images/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Maskable art keeps the mark inside the 40% safe radius Android crops to.
      { src: '/images/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/images/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
