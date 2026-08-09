import type { Metadata } from 'next'
import { branding } from '@/lib/env'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: `${branding.appName()} — Know what is making money`,
    template: `%s · ${branding.appName()}`,
  },
  description:
    'A business operating system that shows what is making money, what is wasting money, and what to do next.',
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
