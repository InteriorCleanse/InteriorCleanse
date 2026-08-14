import type { Metadata } from 'next'
import './globals.css'
import { Footer, Header } from '@/components/layout'
import { Experience } from '@/components/Experience'
import { EmailPopup } from '@/components/EmailPopup'
import { GSAPAnimations } from '@/components/GSAPAnimations'
import { PageTransition } from '@/components/PageTransition'
import { SmoothScroll } from '@/components/SmoothScroll'
import { CartDrawer, CartProvider } from '@/components/cart'
import { OrganizationLd, WebSiteLd } from '@/components/StructuredData'
import { BRAND_NAME, PLAUSIBLE_DOMAIN, SITE } from '@/lib/site-config'

export const metadata: Metadata = {
  title: {
    default: `${BRAND_NAME} — For Mind, Home, Body & Spirit`,
    template: `%s | ${BRAND_NAME}`,
  },
  description:
    'InteriorCleanse: a curated editorial storefront for home care, interior design books, candles, and wellness — for mind, home, body and spirit.',
  metadataBase: new URL(SITE.url),
  openGraph: {
    type: 'website',
    siteName: BRAND_NAME,
    title: `${BRAND_NAME} — ${SITE.tagline}`,
    description:
      'Curated cleaning finds, interior design books, hand-poured candles, and Christian literature.',
    url: SITE.url,
    images: [{ url: '/images/og-image.png', width: 1200, height: 630, alt: BRAND_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/images/og-image.png'],
  },
  // `trailingSlash: true` means the canonical form of every URL carries one.
  alternates: { canonical: '/' },
  // The .ico carries 16/32/48 of the flowing-C silhouette only. The rose and
  // vase from the master are fine graphite work and turn to mud below ~48px,
  // so small marks come from the hand-drawn vector, never a shrunk raster.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/brand/flowing-c-dark.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/images/apple-touch-icon.png', sizes: '180x180' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <OrganizationLd />
        <WebSiteLd />
        <CartProvider>
          <Experience />
          <GSAPAnimations />
          <EmailPopup />
          <Header />
          <CartDrawer />
          <PageTransition>
            <SmoothScroll>
              <main id="main">{children}</main>
            </SmoothScroll>
          </PageTransition>
          <Footer />
        </CartProvider>
        {PLAUSIBLE_DOMAIN ? (
          <script defer data-domain={PLAUSIBLE_DOMAIN} src="https://plausible.io/js/script.js" />
        ) : null}
      </body>
    </html>
  )
}
