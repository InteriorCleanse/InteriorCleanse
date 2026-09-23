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

// JARVIS is the default look. The inline script runs before paint so there is
// no flash: it honours a saved choice from a future theme switcher, and falls
// back to jarvis. Wrapped in try/catch because storage can throw in private
// windows, and a theme preference is never worth failing a page load over.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('aurelis-theme');document.documentElement.setAttribute('data-theme',t||'jarvis')}catch(e){document.documentElement.setAttribute('data-theme','jarvis')}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="jarvis" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
