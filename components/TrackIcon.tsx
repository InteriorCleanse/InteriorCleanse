'use client'

import { LottieIcon, type LottieIconName } from './LottieIcon'

/**
 * The animated mark that heads each brand track. Thin wrapper so pages (which
 * are Server Components) can drop one in without pulling the Lottie player
 * into their own bundle.
 */
export function TrackIcon({
  name,
  size = 34,
}: {
  name: LottieIconName
  size?: number
}) {
  return <LottieIcon name={name} width={size} height={size} />
}
