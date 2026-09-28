import type { Metadata } from 'next'
import { Icon, type IconName } from '@/components/Icons'
import { modes } from '@/lib/modes'

export const metadata: Metadata = { title: 'Trust & safety', description: 'How AVANT verifies drivers, protects personal data and keeps payments secure.' }

const LAYERS: [IconName, string, string][] = [
  ['id', 'Licence + live selfie', 'Drivers verify with a document scan and a matching live selfie on our verification partner’s page. AVANT never receives the images.'],
  ['eye-off', 'Data minimisation', 'We keep age in years, licence validity and a clean-record flag. Never a name, date of birth, licence number, address or photo.'],
  ['lock', 'Encrypted before storage', 'Driver records are sealed with AES-256-GCM inside the app before they reach storage, and bound to your session so they cannot be swapped.'],
  ['shield', 'Private vault on hardware we control', 'Records live in a separate vault service that only accepts signed requests and only ever sees ciphertext. It runs on Cloudflare or self-hosted with open-compute.'],
  ['card', 'Card data never touches AVANT', 'Payments happen on Stripe’s PCI-certified pages. The price is recalculated on our server before any charge.'],
  ['bolt', 'Hardened by default', 'Per-request Content Security Policy, HSTS, no framing, same-origin checks on every write, strict input validation and rate limits on every endpoint.'],
]

export default function SecurityPage() {
  const m = modes()
  const rows: [string, boolean, string][] = [
    ['Payments (Stripe)', m.payments, 'Preview bookings are not charged.'],
    ['Licence verification (Stripe Identity)', m.identity, 'Preview verification checks no document.'],
    ['Privacy vault', m.vault, 'Records are sealed in an encrypted cookie instead.'],
    ['Production keys', !m.demoKeys, 'Temporary keys: sessions reset when the server restarts.'],
    ['AI concierge', m.ai, 'Built-in answers are used instead.'],
  ]
  return (
    <div className="page page-narrow">
      <p className="eyebrow">Trust &amp; safety</p>
      <h1 className="page-title" style={{ margin: '10px 0 16px' }}>
        Safe by <em>design,</em> not by promise.
      </h1>
      <p className="lead">Every layer below is in the code today. Where something is still in preview, this page says so.</p>
      <div className="grid-2" style={{ marginTop: 32 }}>
        {LAYERS.map(([icon, t, b]) => (
          <div key={t} className="panel stack" style={{ gap: 8 }}>
            <Icon name={icon} size={24} />
            <h2 style={{ fontSize: '1.1rem' }}>{t}</h2>
            <p className="muted small">{b}</p>
          </div>
        ))}
      </div>
      <section id="modes" className="section" aria-labelledby="live">
        <h2 id="live" style={{ fontSize: '1.4rem', marginBottom: 14 }}>What is live right now</h2>
        <dl className="kv">
          {rows.map(([name, on, off]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{on ? <span className="badge badge-ok">Live</span> : <><span className="badge badge-warn">Preview</span> <span className="small muted">{off}</span></>}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="section">
        <h2 style={{ fontSize: '1.4rem', marginBottom: 10 }}>Report a vulnerability</h2>
        <p className="muted">Email security@ your AVANT domain. We acknowledge within two business days and never pursue good-faith research.</p>
      </section>
    </div>
  )
}
