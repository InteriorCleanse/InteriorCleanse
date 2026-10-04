import type { Metadata, Viewport } from 'next'
import './globals.css'
import { MatrixRain } from '@/components/MatrixRain'
import { CartProvider } from '@/components/CartProvider'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { CartDrawer } from '@/components/CartDrawer'
import { Toast } from '@/components/Toast'

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gcodekeys.com'

export const viewport: Viewport = {
  themeColor: '#020604',
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'GCode Keys — custom car keys, cut like code',
    template: '%s · GCode Keys',
  },
  description:
    'Build a custom car key fob, pick the finish, engrave it, and we cut and code it to your exact vehicle. Flat price, shown before you buy. The code that cuts.',
  openGraph: {
    title: 'GCode Keys',
    description: 'Custom car keys, cut like code. Flat price, shown before you buy.',
    url: SITE,
    siteName: 'GCode Keys',
    type: 'website',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <CartProvider>
          <MatrixRain />
          <div id="veil" aria-hidden="true" />
          <SiteHeader />
          {children}
          <SiteFooter />
          <CartDrawer />
          <Toast />
        </CartProvider>
      </body>
    </html>
  )
}
