import type { Metadata } from 'next'
import { AccountSettings } from '@/components/drive/Account'
import { DRIVE } from '@/lib/drive/routes'

export const metadata: Metadata = {
  title: 'Account',
  description: 'Your name, theme and units, and the data Drive keeps on this device: export it, import it, or clear it.',
  alternates: { canonical: DRIVE.account },
}

export default function AccountPage() {
  return (
    <div className="dr-container dr-page dr-page-narrow">
      <h1 className="dr-h1">Account</h1>
      <AccountSettings />
    </div>
  )
}
