import type { Metadata } from 'next'
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

// Self-hosted and preloaded by Next. `display: swap` means text paints in the
// fallback immediately rather than blocking on the webfont, which is what was
// holding LCP hostage behind a third-party stylesheet.
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  // SOFT rounds the serifs and WONK unlocks the swash alternates the italic
  // emphasis words use; both are what make the display face read as couture
  // rather than default-serif.
  axes: ['opsz', 'SOFT', 'WONK'],
})

// A humanist grotesk with real optical warmth, in place of the default UI
// sans every generated site ships with.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
})
import { Footer, Header } from '@/components/layout'
import { Experience } from '@/components/Experience'
import { GuestBookModal } from '@/components/GuestBookModal'
import { GSAPAnimations } from '@/components/GSAPAnimations'
import { PageTransition } from '@/components/PageTransition'
import { SmoothScroll } from '@/components/SmoothScroll'
import { GlobeCursorGlobal } from '@/components/cursor/GlobeCursorGlobal'
import { ScrollProgress } from '@/components/motion/ScrollProgress'
import { IntroVeil } from '@/components/motion/IntroVeil'
import { MagneticButtons } from '@/components/motion/MagneticButtons'
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
  // The .ico carries 16/32/48 of the threshold mark, rendered from the same
  // geometry as the inline SVG so the tab icon and the header agree.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/brand/monogram.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/images/apple-touch-icon.png', sizes: '180x180' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${jakarta.variable}`}>
      <head>
        {/* Runs before first paint: a visitor who has already seen the intro
            this session gets the page immediately, with no veil flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(sessionStorage.getItem('ic_intro'))document.documentElement.dataset.intro='skip'}catch(e){}",
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <IntroVeil />
        <OrganizationLd />
        <WebSiteLd />
        <CartProvider>
          <Experience />
          <GSAPAnimations />
          <GuestBookModal />
          <Header />
          <CartDrawer />
          <ScrollProgress />
          <GlobeCursorGlobal />
          <MagneticButtons />
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
