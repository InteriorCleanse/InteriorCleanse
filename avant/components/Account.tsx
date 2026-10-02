'use client'

import Link from 'next/link'
import { useState } from 'react'
import { clearEvidence } from '@/lib/evidence-db'
import { clearListingPhotos } from '@/lib/listing-photos-db'
import { actions, useLocal } from '@/lib/store'
import { useDriver } from './DriverProvider'
import { Icon } from './Icons'
import { useToast } from './Toast'
import { Notice } from './ui'

export function Account() {
  const { facts, method, verifiedAt, loaded, refresh, modes } = useDriver()
  const { trips, saved } = useLocal()
  const toast = useToast()
  const [confirm, setConfirm] = useState<'driver' | 'local' | null>(null)
  const miles = Math.floor(trips.filter((t) => t.status !== 'cancelled').reduce((s, t) => s + t.quote.totalCents, 0) / 100)
  const tier = miles >= 5000 ? 'Onyx' : miles >= 1500 ? 'Graphite' : 'Chrome'

  const downloadLocal = () => {
    const blob = new Blob([actions.export()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'avant-device-data.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const deleteDriver = async () => {
    const res = await fetch('/api/driver', { method: 'DELETE' })
    if (res.ok) {
      await refresh()
      toast('Driver record deleted')
    } else toast('Could not delete. Try again.')
    setConfirm(null)
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="panel" aria-labelledby="pass">
        <div className="between">
          <h2 id="pass" style={{ fontSize: '1.2rem' }}>Driver Pass</h2>
          {facts.verified ? <span className="badge badge-lime">Verified</span> : <span className="badge">Not verified</span>}
        </div>
        {!loaded ? (
          <div className="skeleton" style={{ minHeight: 80, marginTop: 12 }} />
        ) : facts.verified ? (
          <dl className="kv" style={{ marginTop: 12 }}>
            <div><dt>Age</dt><dd>{facts.age}</dd></div>
            <div><dt>Years licensed</dt><dd>{facts.licenceYears}</dd></div>
            <div><dt>Licence valid to</dt><dd>{facts.licenceExpires}{facts.licenceState ? ` · ${facts.licenceState}` : ''}</dd></div>
            <div><dt>Driving record</dt><dd>{facts.cleanRecord ? 'Clean (young driver fee halved)' : 'Not checked'}</dd></div>
            <div><dt>Verified</dt><dd>{method === 'demo' ? 'Preview (no document checked)' : 'Licence + selfie'} · {verifiedAt ? new Date(verifiedAt).toLocaleDateString() : ''}</dd></div>
          </dl>
        ) : (
          <p className="muted" style={{ marginTop: 10 }}>
            Verify once to book. <Link href="/verify" className="link">Start</Link>
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="miles">
        <h2 id="miles" style={{ fontSize: '1.2rem' }}>AVANT Miles</h2>
        <div className="row" style={{ alignItems: 'baseline', marginTop: 10 }}>
          <span className="display" style={{ fontSize: '3.4rem', }}>{miles.toLocaleString()}</span>
          <span className="muted">miles · {tier} tier</span>
        </div>
        <p className="small muted">One mile per dollar on completed trips. Graphite at 1,500 unlocks free delivery; Onyx at 5,000 waives the deposit.</p>
      </section>

      <section className="panel" aria-labelledby="data">
        <h2 id="data" style={{ fontSize: '1.2rem' }}>Your data</h2>
        <p className="muted small" style={{ marginTop: 6, marginBottom: 16 }}>
          Two places, both yours to take or erase. The Driver Pass is encrypted on our side{modes?.vault ? ' in the privacy vault' : ' inside a secure cookie on this device'}.
          Trips ({trips.length}) and saved cars ({saved.length}) live only in this browser.
        </p>
        <div className="row">
          <a href="/api/driver/export" className="btn btn-secondary btn-md"><Icon name="download" size={16} /> Export Driver Pass</a>
          <button type="button" className="btn btn-secondary btn-md" onClick={downloadLocal}><Icon name="download" size={16} /> Export trips &amp; saved</button>
        </div>
        <hr className="hairline" />
        {confirm === 'driver' ? (
          <div className="row">
            <button type="button" className="btn btn-danger btn-md" onClick={deleteDriver}>Delete Driver Pass for good</button>
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setConfirm(null)}>Keep it</button>
          </div>
        ) : confirm === 'local' ? (
          <div className="row">
            <button type="button" className="btn btn-danger btn-md" onClick={async () => { actions.clear(); await clearEvidence(); await clearListingPhotos(); toast('Cleared from this device'); setConfirm(null) }}>Clear trips, photos &amp; saved</button>
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setConfirm(null)}>Keep them</button>
          </div>
        ) : (
          <div className="row">
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setConfirm('driver')} disabled={!facts.verified}><Icon name="trash" size={16} /> Delete Driver Pass</button>
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setConfirm('local')}><Icon name="trash" size={16} /> Clear this device</button>
          </div>
        )}
      </section>
      <Notice icon="lock">
        Deleting the Driver Pass also asks our verification partner to redact anything it still holds. <Link href="/security" className="link">How we protect your data</Link>
      </Notice>
    </div>
  )
}
