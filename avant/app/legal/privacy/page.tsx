import type { Metadata } from 'next'
import { Notice } from '@/components/ui'
import { LEGAL_VERSIONS, MIN_ACCOUNT_AGE } from '@/lib/legal'

export const metadata: Metadata = { title: 'Privacy' }

export default function Privacy() {
  const contact = process.env.AVANT_PRIVACY_CONTACT?.trim() || process.env.AVANT_SECURITY_CONTACT?.trim() || null
  return (
    <div className="page page-narrow legal stack" style={{ gap: 18 }}>
      <h1 className="page-title">Privacy</h1>
      <p className="small dim">Privacy notice version {LEGAL_VERSIONS.privacy}</p>
      <Notice tone="warn">Draft for legal review. Not yet a binding policy.</Notice>

      <h2>What we collect</h2>
      <ul className="muted">
        <li>Your account: your name, email, a password (stored only as a one-way hash), and, if you add them, a profile photo and a short bio.</li>
        <li>
          To book: your age in whole years, years licensed, licence expiry month and state, whether your driving record is clean, and how and when
          you were verified. If you choose delivery, the address you give for it.
        </li>
        <li>Your trips, your messages with hosts or guests, your reviews, saved cars, AVANT credit, and which version of our terms you accepted and when.</li>
        <li>
          The trip record: odometer and fuel or charge at pickup and return, and who entered and confirmed them. Damage, accident and breakdown
          reports, with their photos, and the other side&apos;s response. Reports you make about other members, and who you&apos;ve blocked.
        </li>
        <li>Your notification choices and, if you turn on notifications in the iOS app, a push token for that iPhone, tied to that sign-in.</li>
        <li>If you host: your listings, the photos you take of your car, its VIN (never shown to guests) and your pickup instructions.</li>
        <li>To pay or get paid: nothing. Card and bank details go directly to Stripe.</li>
      </ul>

      <h2>What we never collect</h2>
      <p className="muted">
        Your date of birth, licence number, card or bank numbers, document images, or where you drive. Our verification partner processes the images to confirm
        your licence and is instructed to redact them when the check completes. Location data is removed from photos, on your device and again on
        our server. We don&apos;t use advertising trackers or sell personal information, and we don&apos;t use it for targeted advertising.
      </p>

      <h2>How it is protected</h2>
      <p className="muted">
        Driver records are encrypted with AES-256-GCM before storage, in a separate vault or as ciphertext in our database. Messages, delivery
        addresses, pickup instructions and VINs are encrypted in our database too, so a copy of it on its own reveals none of them. Passwords are
        hashed with scrypt and checked against known breaches. New accounts confirm their email before they can sign in. Messages and trips are
        visible only to the two people on the trip, a host sees a guest&apos;s delivery address only while the trip is active, and other members
        see only your first name and initial.
      </p>

      <h2>Who we share it with</h2>
      <ul className="muted">
        <li>The other person on your trip: your first name and initial, photo, reviews, messages, and what they need for the handover.</li>
        <li>Stripe, to take payments, pay hosts and verify licences.</li>
        <li>Our hosting, database and email providers, to run the service and send you account and trip emails.</li>
        <li>Anthropic, if you use the concierge: the questions you type, to answer them. Don&apos;t share personal details there.</li>
        <li>Apple, to deliver notifications to your iPhone: only the headline (&ldquo;Trip confirmed&rdquo;), never trip details or amounts.</li>
        <li>
          Have I Been Pwned, when you choose a password: only the first five characters of a one-way hash, so it never learns your password, to
          refuse ones already leaked.
        </li>
        <li>
          Our insurer, its claims administrator and adjusters: the trip record, any report and its photos, both sides&apos; responses, and the
          people on the trip, to handle claims.
        </li>
        <li>If you invite a friend, they see your first name.</li>
        <li>Our insurer and its claims administrator, if there is a claim on your trip.</li>
        <li>Authorities, only when the law requires it.</li>
      </ul>

      <h2>Cookies</h2>
      <p className="muted">
        One cookie keeps you signed in, and one keeps your driver pass private to your browser. Both are essential, so there&apos;s no banner. No
        analytics or advertising cookies. To stop abuse we count requests per IP address, stored only as a one-way hash, and delete the counts
        within a day. Your device also keeps your chosen city, listing drafts and trip check-in photos; they stay there
        until you publish or share them.
      </p>

      <h2>Your rights</h2>
      <p className="muted">
        From Profile, at any time: download everything we hold about you, correct your name, email and profile, choose which emails and
        notifications you get (every optional email has a one-click unsubscribe), see where you&apos;re signed in and sign any device out, block
        people, delete your driver pass, or close your account. Residents of California, Colorado, Virginia and other states with privacy laws may also contact us to
        exercise any right those laws grant; we won&apos;t treat you differently for doing so.
      </p>

      <h2>How long we keep it</h2>
      <ul className="muted">
        <li>Delivery addresses: removed 30 days after the trip.</li>
        <li>Notifications: removed 180 days after you read them, and after 400 days in any case.</li>
        <li>Sign-in sessions: end after 14 idle days or 30 days in all.</li>
        <li>Driver records: deleted a year after they were last checked, or immediately when you delete your driver pass.</li>
        <li>Sign-in attempt counts: within a day. Unused verification, reset and email-change links: when they expire.</li>
        <li>
          When you close your account, your profile, photos, listings, saved cars, sessions, devices and notifications are deleted, and your
          messages and delivery addresses are erased. Reviews you wrote stay on the car or person you reviewed, under &ldquo;Former member&rdquo;.
          Trip records, payment records, credit history, claims and their photos, reports and consent records are kept as long as the law
          requires, as evidence for taxes, insurance and disputes.
        </li>
      </ul>

      <h2>Children</h2>
      <p className="muted">AVANT is for people {MIN_ACCOUNT_AGE} and older. We don&apos;t knowingly collect information from anyone younger.</p>

      <h2>Changes and contact</h2>
      <p className="muted">
        When this notice changes materially we update the version above and ask you to read and accept it in the app. Privacy requests:{' '}
        {contact ? (
          <a className="link" href={contact.startsWith('mailto:') || contact.startsWith('https:') ? contact : `mailto:${contact}`}>
            {contact.replace(/^mailto:/, '')}
          </a>
        ) : (
          '[privacy contact, to be added by counsel]'
        )}
        .
      </p>
    </div>
  )
}
