import type { Metadata } from 'next'
import { SavedList } from '@/components/drive/HomeExtras'
import { DRIVE } from '@/lib/drive/routes'

export const metadata: Metadata = {
  title: 'Saved cars',
  description: 'The cars you have hearted, kept on this device with no sign-in.',
  alternates: { canonical: DRIVE.saved },
}

export default function SavedPage() {
  return (
    <div className="dr-container dr-page">
      <h1 className="dr-h1">Saved</h1>
      <SavedList />
    </div>
  )
}
