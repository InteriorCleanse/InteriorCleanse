import type { Metadata } from 'next'
import { Inbox } from '@/components/Inbox'

export const metadata: Metadata = { title: 'Inbox', robots: { index: false } }

export default function InboxPage() {
  return (
    <div className="wrap page" style={{ maxWidth: 880 }}>
      <h1 className="app-title">Inbox</h1>
      <Inbox />
    </div>
  )
}
