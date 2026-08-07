import type { Metadata } from 'next'
import './globals.css'
import { Footer, Header } from '@/components/layout'
import { Experience } from '@/components/Experience'
import { EmailPopup } from '@/components/EmailPopup'
import { GSAPAnimations } from '@/components/GSAPAnimations'
import { PageTransition } from '@/components/PageTransition'
import { SmoothScroll } from '@/components/SmoothScroll'
import { CartDrawer, CartProvider } from '@/components/cart'
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
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
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
