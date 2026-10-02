import type { Metadata, Viewport } from 'next'
import { Archivo } from 'next/font/google'
import { headers } from 'next/headers'
import { Shell } from '@/components/Shell'
import './globals.css'

// One family at two widths: expanded for headlines, normal for reading.
const sans = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-sans', display: 'swap' })

const indexable = process.env.AVANT_INDEXABLE === '1'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: { default: 'AVANT — Book the exact car you want', template: '%s · AVANT' },
  description: 'Peer-to-peer car sharing with the whole price up front, coverage in one number, one-time licence verification and a 24/7 AI concierge.',
  robots: indexable ? undefined : { index: false, follow: false },
  openGraph: { title: 'AVANT', description: 'Book the exact car you want, from a neighbour.', type: 'website' },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the nonce makes every page dynamic, which is what lets each
  // response carry its own CSP nonce.
  await headers()
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  )
}
