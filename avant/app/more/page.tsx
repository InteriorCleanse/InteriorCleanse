import type { Metadata } from 'next'
import { More } from '@/components/More'

export const metadata: Metadata = { title: 'More' }

export default function MorePage() {
  return (
    <div className="wrap page" style={{ maxWidth: 720 }}>
      <h1 className="app-title">More</h1>
      <More />
    </div>
  )
}
