'use client'

/**
 * List your car in five short steps. Everything is checked against the same
 * rules the tests cover (lib/listing.ts), the price suggestion comes from
 * live local medians, and a draft is saved on this device at every step.
 */

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { BODY_TYPES, FUELS, HOST_SHARE_PCT, TRANSMISSIONS, tierForRate, VALUE_TIERS } from '@/lib/catalog'
import { cities, medianRateCents } from '@/lib/data'
import { money, shortId } from '@/lib/format'
import { checkVin, MAX_MILES, MAX_VEHICLE_AGE_YEARS, normaliseVin, problemsFor, validateListing, type Listing, type ListingDraft, type ListingStep } from '@/lib/listing'
import { hostMonthlyEstimate } from '@/lib/pricing'
import { actions, useLocal } from '@/lib/store'
import type { BodyType, Fuel, Transmission } from '@/lib/types'
import { CarImage } from './CarImage'
import { Icon } from './Icons'
import { useToast } from './Toast'
import { Breadcrumbs } from './ui'

const STEPS: { id: ListingStep | 'review'; label: string }[] = [
  { id: 'car', label: 'Car' },
  { id: 'location', label: 'Where' },
  { id: 'price', label: 'Price' },
  { id: 'safety', label: 'Safety' },
  { id: 'review', label: 'Review' },
]

const EMPTY: ListingDraft = {
  vin: '',
  year: new Date().getFullYear() - 3,
  make: '',
  model: '',
  body: 'suv',
  fuel: 'gas',
  transmission: 'automatic',
  seats: 5,
  miles: 0,
  city: '',
  neighborhood: '',
  deliveryOffered: false,
  deliveryFeeCents: 3_500,
  dailyRateCents: 0,
  weeklyDiscountPct: 10,
  instantBook: true,
  noOpenRecalls: false,
  insuredAndRegistered: false,
}

const PREVIEW_TINT = '#d4ff3a'

/** "SUVs", "sedans", "vans": keeps acronyms upper case. */
function pluralType(body: BodyType): string {
  const label = BODY_TYPES.find((b) => b.id === body)?.label ?? body
  return label === label.toUpperCase() ? `${label}s` : `${label.toLowerCase()}s`
}

