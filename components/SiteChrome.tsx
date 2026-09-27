'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
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
import { CartDrawer } from '@/components/cart'
import { isDrivePath } from '@/lib/drive/routes'

/**
 * The storefront's chrome: header, footer, cart drawer, intro veil, cursor,
 * smooth scrolling and page transitions.
 *
 * Drive (/drive/) is a separate application with its own frame, so under
 * that path none of this mounts and the page renders bare inside <main>.
 * Everything else is exactly what the root layout rendered before.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (isDrivePath(pathname)) {
    return <main id="main">{children}</main>
  }

  return (
    <>
      <IntroVeil />
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
    </>
  )
}
