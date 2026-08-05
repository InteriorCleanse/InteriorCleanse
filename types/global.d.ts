import type Lenis from 'lenis'

declare global {
  interface Window {
    /** Published by <SmoothScroll> so ScrollTrigger can share its RAF loop. */
    __lenis?: Lenis
  }
}

export {}
