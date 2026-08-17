'use client'

import dynamic from 'next/dynamic'
import { InView } from './InView'
import type { LottieIconName } from './LottieIcon'

/**
 * The animated mark that heads each brand track.
 *
 * The Lottie runtime is a dynamic import behind a visibility gate: it was a
 * static import, which put the whole player in the shared chunk and created a
 * canvas per icon on first paint — four of them in the trust strip alone,
 * above the fold, before anything had been scrolled to.
 */
const LottieIcon = dynamic(() => import('./LottieIcon').then((m) => m.LottieIcon), {
  ssr: false,
  loading: () => null,
})

export function TrackIcon({ name, size = 34 }: { name: LottieIconName; size?: number }) {
  return (
    <InView
      rootMargin="150px"
      // Reserves the icon's box so nothing shifts when the player arrives.
      style={{ width: size, height: size, display: 'inline-block' }}
      placeholder={<span style={{ display: 'block', width: size, height: size }} aria-hidden="true" />}
    >
      <LottieIcon name={name} width={size} height={size} />
    </InView>
  )
}
