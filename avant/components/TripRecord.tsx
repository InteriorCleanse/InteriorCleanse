'use client'

/**
 * The trip record and reports on a confirmed trip: odometer and fuel at
 * pickup and return (entered by one side, confirmed by the other), and any
 * damage, charge, accident or breakdown report with the other side's
 * response. Rules in lib/trip-record.ts; the server re-checks everything.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { moneyExact } from '@/lib/format'
import { reencodePhoto } from '@/lib/photo'
import type { ClaimView, TripRecordView } from '@/lib/server/claims'
import { GUEST_RESPONSE_HOURS, MAX_CLAIM_PHOTOS, type ClaimKind, type LogKind } from '@/lib/trip-record'
import { Icon } from './Icons'
import { useToast } from './Toast'
import { Notice } from './ui'

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

async function send(url: string, body: unknown): Promise<string | null> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (res.ok) return null
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'That didn’t go through. Try again.'
}

export function TripRecord({ tripId }: { tripId: string }) {
  const [record, setRecord] = useState<TripRecordView | null>(null)
  const load = useCallback(async () => {
    const res = await fetch(`/api/trips/${tripId}/record`, { cache: 'no-store' })
    if (res.ok) setRecord((await res.json()).record)
  }, [tripId])
  useEffect(() => {
    void load()
  }, [load])
  if (!record) return null

  return (
    <>
      <section className="car-section" aria-labelledby="record" id="record">
        <h2 id="record">Trip record</h2>
        <p className="small muted" style={{ marginBottom: 14 }}>
          The odometer and fuel or charge at pickup and at return. Either of you enters it, the other confirms. It settles mileage and fuel
          questions, and it&apos;s the record our insurer keeps for every trip.
        </p>
        <div className="record-grid">
          <ReadingCard tripId={tripId} kind="pickup" reading={record.pickup} canRecord={record.can.recordPickup} canConfirm={record.can.confirmPickup} onDone={load} />
          <ReadingCard tripId={tripId} kind="return" reading={record.return} canRecord={record.can.recordReturn} canConfirm={record.can.confirmReturn} onDone={load} />
        </div>
        {record.mileage ? (
          <p className="small" style={{ marginTop: 12 }}>
            <strong className="tabular">{record.mileage.driven.toLocaleString('en-US')} mi</strong> driven
            {record.mileage.allowance === null
              ? ' · unlimited miles'
              : record.mileage.over
                ? ` · ${record.mileage.over.toLocaleString('en-US')} mi over the ${record.mileage.allowance.toLocaleString('en-US')} mi allowance`
                : ` · within the ${record.mileage.allowance.toLocaleString('en-US')} mi allowance`}
          </p>
        ) : null}
      </section>

      <section className="car-section" aria-labelledby="claims" id="claims">
        <h2 id="claims">{record.role === 'guest' ? 'Accidents and problems' : 'Damage and charges'}</h2>
        {record.claims.length ? (
          <ul className="claims">
            {record.claims.map((c) => (
              <ClaimItem key={c.id} claim={c} capCents={record.capCents} planName={record.planName} role={record.role} onDone={load} />
            ))}
          </ul>
        ) : null}
        {record.can.report ? (
          <ReportForm tripId={tripId} role={record.role} kinds={record.reportKinds} capCents={record.capCents} planName={record.planName} onDone={load} />
        ) : record.claims.length ? null : (
          <p className="small muted">Reports for this trip are closed. If something comes up, contact support.</p>
        )}
      </section>
    </>
  )
}

function ReadingCard(props: {
  tripId: string
  kind: LogKind
  reading: TripRecordView['pickup']
  canRecord: boolean
  canConfirm: boolean
  onDone: () => Promise<void>
}) {
  const { tripId, kind, reading, canRecord, canConfirm, onDone } = props
  const toast = useToast()
  const [odometer, setOdometer] = useState('')
  const [fuel, setFuel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const title = kind === 'pickup' ? 'At pickup' : 'At return'

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await send(`/api/trips/${tripId}/record`, { kind, odometer: Number(odometer.replace(/[^\d]/g, '')), fuelPct: Number(fuel) })
    setBusy(false)
    if (err) return setError(err)
    toast(`${title} recorded`)
    await onDone()
  }
  const confirm = async () => {
    setBusy(true)
    const err = await send(`/api/trips/${tripId}/record`, { confirm: kind })
    setBusy(false)
    toast(err ?? 'Confirmed')
    await onDone()
  }

  return (
    <div className="record-card">
      <span className="small muted">{title}</span>
      {reading ? (
        <>
          <strong className="tabular" style={{ fontSize: '1.3rem', fontWeight: 400 }}>
            {reading.odometer.toLocaleString('en-US')} mi
          </strong>
          <span className="small">{reading.fuelPct}% fuel or charge</span>
          <span className="small dim">
            {when(reading.recordedAt)} · {reading.confirmed ? 'confirmed by both' : reading.recordedByYou ? 'waiting for the other side' : 'not confirmed yet'}
          </span>
          {canConfirm ? (
            <div className="row" style={{ marginTop: 6 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void confirm()} disabled={busy}>
                <Icon name="check" size={14} /> Confirm
              </button>
              <span className="small muted">Wrong? Message them, or report it below.</span>
            </div>
          ) : null}
        </>
      ) : canRecord ? (
        <form method="post" onSubmit={save} className="stack" style={{ gap: 10, marginTop: 6 }}>
          <label className="field">
            <span className="label">Odometer (miles)</span>
            <input className="input" inputMode="numeric" required value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="42,180" />
          </label>
          <label className="field">
            <span className="label">Fuel or charge (%)</span>
            <input className="input" inputMode="numeric" required value={fuel} onChange={(e) => setFuel(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} placeholder="80" />
          </label>
          {error ? <p className="error-block" role="alert">{error}</p> : null}
          <div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !odometer || !fuel}>
              {busy ? 'Saving…' : 'Save reading'}
            </button>
          </div>
        </form>
      ) : (
        <span className="small dim">{kind === 'pickup' ? 'Opens the day before pickup.' : 'Opens once pickup is recorded.'}</span>
      )}
    </div>
  )
}

function ReportForm(props: {
  tripId: string
  role: 'guest' | 'host'
  kinds: { id: ClaimKind; label: string }[]
  capCents: number
  planName: string
  onDone: () => Promise<void>
}) {
  const { tripId, role, kinds, capCents, planName, onDone } = props
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ClaimKind>(kinds[0].id)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [police, setPolice] = useState('')
  const [otherParty, setOtherParty] = useState('')
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <div className="stack" style={{ gap: 10 }}>
        {role === 'guest' ? (
          <p className="small muted">
            If you&apos;re in an accident, make sure everyone is safe and call 911 first. Then report it here so we can help.{' '}
            <Link href="/help/accident" className="link">
              What to do after an accident
            </Link>
          </p>
        ) : (
          <p className="small muted">
            Report damage, cleaning, fuel, mileage, a late return, tolls or tickets within 3 days of the trip ending, with photos. Your guest has{' '}
            {GUEST_RESPONSE_HOURS} hours to respond, then our claims team decides with both sides&apos; evidence. Nothing is charged before then.
          </p>
        )}
        <div>
          <button type="button" className="btn btn-secondary btn-md" onClick={() => setOpen(true)}>
            {role === 'guest' ? 'Report an accident or problem' : 'Report damage or a charge'}
          </button>
        </div>
      </div>
    )
  }

  const addPhoto = async (file?: File) => {
    if (!file || photos.length >= MAX_CLAIM_PHOTOS) return
    setBusy(true)
    try {
      const { blob } = await reencodePhoto(file, 1600)
      const res = await fetch('/api/photos?kind=claim', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Couldn’t add that photo.')
      setPhotos((p) => [...p, { id: json.photo.id, url: `/api/photos/${json.photo.id}` }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t add that photo.')
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const cents = amount ? Math.round(Number(amount.replace(/[^\d.]/g, '')) * 100) : undefined
    const err = await send(`/api/trips/${tripId}/claims`, {
      kind,
      description,
      ...(role === 'host' && cents !== undefined ? { amountCents: cents } : {}),
      photoIds: photos.map((p) => p.id),
      ...(role === 'guest' && police ? { policeReport: police } : {}),
      ...(role === 'guest' && otherParty ? { otherParty } : {}),
    })
    setBusy(false)
    if (err) return setError(err)
    toast('Report sent. Our claims team has it.')
    setOpen(false)
    await onDone()
  }

  return (
    <form method="post" onSubmit={submit} className="panel stack" style={{ gap: 14 }}>
      <label className="field">
        <span className="label">What happened</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ClaimKind)}>
          {kinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Describe it</span>
        <textarea
          className="textarea"
          rows={4}
          required
          minLength={20}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={role === 'guest' ? 'Where and when, what happened, and whether anyone was hurt.' : 'What you found, where on the car, and when you noticed it.'}
        />
      </label>
      {role === 'host' ? (
        <label className="field">
          <span className="label">Amount you&apos;re asking for (estimate)</span>
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$0.00" />
          <span className="hint">
            The guest chose {planName} protection: the most they can be asked for damage is {capCents === 0 ? '$0' : moneyExact(capCents)}. Anything above
            that is handled by our protection programme, not the guest.
          </span>
        </label>
      ) : (
        <>
          <label className="field">
            <span className="label">Police report number (if any)</span>
            <input className="input" maxLength={60} value={police} onChange={(e) => setPolice(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">The other driver or vehicle (if any)</span>
            <textarea className="textarea" rows={2} maxLength={600} value={otherParty} onChange={(e) => setOtherParty(e.target.value)} placeholder="Name, phone, insurer, policy number, plate, car." />
          </label>
        </>
      )}
      <div className="field">
        <span className="label">Photos ({photos.length}/{MAX_CLAIM_PHOTOS})</span>
        <div className="claim-photos">
          {photos.map((p) => (
            <img key={p.id} src={p.url} alt="" />
          ))}
          {photos.length < MAX_CLAIM_PHOTOS ? (
            <label className="claim-add">
              <Icon name="plus" size={20} />
              <span className="sr-only">Add a photo</span>
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void addPhoto(e.target.files?.[0])} disabled={busy} />
            </label>
          ) : null}
        </div>
        {role === 'host' && kind === 'damage' ? <span className="hint">At least one photo of the damage. Location data is removed.</span> : null}
      </div>
      {error ? (
        <p className="error-block" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row">
        <button type="submit" className="btn btn-primary btn-md" disabled={busy || description.trim().length < 20}>
          {busy ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" className="btn btn-ghost btn-md" onClick={() => setOpen(false)}>
          Not now
        </button>
      </div>
    </form>
  )
}

const STATUS: Record<ClaimView['status'], string> = {
  open: 'Waiting for a response',
  responded: 'With our claims team',
  review: 'With our claims team',
  withdrawn: 'Withdrawn',
  resolved: 'Resolved',
}

function ClaimItem({ claim, capCents, planName, role, onDone }: { claim: ClaimView; capCents: number; planName: string; role: 'guest' | 'host'; onDone: () => Promise<void> }) {
  const toast = useToast()
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const canRespond = !claim.yours && claim.responseAccepts === null && (claim.status === 'open' || claim.status === 'review')

  const respond = async (accepts: boolean) => {
    setBusy(true)
    const err = await send(`/api/claims/${claim.id}`, { action: 'respond', accepts, response: reply })
    setBusy(false)
    toast(err ?? 'Response sent')
    if (!err) await onDone()
  }
  const withdraw = async () => {
    setBusy(true)
    const err = await send(`/api/claims/${claim.id}`, { action: 'withdraw' })
    setBusy(false)
    toast(err ?? 'Report withdrawn')
    if (!err) await onDone()
  }

  return (
    <li className="claim">
      <div className="between" style={{ alignItems: 'baseline' }}>
        <strong>{claim.label}</strong>
        <span className="status-pill" data-tone={claim.status === 'withdrawn' || claim.status === 'resolved' ? 'quiet' : 'gold'}>
          {STATUS[claim.status]}
        </span>
      </div>
      <p className="small dim">
        {claim.yours ? 'You reported' : claim.role === 'host' ? 'Your host reported' : 'Your guest reported'} this {when(claim.createdAt)}
        {claim.amountCents !== null ? ` · asking ${moneyExact(claim.amountCents)}` : ''}
      </p>
      <p style={{ whiteSpace: 'pre-line' }}>{claim.description}</p>
      {claim.policeReport ? <p className="small muted">Police report {claim.policeReport}</p> : null}
      {claim.otherParty ? <p className="small muted" style={{ whiteSpace: 'pre-line' }}>Other party: {claim.otherParty}</p> : null}
      {claim.photos.length ? (
        <div className="claim-photos">
          {claim.photos.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer">
              <img src={src} alt="Photo attached to the report" />
            </a>
          ))}
        </div>
      ) : null}
      {claim.responseAccepts !== null ? (
        <p className="small" style={{ marginTop: 6 }}>
          <strong>{claim.yours ? 'Their response' : 'Your response'}:</strong> {claim.responseAccepts ? 'accepted' : 'disputed'}
          {claim.response ? ` — ${claim.response}` : ''}
        </p>
      ) : null}
      {canRespond ? (
        <div className="stack" style={{ gap: 10, marginTop: 10 }}>
          {role === 'guest' && claim.role === 'host' ? (
            <Notice icon="shield">
              {claim.respondBy ? `Respond by ${when(claim.respondBy)}. ` : ''}Your {planName} protection caps what you can be asked for damage at{' '}
              {capCents === 0 ? '$0' : moneyExact(capCents)}. Your check-in photos are your best evidence: mention them.
            </Notice>
          ) : null}
          <label className="field">
            <span className="label">Your side</span>
            <textarea className="textarea" rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} />
          </label>
          <div className="row">
            <button type="button" className="btn btn-primary btn-md" disabled={busy || reply.trim().length < 10} onClick={() => void respond(false)}>
              Send my side
            </button>
            {claim.role === 'host' ? (
              <button type="button" className="btn btn-secondary btn-md" disabled={busy} onClick={() => void respond(true)}>
                I agree with this
              </button>
            ) : (
              <button type="button" className="btn btn-secondary btn-md" disabled={busy} onClick={() => void respond(true)}>
                Acknowledge
              </button>
            )}
          </div>
        </div>
      ) : null}
      {claim.yours && ['open', 'responded', 'review'].includes(claim.status) ? (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => void withdraw()}>
          Withdraw report
        </button>
      ) : null}
    </li>
  )
}