export function ListingWizard() {
  const params = useSearchParams()
  const router = useRouter()
  const toast = useToast()
  const { listings, hydrated } = useLocal()
  const editId = params.get('id')
  const [id] = useState(() => editId ?? shortId('lst'))
  const [step, setStep] = useState(0)
  const [d, setD] = useState<ListingDraft>(EMPTY)
  const [touched, setTouched] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const year = new Date().getFullYear()

  useEffect(() => {
    if (!hydrated || loaded) return
    const existing = editId ? listings.find((l) => l.id === editId) : undefined
    if (existing) {
      const { id: _i, status: _s, updatedAt: _u, ...rest } = existing
      setD(rest)
    }
    setLoaded(true)
  }, [hydrated, loaded, editId, listings])

  const problems = useMemo(() => validateListing(d, year), [d, year])
  const current = STEPS[step].id
  const stepProblems = current === 'review' ? problems : problemsFor(current, problems)
  const suggested = medianRateCents(d.body, d.city || undefined)
  const tier = d.dailyRateCents ? tierForRate(d.dailyRateCents) : null
  const vin = checkVin(d.vin)
  const set = <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) => setD((prev) => ({ ...prev, [k]: v }))
  const err = (field: keyof ListingDraft) => (touched ? stepProblems.find((p) => p.field === field)?.message : undefined)

  const persist = (status: Listing['status']) => {
    actions.saveListing({ ...d, vin: normaliseVin(d.vin), id, status, updatedAt: new Date().toISOString() })
  }

  const next = () => {
    setTouched(true)
    if (stepProblems.length) return
    persist('draft')
    setTouched(false)
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = () => {
    setTouched(true)
    if (problems.length) {
      const first = STEPS.findIndex((s) => s.id === problems[0].step)
      setStep(first)
      return
    }
    persist('submitted')
    toast('Listing submitted')
    router.push('/host/listings')
  }

  if (!hydrated) return <div className="skeleton" />

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Host', href: '/host' }, { label: editId ? 'Edit listing' : 'List your car' }]} />
      <h1 className="page-title" style={{ marginBottom: 24 }}>
        List your car.
      </h1>

      <ol className="row" aria-label="Steps" style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', gap: 8 }}>
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className="chip"
              aria-current={i === step ? 'step' : undefined}
              aria-pressed={i === step}
              disabled={i > step}
              onClick={() => i < step && setStep(i)}
            >
              {i < step ? <Icon name="check" size={14} /> : <span className="dim">{i + 1}</span>} {s.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="checkout">
        <div className="stack" style={{ gap: 18 }}>
          {current === 'car' ? (
            <section className="panel stack" aria-labelledby="h-car">
              <h2 id="h-car" style={{ fontSize: '1.3rem' }}>Tell us about the car</h2>
              <label className="field">
                <span className="label">VIN</span>
                <input
                  className="input"
                  value={d.vin}
                  onChange={(e) => set('vin', e.target.value.toUpperCase().slice(0, 20))}
                  placeholder="17 characters, on the dashboard or door frame"
                  aria-invalid={Boolean(err('vin'))}
                  autoCapitalize="characters"
                  spellCheck={false}
                  style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em' }}
                />
                {vin === 'ok' ? (
                  <span className="small" style={{ color: 'var(--ok)' }}>
                    <Icon name="check" size={13} /> Check digit matches
                  </span>
                ) : err('vin') ? (
                  <span className="error">{err('vin')}</span>
                ) : (
                  <span className="hint">We check the VIN&apos;s built-in check digit so typos are caught now, not at the first trip.</span>
                )}
              </label>
              <div className="grid-2">
                <label className="field">
                  <span className="label">Year</span>
                  <input className="input" inputMode="numeric" value={d.year || ''} onChange={(e) => set('year', Number(e.target.value.replace(/\D/g, '').slice(0, 4)))} aria-invalid={Boolean(err('year'))} />
                  {err('year') ? <span className="error">{err('year')}</span> : <span className="hint">Up to {MAX_VEHICLE_AGE_YEARS} years old.</span>}
                </label>
                <label className="field">
                  <span className="label">Mileage</span>
                  <input className="input" inputMode="numeric" value={d.miles || ''} onChange={(e) => set('miles', Number(e.target.value.replace(/\D/g, '').slice(0, 7)))} aria-invalid={Boolean(err('miles'))} />
                  {err('miles') ? <span className="error">{err('miles')}</span> : <span className="hint">Under {MAX_MILES.toLocaleString('en-US')} miles.</span>}
                </label>
                <label className="field">
                  <span className="label">Make</span>
                  <input className="input" value={d.make} onChange={(e) => set('make', e.target.value.slice(0, 40))} placeholder="Toyota" aria-invalid={Boolean(err('make'))} />
                  {err('make') ? <span className="error">{err('make')}</span> : null}
                </label>
                <label className="field">
                  <span className="label">Model</span>
                  <input className="input" value={d.model} onChange={(e) => set('model', e.target.value.slice(0, 40))} placeholder="RAV4 Hybrid" aria-invalid={Boolean(err('model'))} />
                  {err('model') ? <span className="error">{err('model')}</span> : null}
                </label>
                <label className="field">
                  <span className="label">Type</span>
                  <select className="select" value={d.body} onChange={(e) => set('body', e.target.value as BodyType)}>
                    {BODY_TYPES.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="label">Power</span>
                  <select className="select" value={d.fuel} onChange={(e) => set('fuel', e.target.value as Fuel)}>
                    {FUELS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="label">Transmission</span>
                  <select className="select" value={d.transmission} onChange={(e) => set('transmission', e.target.value as Transmission)}>
                    {TRANSMISSIONS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="label">Seats</span>
                  <input className="input" inputMode="numeric" value={d.seats || ''} onChange={(e) => set('seats', Number(e.target.value.replace(/\D/g, '').slice(0, 2)))} aria-invalid={Boolean(err('seats'))} />
                  {err('seats') ? <span className="error">{err('seats')}</span> : null}
                </label>
              </div>
            </section>
          ) : null}

          {current === 'location' ? (
            <section className="panel stack" aria-labelledby="h-loc">
              <h2 id="h-loc" style={{ fontSize: '1.3rem' }}>Where do guests pick it up?</h2>
              <div className="grid-2">
                <label className="field">
                  <span className="label">City</span>
                  <select className="select" value={d.city} onChange={(e) => set('city', e.target.value)} aria-invalid={Boolean(err('city'))}>
                    <option value="">Choose…</option>
                    {cities.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}, {c.state}
                      </option>
                    ))}
                  </select>
                  {err('city') ? <span className="error">{err('city')}</span> : null}
                </label>
                <label className="field">
                  <span className="label">Neighbourhood</span>
                  <input className="input" value={d.neighborhood} onChange={(e) => set('neighborhood', e.target.value.slice(0, 60))} aria-invalid={Boolean(err('neighborhood'))} />
                  {err('neighborhood') ? <span className="error">{err('neighborhood')}</span> : <span className="hint">Guests see this. The exact spot is shared only after booking.</span>}
                </label>
              </div>
              <label className="check">
                <input type="checkbox" checked={d.deliveryOffered} onChange={() => set('deliveryOffered', !d.deliveryOffered)} />
                <span>
                  <strong>Offer delivery</strong>
                  <span className="small muted" style={{ display: 'block' }}>
                    Bring the car to the guest, including airports. Delivered trips book more often.
                  </span>
                </span>
              </label>
              {d.deliveryOffered ? (
                <label className="field" style={{ maxWidth: 220 }}>
                  <span className="label">Delivery fee ($)</span>
                  <input className="input" inputMode="numeric" value={d.deliveryFeeCents / 100 || ''} onChange={(e) => set('deliveryFeeCents', Number(e.target.value.replace(/\D/g, '').slice(0, 3)) * 100)} />
                  {err('deliveryFeeCents') ? <span className="error">{err('deliveryFeeCents')}</span> : null}
                </label>
              ) : null}
            </section>
          ) : null}

          {current === 'price' ? (
            <section className="panel stack" aria-labelledby="h-price">
              <h2 id="h-price" style={{ fontSize: '1.3rem' }}>Set your price</h2>
              <p className="muted">
                Similar {pluralType(d.body)}{d.city ? ` in ${cities.find((c) => c.slug === d.city)?.name}` : ''} go for about{' '}
                <strong>{money(suggested)}</strong> a day.{' '}
                <button type="button" className="link" onClick={() => set('dailyRateCents', suggested)}>
                  Use that
                </button>
              </p>
              <div className="grid-2">
                <label className="field">
                  <span className="label">Daily rate ($)</span>
                  <input className="input" inputMode="numeric" value={d.dailyRateCents / 100 || ''} onChange={(e) => set('dailyRateCents', Number(e.target.value.replace(/\D/g, '').slice(0, 4)) * 100)} aria-invalid={Boolean(err('dailyRateCents'))} />
                  {err('dailyRateCents') ? <span className="error">{err('dailyRateCents')}</span> : null}
                </label>
                <label className="field">
                  <span className="label">Weekly discount (%)</span>
                  <input className="input" inputMode="numeric" value={d.weeklyDiscountPct} onChange={(e) => set('weeklyDiscountPct', Number(e.target.value.replace(/\D/g, '').slice(0, 2)))} aria-invalid={Boolean(err('weeklyDiscountPct'))} />
                  {err('weeklyDiscountPct') ? <span className="error">{err('weeklyDiscountPct')}</span> : null}
                </label>
              </div>
              <label className="check">
                <input type="checkbox" checked={d.instantBook} onChange={() => set('instantBook', !d.instantBook)} />
                <span>
                  <strong>Instant book</strong>
                  <span className="small muted" style={{ display: 'block' }}>
                    Verified guests book without waiting for you. Their age and licence are checked before they can.
                  </span>
                </span>
              </label>
              {d.dailyRateCents >= 2_000 && tier ? (
                <div className="notice">
                  <Icon name="sparkle" size={18} />
                  <div>
                    At {money(d.dailyRateCents)}/day and 12 booked days a month you&apos;d keep about{' '}
                    <strong>{money(hostMonthlyEstimate(d.dailyRateCents, 12, HOST_SHARE_PCT))}</strong>. This rate puts the car in the{' '}
                    {VALUE_TIERS[tier].label} class. {VALUE_TIERS[tier].blurb}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {current === 'safety' ? (
            <section className="panel stack" aria-labelledby="h-safety">
              <h2 id="h-safety" style={{ fontSize: '1.3rem' }}>Safety check</h2>
              <p className="muted">
                Look up open recalls with your VIN on the official{' '}
                <a className="link" href="https://www.nhtsa.gov/recalls" target="_blank" rel="noopener noreferrer">
                  NHTSA recall search
                </a>
                . It takes ten seconds.
              </p>
              <label className="check">
                <input type="checkbox" checked={d.noOpenRecalls} onChange={() => set('noOpenRecalls', !d.noOpenRecalls)} />
                <span>
                  <strong>There are no open safety recalls on this car.</strong>
                  <span className="small muted" style={{ display: 'block' }}>
                    Cars with an unrepaired recall can&apos;t be shared until it&apos;s fixed.
                  </span>
                </span>
              </label>
              {err('noOpenRecalls') ? <span className="error">{err('noOpenRecalls')}</span> : null}
              <label className="check">
                <input type="checkbox" checked={d.insuredAndRegistered} onChange={() => set('insuredAndRegistered', !d.insuredAndRegistered)} />
                <span>
                  <strong>It&apos;s registered and insured in my name.</strong>
                  <span className="small muted" style={{ display: 'block' }}>
                    During trips AVANT&apos;s program covers liability; your own policy covers the car the rest of the time.
                  </span>
                </span>
              </label>
              {err('insuredAndRegistered') ? <span className="error">{err('insuredAndRegistered')}</span> : null}
            </section>
          ) : null}

          {current === 'review' ? (
            <section className="panel stack" aria-labelledby="h-review">
              <h2 id="h-review" style={{ fontSize: '1.3rem' }}>Ready to submit</h2>
              <dl className="kv">
                <div>
                  <dt>Car</dt>
                  <dd>
                    {d.year} {d.make} {d.model} · {d.seats} seats · {d.miles.toLocaleString('en-US')} mi
                  </dd>
                </div>
                <div>
                  <dt>VIN</dt>
                  <dd className="tabular">{normaliseVin(d.vin)}</dd>
                </div>
                <div>
                  <dt>Pickup</dt>
                  <dd>
                    {d.neighborhood}, {cities.find((c) => c.slug === d.city)?.name}
                    {d.deliveryOffered ? ` · delivers for ${money(d.deliveryFeeCents)}` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Price</dt>
                  <dd>
                    {money(d.dailyRateCents)}/day · {d.weeklyDiscountPct}% off weekly · {d.instantBook ? 'Instant book' : 'Request to book'}
                  </dd>
                </div>
              </dl>
              <p className="small muted">
                Submitted listings go live when hosting opens in your city. We&apos;ll confirm the VIN against registration records and photograph
                requirements before the first trip.
              </p>
              {touched && problems.length ? (
                <p className="error-block" role="alert">
                  {problems[0].message}
                </p>
              ) : null}
            </section>
          ) : null}

          {touched && stepProblems.length && current !== 'review' ? (
            <p className="error-block" role="alert">
              {stepProblems.length === 1 ? stepProblems[0].message : `${stepProblems.length} things to fix above.`}
            </p>
          ) : null}

          <div className="between">
            {step > 0 ? (
              <button type="button" className="btn btn-secondary btn-md" onClick={() => setStep((s) => s - 1)}>
                <Icon name="chevron-left" size={16} /> Back
              </button>
            ) : (
              <Link href="/host" className="btn btn-secondary btn-md">
                <Icon name="chevron-left" size={16} /> Host
              </Link>
            )}
            <div className="row">
              <button
                type="button"
                className="btn btn-ghost btn-md"
                onClick={() => {
                  persist('draft')
                  toast('Draft saved on this device')
                }}
              >
                Save draft
              </button>
              {current === 'review' ? (
                <button type="button" className="btn btn-primary btn-md" onClick={submit}>
                  Submit listing <Icon name="check" size={16} />
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-md" onClick={next}>
                  Continue <Icon name="arrow-right" size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="sticky" aria-label="Preview">
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            How guests will see it
          </p>
          <article className="carcard">
            <div className="carcard-badges">
              {d.instantBook ? (
                <span className="badge badge-glass">
                  <Icon name="bolt" size={12} /> Instant
                </span>
              ) : null}
              {d.fuel === 'electric' ? <span className="badge badge-glass">EV</span> : null}
            </div>
            <CarImage body={d.body} color={PREVIEW_TINT} alt="" />
            <div className="carcard-body">
              <div className="carcard-title">
                <h3>{d.make || d.model ? `${d.year} ${d.make} ${d.model}`.trim() : 'Your car'}</h3>
                <span className="badge">New</span>
              </div>
              <p className="carcard-meta">
                {d.neighborhood || 'Neighbourhood'}
                {d.city ? `, ${cities.find((c) => c.slug === d.city)?.name}` : ''}
                {d.deliveryOffered ? ' · Delivers' : ''}
              </p>
              <p className="carcard-price">
                <strong>{d.dailyRateCents ? money(d.dailyRateCents) : '$—'}</strong>
                <span>/day rate</span>
              </p>
            </div>
          </article>
          <p className="small dim" style={{ marginTop: 10 }}>
            Guests see the all-in price including the trip fee and their coverage. You keep {HOST_SHARE_PCT}% of the rate.
          </p>
        </aside>
      </div>
    </div>
  )
}

export function MyListings() {
  const { listings, hydrated } = useLocal()
  const toast = useToast()
  const [confirm, setConfirm] = useState<string | null>(null)
  if (!hydrated) return <div className="skeleton" />
  if (!listings.length) {
    return (
      <div className="empty">
        <Icon name="key" size={30} className="dim" />
        <h2>No listings yet</h2>
        <p>Five short steps. Drafts save on this device as you go.</p>
        <Link href="/host/new" className="btn btn-primary btn-md">
          <Icon name="plus" size={16} /> List your car
        </Link>
      </div>
    )
  }
  return (
    <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {listings.map((l) => (
        <li key={l.id} className="panel row" style={{ gap: 18, alignItems: 'center' }}>
          <div style={{ width: 140, borderRadius: 14, overflow: 'hidden', flex: 'none' }}>
            <CarImage body={l.body} color={PREVIEW_TINT} alt="" />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="row">
              <strong style={{ fontSize: '1.05rem' }}>
                {l.year} {l.make} {l.model}
              </strong>
              <span className={l.status === 'submitted' ? 'badge badge-lime' : 'badge'}>{l.status === 'submitted' ? 'Submitted' : 'Draft'}</span>
            </div>
            <p className="small muted" style={{ marginTop: 4 }}>
              {l.dailyRateCents ? `${money(l.dailyRateCents)}/day · ` : ''}
              {l.neighborhood || 'No location yet'}
              {l.city ? `, ${cities.find((c) => c.slug === l.city)?.name}` : ''} · updated {new Date(l.updatedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="row">
            <Link href={`/host/new?id=${l.id}`} className="btn btn-secondary btn-sm">
              Edit
            </Link>
            {confirm === l.id ? (
              <>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    actions.deleteListing(l.id)
                    setConfirm(null)
                    toast('Listing deleted')
                  }}
                >
                  Delete for good
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(l.id)} aria-label={`Delete ${l.make} ${l.model}`}>
                <Icon name="trash" size={15} />
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
