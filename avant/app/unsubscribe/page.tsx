import type { Metadata } from 'next'
import { Unsubscribe } from '@/components/Unsubscribe'

export const metadata: Metadata = { title: 'Email settings', robots: { index: false } }

export default function Page() {
  return (
    <div className="page page-narrow" style={{ maxWidth: 520 }}>
      <Unsubscribe />
    </div>
  )
}
