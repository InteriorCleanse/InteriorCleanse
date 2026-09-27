import type { Metadata } from 'next'
import { DriveShell } from '@/components/drive/DriveShell'
import { DRIVE_INDEXABLE, DRIVE_NAME, DRIVE_TAGLINE } from '@/lib/drive/config'
import './drive.css'

export const metadata: Metadata = {
  title: { default: DRIVE_NAME, template: `%s · ${DRIVE_NAME}` },
  description: `${DRIVE_TAGLINE} Search by city and dates, see the whole price before you book, and manage trips from any device.`,
  robots: DRIVE_INDEXABLE ? undefined : { index: false, follow: false },
}

/**
 * /drive/ is its own application inside the site. The storefront's chrome
 * stands down here (see components/SiteChrome.tsx) and DriveShell supplies
 * the frame: top bar, tab bar, palette, shortcuts and theme.
 */
export default function DriveLayout({ children }: { children: React.ReactNode }) {
  return <DriveShell>{children}</DriveShell>
}
