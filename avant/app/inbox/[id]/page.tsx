import type { Metadata } from 'next'
import { Thread } from '@/components/Inbox'

export const metadata: Metadata = { title: 'Conversation', robots: { index: false } }

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="wrap page" style={{ maxWidth: 820, paddingBottom: 24 }}>
      <Thread id={(await params).id} />
    </div>
  )
}
