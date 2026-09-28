'use client'

import dynamic from 'next/dynamic'

const GlbStage = dynamic(() => import('./GlbStage').then((m) => m.GlbStage), {
  ssr: false,
  loading: () => <div className="glb-stage" data-state="loading" aria-hidden="true" />,
})

export function GlbStageLoader(props: { url: string; name: string; poster?: string }) {
  return <GlbStage {...props} />
}
