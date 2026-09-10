'use client'

import dynamic from 'next/dynamic'

const BabylonViewer = dynamic(
  () => import('./BabylonViewer').then((m) => m.BabylonViewer),
  {
    ssr: false,
    loading: () => <div className="stage-fallback">Preparing scene…</div>,
  }
)

/**
 * Client boundary for the Babylon scene.
 *
 * The wrapper is not decoration: `dynamic`'s `loading` element is defined at
 * module scope and cannot see the requested height, so the placeholder used to
 * fall back to its own 320px minimum and then jump to 440px when the engine
 * arrived — 0.07 of layout shift on a page that otherwise measures 0. Reserving
 * the box here and letting both states fill it removes the shift at the source.
 */
export function BabylonViewerLoader({
  height = 440,
  ...props
}: {
  productColor?: string
  accentColor?: string
  label?: string
  height?: number | string
}) {
  return (
    <div style={{ height }}>
      <BabylonViewer {...props} height="100%" />
    </div>
  )
}
