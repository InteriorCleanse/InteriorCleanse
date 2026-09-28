import { Notice } from '@/components/ui'

export const metadata = { title: 'Privacy' }

export default function Privacy() {
  return (
    <div className="page page-narrow stack" style={{ gap: 18 }}>
      <h1 className="page-title">Privacy</h1>
      <Notice tone="warn">Draft for legal review. Not yet a binding policy.</Notice>
      <h2>What we collect</h2>
      <p className="muted">To book: your age in whole years, years licensed, licence expiry month and state, whether your driving record is clean, and how and when you were verified. To pay: nothing, since card details go directly to Stripe. On your device: trips, saved cars and preferences, stored in your browser.</p>
      <h2>What we never collect</h2>
      <p className="muted">Your name, date of birth, licence number, home address or document images. Our verification partner processes the images to confirm your licence and is instructed to redact them when the check completes.</p>
      <h2>How it is protected</h2>
      <p className="muted">Records are encrypted with AES-256-GCM before storage and kept in a separate vault service that accepts only signed requests. Access is logged without personal data.</p>
      <h2>Your rights</h2>
      <p className="muted">Export or delete your record at any time from Account. We do not sell personal information or use it for targeted advertising. Residents of California, Colorado, Virginia and other states with privacy laws may also contact us to exercise any right those laws grant.</p>
      <h2>Retention</h2>
      <p className="muted">Driver records are deleted twelve months after your last trip, or immediately on request, except where the law requires us to keep trip records for longer.</p>
    </div>
  )
}
