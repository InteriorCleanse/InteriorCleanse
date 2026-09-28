import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Reveal } from '@/components/Reveal'
import { SITE } from '@/lib/site'

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name}. ${SITE.tagline}`, template: `%s. ${SITE.name}` },
  description: SITE.description,
  icons: { icon: '/brand/favicon.svg' },
  openGraph: { type: 'website', siteName: SITE.name },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f3f0' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1115' },
  ],
  width: 'device-width',
  initialScale: 1,
}

const plausible = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ProfessionalService',
  name: SITE.name,
  slogan: SITE.tagline,
  description: SITE.description,
  url: SITE.url,
  email: SITE.email,
  logo: `${SITE.url}/brand/favicon.svg`,
  knowsAbout: ['Software development', 'Email security', 'DMARC', 'Family office technology', 'Next.js'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="no-js">
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.remove('no-js')" }} />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-plate focus:px-3 focus:py-2">
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <Reveal />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {plausible && <Script data-domain={plausible} src="https://plausible.io/js/script.outbound-links.js" strategy="afterInteractive" />}
      </body>
    </html>
  )
}
