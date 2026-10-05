'use client'

/**
 * Editing a live listing: price and trip terms, the description, the
 * host's photos (one angle at a time), days off the calendar, and pausing.
 * The car itself (VIN, model, city) is fixed once listed.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { FEATURE_IDS, FEATURES } from '@/lib/catalog'
import { moneyExact } from '@/lib/format'
import { COLORS, PHOTO_ANGLES } from '@/lib/listing'
import { reencodePhoto } from '@/lib/photo'
import { todayIso } from '@/lib/dates'
import type { EditableListing, ListingEdit } from '@/lib/server/listings'
import type { FeatureId } from '@/lib/types'
import { Icon } from './Icons'
import { useSession } from './Session'
import { useToast } from './Toast'
import { Breadcrumbs, ButtonLink, Empty } from './ui'

const digits = (v: string, n: number) => Number(v.replace(/\D/g, '').slice(0, n))
const short = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function ListingEditor({ id }: { id: string }) {
  const { user, loaded } = useSession()
  const toast = useToast()
  const [listing, setListing] = useState<EditableListing | null | undefined>(undefined)
  const [edit, setEdit] = useState<Required<ListingEdit> | null>(null)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [range, setRange] = useState({ start: '', end: '' })

  const load = useCallback(async () => {
    const res = await fetch(`/api/listings/${encodeURIComponent(id)}`, { cache: 'no-store' })
    const l: EditableListing | null = res.ok ? (await res.json()).listing : null
    setListing(l)
    if (l) {
      const d = l.data
      setEdit({
        dailyRateCents: d.dailyRateCents,
        weeklyDiscountPct: d.weeklyDiscountPct,
        monthlyDiscountPct: d.monthlyDiscountPct,
        milesPerDay: d.milesPerDay,
        instantBook: d.instantBook,
        deliveryOffered: d.deliveryOffered,
        deliveryFeeCents: d.deliveryFeeCents,
        description: d.description,
        features: d.features,
        rules: d.rules,
        neighborhood: d.neighborhood,
        efficiency: d.efficiency,
        color: d.color,
        welcome: d.welcome ?? '',
        pickup: d.pickup ?? '',
      })
    }
  }, [id])
  useEffect(() => {
    if (loaded && user) void load()
  }, [loaded, user, load])

  if (!loaded || (user && listing === undefined)) return <div className="skeleton" />
  if (!user) return <Empty icon="key" title="Sign in to edit your listing" action={<ButtonLink href={`/signin?next=/host/listings/${id}`}>Sign in</ButtonLink>} />
  if (!listing || !edit) return <Empty icon="key" title="Listing not found" body="It may belong to another account." action={<ButtonLink href="/host/listings">Your listings</ButtonLink>} />

  const set = <K extends keyof ListingEdit>(k: K, v: Required<ListingEdit>[K]) => setEdit((e) => (e ? { ...e, [k]: v } : e))

  const patch = async (body: unknown) => {
    const res = await fetch(`/api/listings/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, error: (json.problems?.[0]?.message ?? json.error) as string | undefined }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setProblem(null)
    const out = await patch({ changes: edit })
    setSaving(false)
    if (!out.ok) return setProblem(out.error ?? 'Couldn’t save that. Try again.')
    toast('Changes saved')
    await load()
  }

  const replacePhoto = async (angle: string, file: File | undefined) => {
    if (!file) return
    setUploading(angle)
    try {
      const { blob } = await reencodePhoto(file, 2000)
      const up = await fetch(`/api/photos?angle=${encodeURIComponent(angle)}`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob })
      const json = await up.json().catch(() => ({}))
      if (!up.ok) throw new Error(json.error ?? 'That photo couldn’t be uploaded.')
      const out = await patch({ changes: {}, photo: { angle, photoId: json.photo.id } })
      if (!out.ok) throw new Error(out.error ?? 'That photo couldn’t be used.')
      toast('Photo replaced')
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That photo couldn’t be uploaded.')
    } finally {
      setUploading(null)
    }
  }

  const block = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch(`/api/listings/${encodeURIComponent(id)}/blocks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(range) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return toast(json.error ?? 'Couldn’t block those days.')
    toast('Days blocked')
    setRange({ start: '', end: '' })
    await load()
  }

  const unblock = async (blockId: string) => {
    const res = await fetch(`/api/listings/${encodeURIComponent(id)}/blocks?block=${encodeURIComponent(blockId)}`, { method: 'DELETE' })
    toast(res.ok ? 'Days open again' : 'Couldn’t change that.')
    await load()
  }

  const toggleStatus = async () => {
    const next = listing.status === 'live' ? 'paused' : 'live'
    const out = await patch({ status: next })
    toast(out.ok ? (next === 'live' ? 'Back on AVANT' : 'Paused. Guests can’t find or book it until you resume.') : 'Couldn’t change that.')
    await load()
  }

  const toggleFeature = (f: FeatureId) => set('features', edit.features.includes(f) ? edit.features.filter((x) => x !== f) : [...edit.features, f])
  const today = todayIso()

  return (
    <div className="stack" style={{ gap: 26 }}>
      <Breadcrumbs items={[{ label: 'Your listings', href: '/host/listings' }, { label: listing.title }]} />
      <div className="between" style={{ alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">{listing.title}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            <span className="status-pill" data-tone={listing.status === 'live' ? 'gold' : 'quiet'}>
              {listing.status === 'live' ? 'Live' : 'Paused'}
            </span>{' '}
            <Link href={`/cars/${listing.slug}`} className="link">
              View as a guest
            </Link>
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-md" onClick={() => void toggleStatus()}>
          {listing.status === 'live' ? 'Pause listing' : 'Resume listing'}
        </button>
      </div>

      <section className="panel stack" aria-labelledby="h-photos">
        <h2 id="h-photos" style={{ fontSize: '1.2rem' }}>
          Photos
        </h2>
        <ul className="edit-photos">
          {listing.photos.map((p) => {
            const label = PHOTO_ANGLES.find((a) => a.id === p.angle)?.label ?? p.angle
            return (
              <li key={p.angle}>
                <img src={p.url} alt={`${label}, your photo`} />
                <span className="small">{label}</span>
                <label className="btn btn-ghost btn-sm">
                  {uploading === p.angle ? 'Uploading…' : 'Replace'}
                  <input type="file" accept="image/*" className="sr-only" disabled={Boolean(uploading)} onChange={(e) => void replacePhoto(p.angle, e.target.files?.[0])} />
                </label>
              </li>
            )
          })}
        </ul>
        <p className="small dim">Your own photos of this car only. Location data is removed on your device before upload.</p>
      </section>

      <form method="post" onSubmit={save} className="stack" style={{ gap: 26 }}>
        <section className="panel stack" aria-labelledby="h-price">
          <h2 id="h-price" style={{ fontSize: '1.2rem' }}>
            Price and trip terms
          </h2>
          <div className="grid-2">
            <label className="field">
              <span className="label">Daily rate ($)</span>
              <input className="input" inputMode="numeric" value={edit.dailyRateCents / 100 || ''} onChange={(e) => set('dailyRateCents', digits(e.target.value, 4) * 100)} />
            </label>
            <label className="field">
              <span className="label">Miles included per day</span>
              <input className="input" inputMode="numeric" value={edit.milesPerDay || ''} onChange={(e) => set('milesPerDay', digits(e.target.value, 4))} />
            </label>
            <label className="field">
              <span className="label">Weekly discount (%)</span>
              <input className="input" inputMode="numeric" value={edit.weeklyDiscountPct} onChange={(e) => set('weeklyDiscountPct', digits(e.target.value, 2))} />
            </label>
            <label className="field">
              <span className="label">Monthly discount (%)</span>
              <input className="input" inputMode="numeric" value={edit.monthlyDiscountPct} onChange={(e) => set('monthlyDiscountPct', digits(e.target.value, 2))} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={edit.instantBook} onChange={() => set('instantBook', !edit.instantBook)} />
            <span>
              <strong>Instant book</strong>
              <span className="small muted" style={{ display: 'block' }}>
                Verified guests book without waiting for you. Off, you approve each request within 8 hours.
              </span>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={edit.deliveryOffered} onChange={() => set('deliveryOffered', !edit.deliveryOffered)} />
            <span>
              <strong>Offer delivery</strong>
              <span className="small muted" style={{ display: 'block' }}>
                Bring the car to the guest. Airports aren&apos;t included yet.
              </span>
            </span>
          </label>
          {edit.deliveryOffered ? (
            <label className="field" style={{ maxWidth: 220 }}>
              <span className="label">Delivery fee ($)</span>
              <input className="input" inputMode="numeric" value={edit.deliveryFeeCents / 100 || ''} onChange={(e) => set('deliveryFeeCents', digits(e.target.value, 3) * 100)} />
            </label>
          ) : null}
        </section>

        <section className="panel stack" aria-labelledby="h-details">
          <h2 id="h-details" style={{ fontSize: '1.2rem' }}>
            Details
          </h2>
          <div className="grid-2">
            <label className="field">
              <span className="label">Neighbourhood</span>
              <input className="input" value={edit.neighborhood} onChange={(e) => set('neighborhood', e.target.value.slice(0, 60))} />
            </label>
            <label className="field">
              <span className="label">Colour</span>
              <select className="select" value={edit.color} onChange={(e) => set('color', e.target.value)}>
                {COLORS.map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="label">Description</span>
            <textarea className="textarea" rows={6} value={edit.description} onChange={(e) => set('description', e.target.value.slice(0, 1500))} />
          </label>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">Features</legend>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {FEATURE_IDS.map((f) => (
                <button key={f} type="button" className="chip" aria-pressed={edit.features.includes(f)} onClick={() => toggleFeature(f)}>
                  {edit.features.includes(f) ? <Icon name="check" size={13} /> : null} {FEATURES[f]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span className="label">House rules, one per line</span>
            <textarea
              className="textarea"
              rows={4}
              value={edit.rules.join('\n')}
              onChange={(e) => set('rules', e.target.value.split('\n').slice(0, 8).map((r) => r.slice(0, 140)))}
            />
          </label>
        </section>

        <section className="panel stack" aria-labelledby="h-welcome">
          <h2 id="h-welcome" style={{ fontSize: '1.2rem' }}>
            Welcome your guests
          </h2>
          <p className="muted">Guests see these once their trip is confirmed. A warm, specific note is the first thing they remember.</p>
          <label className="field">
            <span className="label">Welcome note</span>
            <textarea
              className="textarea"
              rows={3}
              value={edit.welcome}
              placeholder="Hi, I’m glad you chose my car. The playlist is yours to change, and there’s a spare charging cable in the trunk."
              onChange={(e) => set('welcome', e.target.value.slice(0, 600))}
            />
          </label>
          <label className="field">
            <span className="label">Pickup instructions</span>
            <textarea
              className="textarea"
              rows={3}
              value={edit.pickup}
              placeholder="Where the car is parked, how to find the keys or unlock it, and anything about the building."
              onChange={(e) => set('pickup', e.target.value.slice(0, 600))}
            />
            <span className="hint">Shared only with confirmed guests, never on the public listing.</span>
          </label>
        </section>

        {problem ? (
          <p className="error-block" role="alert">
            {problem}
          </p>
        ) : null}
        <div>
          <button type="submit" className="btn btn-primary btn-md" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <section className="panel stack" aria-labelledby="h-cal">
        <h2 id="h-cal" style={{ fontSize: '1.2rem' }}>
          Calendar
        </h2>
        <p className="muted">Block days you need the car. Guests see them as unavailable; booked trips stay as they are.</p>
        <form method="post" onSubmit={block} className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field">
            <span className="label">First day</span>
            <input className="input" type="date" min={today} required value={range.start} onChange={(e) => setRange((r) => ({ start: e.target.value, end: r.end && r.end < e.target.value ? e.target.value : r.end }))} />
          </label>
          <label className="field">
            <span className="label">Last day</span>
            <input className="input" type="date" min={range.start || today} required value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
          </label>
          <button type="submit" className="btn btn-secondary btn-md">
            Block these days
          </button>
        </form>
        {listing.blocks.length || listing.trips.length ? (
          <ul className="cal-list">
            {[
              ...listing.trips.map((t) => ({ key: t.id, start: t.start, end: t.end, kind: 'trip' as const, status: t.status })),
              ...listing.blocks.map((b) => ({ key: b.id, start: b.start, end: b.end, kind: 'block' as const, status: '' })),
            ]
              .sort((a, b) => a.start.localeCompare(b.start))
              .map((r) => (
                <li key={r.key}>
                  <span>
                    <strong>
                      {short(r.start)}
                      {r.end !== r.start ? ` – ${short(r.end)}` : ''}
                    </strong>{' '}
                    <span className="small muted">{r.kind === 'trip' ? (r.status === 'requested' ? 'Trip request' : 'Booked trip') : 'Blocked by you'}</span>
                  </span>
                  {r.kind === 'trip' ? (
                    <Link href={`/trips/${r.key}`} className="link small">
                      Open trip
                    </Link>
                  ) : (
                    <button type="button" className="link small" onClick={() => void unblock(r.key)}>
                      Open these days
                    </button>
                  )}
                </li>
              ))}
          </ul>
        ) : (
          <p className="small dim">Nothing booked or blocked yet. Every day is open at {moneyExact(listing.data.dailyRateCents)}.</p>
        )}
      </section>
    </div>
  )
}
