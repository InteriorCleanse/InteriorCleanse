'use client'

import dynamic from 'next/dynamic'

const BabylonViewer = dynamic(
  () => import('./BabylonViewer').then((m) => m.BabylonViewer),
  {
    ssr: false,
    loading: () => <div className="stage-fallback">Preparing scene…</div>,
  }
)

export function BabylonViewerLoader(props: {
  productColor?: string
  accentColor?: string
  label?: string
  height?: number | string
}) {
  return <BabylonViewer {...props} />
}
