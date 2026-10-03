import { Notice } from '@/components/ui'

export const metadata = { title: 'Privacy' }

export default function Privacy() {
  return (
    <div className="page page-narrow stack" style={{ gap: 18 }}>
      <h1 className="page-title">Privacy</h1>
      <Notice tone="warn">Draft for legal review. Not yet a binding policy.</Notice>
      <h2>What we collect</h2>
      <p className="muted">Your account: your name, email, a password (stored only as a one-way hash), and, if you add them, a profile photo and a short bio. To book: your age in whole years, years licensed, licence expiry month and state, whether your driving record is clean, and how and when you were verified. Your trips, messages with hosts or guests, reviews and saved cars. If you host: your listings, the photos you take of your car, and its VIN (never shown to guests). To pay or get paid: nothing, since card and bank details go directly to Stripe.</p>
      <h2>What we never collect</h2>
      <p className="muted">Your date of birth, licence number, home address, card or bank numbers, or document images. Our verification partner processes the images to confirm your licence and is instructed to redact them when the check completes. Photos are stripped of location data on your device before upload.</p>
      <h2>How it is protected</h2>
      <p className="muted">Driver records are encrypted with AES-256-GCM before storage, in a separate vault service that accepts only signed requests or, without one, as ciphertext in our database. Passwords are hashed with scrypt. Messages and trips are visible only to the two people on the trip.</p>
      <h2>Your rights</h2>
      <p className="muted">Export or delete your Driver Pass, or close your whole account, at any time from Profile. We do not sell personal information or use it for targeted advertising. Residents of California, Colorado, Virginia and other states with privacy laws may also contact us to exercise any right those laws grant.</p>
      <h2>Retention</h2>
      <p className="muted">Driver records are deleted twelve months after your last trip, or immediately on request. When you close your account, your profile, photos, listings and saved cars are deleted; past trips and messages stay with the other person under &ldquo;Former member&rdquo;, and trip and payment records are kept as long as the law requires.</p>
    </div>
  )
}
