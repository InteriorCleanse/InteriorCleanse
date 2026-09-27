'use client'

/**
 * Hosting: an earnings estimator that reads real medians from the fleet, a
 * listing wizard that saves drafts to the device, and the list of drafts.
 */

import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { BODY_TYPES, FEATURES, FILTERABLE_FEATURES, FUELS, TRANSMISSIONS } from '@/lib/drive/catalog'
import { cities, medianRateCents } from '@/lib/drive/data'
import { money } from '@/lib/drive/format'
import { hostMonthlyEstimate } from '@/lib/drive/pricing'
import { DRIVE } from '@/lib/drive/routes'
import { useDriveActions, useDriveState } from '@/lib/drive/store'
import type { BodyType, FeatureId, Fuel, Listing, Transmission } from '@/lib/drive/types'
import { CarArt } from './CarArt'
import { Icon } from './Icons'
import { useToast } from './Toast'
import { Badge, Breadcrumbs, Button, Card, EmptyState, Field } from './ui'

export function EarningsEstimator() {
  const [body, setBody] = useState<BodyType>('suv')
  const [city, setCity] = useState(cities[0].slug)
  const [days, setDays] = useState(12)
  const median = medianRateCents(body, city)
  const monthly = hostMonthlyEstimate(median, days)
  return (
    <div className="dr-estimator">
      <div className="dr-grid-3">
        <Field label="Your car is a">
          {(p) => (
            <select {...p} value={body} onChange={(e) => setBody(e.target.value as BodyType)}>
              {BODY_TYPES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="In">
          {(p) => (
            <select {...p} value={city} onChange={(e) => setCity(e.target.value)}>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={`Shared ${days} days a month`}>
          {(p) => <input {...p} type="range" min={2} max={28} value={days} onChange={(e) => setDays(Number(e.target.value))} />}
        </Field>
      </div>
      <div className="dr-estimate">
        <span>You could earn about</span>
        <strong>{money(monthly)}</strong>
        <span>a month</span>
        <small>
          Based on the median {BODY_TYPES.find((b) => b.id === body)?.label.toLowerCase()} rate in this city ({money(median)}/day) and a 75%
          host share. An estimate, not a promise.
        </small>
      </div>
    </div>
  )
}

const STEPS = ['Car', 'Location', 'Pricing', 'Rules'] as const

type Draft = Omit<Listing, 'id' | 'createdAt' | 'updatedAt' | 'status'>

const EMPTY_DRAFT: Draft = {
  year: new Date().getFullYear() - 2,
  make: '',
  model: '',
  body: 'sedan',
  fuel: 'gas',
  transmission: 'automatic',
  seats: 5,
  city: '',
  neighborhood: '',
  dailyRateCents: 0,
  weeklyDiscountPct: 10,
  monthlyDiscountPct: 20,
  instantBook: true,
  deliveryOffered: false,
  deliveryFeeCents: 3500,
  milesPerDay: 200,
  minDays: 1,
  features: ['bluetooth', 'usb-charger'],
  guidelines: 'No smoking. Return with the same fuel level.',
}

export function ListingWizard() {
  const router = useRouter()
  const params = useSearchParams()
  const editId = params.get('id')
  const { listings, hydrated } = useDriveState()
  const { saveListing } = useDriveActions()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!hydrated || loaded) return
    if (editId) {
      const existing = listings.find((l) => l.id === editId)
      if (existing) {
        const { id: _id, createdAt: _c, updatedAt: _u, status: _s, ...rest } = existing
        setDraft(rest)
      }
    }
    setLoaded(true)
  }, [hydrated, loaded, editId, listings])

  const suggested = useMemo(() => medianRateCents(draft.body, draft.city || undefined), [draft.body, draft.city])
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const validate = (): string | null => {
    if (step === 0) {
      if (!draft.make.trim() || !draft.model.trim()) return 'Add the make and model.'
      if (draft.year < 2005 || draft.year > new Date().getFullYear() + 1) return 'Cars from 2005 onward can be listed.'
    }
    if (step === 1) {
      if (!draft.city) return 'Choose a city.'
      if (draft.neighborhood.trim().length < 2) return 'Add the neighbourhood where pickups happen.'
    }
    if (step === 2) {
      if (draft.dailyRateCents < 2000) return 'The daily rate needs to be at least $20.'
      if (draft.dailyRateCents > 100000) return 'The daily rate is capped at $1,000.'
    }
    return null
  }

  const next = () => {
    const problem = validate()
    setError(problem)
    if (!problem) setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const finish = (status: Listing['status']) => {
    const problem = validate()
    setError(problem)
    if (problem) return
    saveListing({ ...draft, status, id: editId ?? undefined })
    toast(status === 'listed' ? 'Listing published on this device' : 'Draft saved')
    router.push(DRIVE.hostListings)
  }

  if (!hydrated) return <div className="dr-skeleton dr-skeleton-block" aria-busy="true" />

  return (
    <div className="dr-wizard">
      <Breadcrumbs items={[{ label: 'Host', href: DRIVE.host }, { label: editId ? 'Edit listing' : 'List your car' }]} />
      <ol className="dr-steps" aria-label="Listing steps">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? 'step' : undefined} data-done={i < step ? 'true' : undefined}>
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step}>
              <span className="dr-step-num">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
              <span>{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="dr-booking-layout">
        <div className="dr-booking-main">
          {step === 0 ? (
            <section className="dr-panel">
              <h2>Tell us about the car</h2>
              <div className="dr-grid-2">
                <Field label="Year">
                  {(p) => <input {...p} type="number" inputMode="numeric" min={2005} max={new Date().getFullYear() + 1} value={draft.year} onChange={(e) => set('year', Number(e.target.value))} />}
                </Field>
                <Field label="Seats">
                  {(p) => <input {...p} type="number" inputMode="numeric" min={2} max={12} value={draft.seats} onChange={(e) => set('seats', Number(e.target.value))} />}
                </Field>
                <Field label="Make">{(p) => <input {...p} type="text" value={draft.make} onChange={(e) => set('make', e.target.value)} placeholder="Toyota" />}</Field>
                <Field label="Model">{(p) => <input {...p} type="text" value={draft.model} onChange={(e) => set('model', e.target.value)} placeholder="RAV4 Hybrid" />}</Field>
                <Field label="Body type">
                  {(p) => (
                    <select {...p} value={draft.body} onChange={(e) => set('body', e.target.value as BodyType)}>
                      {BODY_TYPES.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Fuel">
                  {(p) => (
                    <select {...p} value={draft.fuel} onChange={(e) => set('fuel', e.target.value as Fuel)}>
                      {FUELS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Transmission">
                  {(p) => (
                    <select {...p} value={draft.transmission} onChange={(e) => set('transmission', e.target.value as Transmission)}>
                      {TRANSMISSIONS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>
              <fieldset className="dr-fieldset">
                <legend>Features</legend>
                <div className="dr-checks dr-checks-wrap">
                  {FILTERABLE_FEATURES.map((f) => (
                    <label key={f} className="dr-check">
                      <input
                        type="checkbox"
                        checked={draft.features.includes(f)}
                        onChange={() =>
                          set('features', draft.features.includes(f) ? draft.features.filter((x) => x !== f) : [...draft.features, f as FeatureId])
                        }
                      />
                      <span>{FEATURES[f]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="dr-panel">
              <h2>Where do guests pick it up?</h2>
              <div className="dr-grid-2">
                <Field label="City">
                  {(p) => (
                    <select {...p} value={draft.city} onChange={(e) => set('city', e.target.value)}>
                      <option value="">Choose…</option>
                      {cities.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}, {c.state}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Neighbourhood" hint="Guests see this before booking; the exact address only after.">
                  {(p) => <input {...p} type="text" value={draft.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} />}
                </Field>
              </div>
              <fieldset className="dr-fieldset dr-fieldset-boxed">
                <legend>Delivery</legend>
                <label className="dr-check dr-check-row">
                  <input type="checkbox" checked={draft.deliveryOffered} onChange={() => set('deliveryOffered', !draft.deliveryOffered)} />
                  <span>
                    <strong>Offer delivery</strong>
                    <small>Bring the car to the guest for a fee. Popular with airport arrivals.</small>
                  </span>
                </label>
                {draft.deliveryOffered ? (
                  <Field label="Delivery fee ($)">
                    {(p) => (
                      <input {...p} type="number" inputMode="numeric" min={0} step={5} value={draft.deliveryFeeCents / 100} onChange={(e) => set('deliveryFeeCents', Math.max(0, Number(e.target.value)) * 100)} />
                    )}
                  </Field>
                ) : null}
              </fieldset>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="dr-panel">
              <h2>Set your price</h2>
              <p className="dr-lead">
                Similar cars here go for about <strong>{money(suggested)}</strong> a day.{' '}
                <button type="button" className="dr-link" onClick={() => set('dailyRateCents', suggested)}>
                  Use that
                </button>
              </p>
              <div className="dr-grid-3">
                <Field label="Daily rate ($)">
                  {(p) => (
                    <input {...p} type="number" inputMode="numeric" min={20} max={1000} step={1} value={draft.dailyRateCents ? draft.dailyRateCents / 100 : ''} onChange={(e) => set('dailyRateCents', Math.max(0, Number(e.target.value)) * 100)} />
                  )}
                </Field>
                <Field label="Weekly discount (%)">
                  {(p) => <input {...p} type="number" inputMode="numeric" min={0} max={50} value={draft.weeklyDiscountPct} onChange={(e) => set('weeklyDiscountPct', Math.min(50, Math.max(0, Number(e.target.value))))} />}
                </Field>
                <Field label="Monthly discount (%)">
                  {(p) => <input {...p} type="number" inputMode="numeric" min={0} max={60} value={draft.monthlyDiscountPct} onChange={(e) => set('monthlyDiscountPct', Math.min(60, Math.max(0, Number(e.target.value))))} />}
                </Field>
              </div>
              <label className="dr-check dr-check-row">
                <input type="checkbox" checked={draft.instantBook} onChange={() => set('instantBook', !draft.instantBook)} />
                <span>
                  <strong>Instant book</strong>
                  <small>Guests book without waiting for you. Listings with it get booked more.</small>
                </span>
              </label>
              {draft.dailyRateCents >= 2000 ? (
                <p className="dr-note">
                  At {money(draft.dailyRateCents)}/day and 12 shared days, that is about {money(hostMonthlyEstimate(draft.dailyRateCents, 12))} a month.
                </p>
              ) : null}
            </section>
          ) : null}

          {step === 3 ? (
            <section className="dr-panel">
              <h2>House rules</h2>
              <div className="dr-grid-2">
                <Field label="Miles included per day">
                  {(p) => (
                    <select {...p} value={draft.milesPerDay} onChange={(e) => set('milesPerDay', Number(e.target.value))}>
                      {[100, 150, 200, 250, 300].map((m) => (
                        <option key={m} value={m}>
                          {m} miles
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Minimum trip (days)">
                  {(p) => <input {...p} type="number" inputMode="numeric" min={1} max={7} value={draft.minDays} onChange={(e) => set('minDays', Math.max(1, Number(e.target.value)))} />}
                </Field>
              </div>
              <Field label="Guidelines for guests" hint="One rule per line. Shown on the listing and agreed to at booking.">
                {(p) => <textarea {...p} rows={5} value={draft.guidelines} onChange={(e) => set('guidelines', e.target.value)} />}
              </Field>
            </section>
          ) : null}

          {error ? (
            <p className="dr-error dr-error-block" role="alert">
              {error}
            </p>
          ) : null}

          <div className="dr-booking-nav">
            {step > 0 ? (
              <Button variant="secondary" icon="chevron-left" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            ) : (
              <Button variant="secondary" icon="chevron-left" href={DRIVE.host}>
                Host
              </Button>
            )}
            <span className="dr-row">
              <Button variant="ghost" onClick={() => finish('draft')}>
                Save draft
              </Button>
              {step < STEPS.length - 1 ? (
                <Button iconAfter="arrow-right" onClick={next}>
                  Continue
                </Button>
              ) : (
                <Button iconAfter="check" onClick={() => finish('listed')}>
                  Publish listing
                </Button>
              )}
            </span>
          </div>
        </div>

        <aside className="dr-booking-side" aria-label="Preview">
          <div className="dr-panel dr-panel-sticky">
            <p className="dr-eyebrow">Preview</p>
            <div className="dr-booking-car">
              <div style={{ color: '#4B6A88' }}>
                <CarArt body={draft.body} color="#4B6A88" />
              </div>
              <div>
                <strong>
                  {draft.year} {draft.make || 'Make'} {draft.model || 'Model'}
                </strong>
                <span>{draft.neighborhood || 'Neighbourhood'}{draft.city ? `, ${cities.find((c) => c.slug === draft.city)?.name}` : ''}</span>
              </div>
            </div>
            <p className="dr-carcard-price">
              <strong>{draft.dailyRateCents ? money(draft.dailyRateCents) : '$—'}</strong>
              <span>/day</span>
            </p>
            <ul className="dr-carcard-features">
              <li>{draft.seats} seats</li>
              <li>{TRANSMISSIONS.find((t) => t.id === draft.transmission)?.label}</li>
              <li>{FUELS.find((f) => f.id === draft.fuel)?.label}</li>
              {draft.instantBook ? <li>Instant book</li> : null}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

export function ListingsList() {
  const { listings, hydrated } = useDriveState()
  const { setListingStatus, deleteListing } = useDriveActions()
  const toast = useToast()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  if (!hydrated) return <div className="dr-skeleton dr-skeleton-block" aria-busy="true" />
  if (listings.length === 0) {
    return (
      <EmptyState
        icon="key"
        title="No listings yet"
        body="Add your car in four short steps. Drafts stay on this device until you publish."
        action={<Button href={DRIVE.hostNew} icon="plus">List your car</Button>}
      />
    )
  }
  return (
    <ul className="dr-listings">
      {listings.map((l) => (
        <Card as="li" key={l.id} className="dr-listing">
          <div className="dr-listing-art" style={{ color: '#4B6A88' }}>
            <CarArt body={l.body} color="#4B6A88" />
          </div>
          <div className="dr-listing-body">
            <div className="dr-tripcard-head">
              <h3>
                {l.year} {l.make} {l.model}
              </h3>
              <Badge tone={l.status === 'listed' ? 'success' : 'neutral'}>{l.status === 'listed' ? 'Listed' : 'Draft'}</Badge>
            </div>
            <p className="dr-muted">
              {money(l.dailyRateCents)}/day · {l.neighborhood}, {cities.find((c) => c.slug === l.city)?.name} · {l.instantBook ? 'Instant book' : 'Request to book'}
            </p>
            <div className="dr-row">
              <Button size="sm" variant="secondary" href={`${DRIVE.hostNew}?id=${l.id}`}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setListingStatus(l.id, l.status === 'listed' ? 'draft' : 'listed')
                  toast(l.status === 'listed' ? 'Listing paused' : 'Listing published')
                }}
              >
                {l.status === 'listed' ? 'Pause' : 'Publish'}
              </Button>
              {pendingDelete === l.id ? (
                <>
                  <Button size="sm" variant="danger" onClick={() => { deleteListing(l.id); setPendingDelete(null); toast('Listing deleted') }}>
                    Delete for good
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>
                    Keep
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" icon="trash" onClick={() => setPendingDelete(l.id)}>
                  Delete
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </ul>
  )
}
