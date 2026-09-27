import type { Metadata } from 'next'
import { HelpCenter } from '@/components/drive/Help'
import { DRIVE } from '@/lib/drive/routes'

export const metadata: Metadata = {
  title: 'Help',
  description: 'How pricing, protection, cancellation and hosting work on Drive, plus every keyboard shortcut.',
  alternates: { canonical: DRIVE.help },
}

export default function HelpPage() {
  return (
    <div className="dr-container dr-page dr-page-narrow">
      <h1 className="dr-h1">Help</h1>
      <HelpCenter />
    </div>
  )
}
