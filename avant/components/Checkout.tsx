'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_COVERAGE, EXTRAS, getExtra, getPlan, VALUE_TIERS } from '@/lib/catalog'
import { carTitle, getCity } from '@/lib/places'
import { PICKUP_TIMES, addDays, billableDays, formatDate, formatTime, isIsoDate, rangesOverlap, todayIso } from '@/lib/dates'
import { checkEligibility, youngDriverFee } from '@/lib/eligibility'
import { money, moneyExact } from '@/lib/format'
import { quote as makeQuote } from '@/lib/pricing'
import { creditToApply } from '@/lib/circle'
import { blockedRanges } from '@/lib/search'
import type { Car, CoverageId, ExtraId, Quote } from '@/lib/types'
import { CarImage } from './CarImage'
import { CoveragePicker } from './CoveragePicker'
import { useDriver } from './DriverProvider'
import { Icon } from './Icons'
import { PriceBreakdown } from './PriceBreakdown'
import { useSession } from './Session'
import { useToast } from './Toast'
import { Breadcrumbs } from './ui'

export function Checkout({ car }: { car: Car }) {
  const params = useSearchParams()
  const router = useRouter()
  const toast = useToast()
  const { facts, loaded, method, modes } = useDriver()
  const session = useSession()
  const iso = (v: string | null) => (v && isIsoDate(v) ? v : '')
  const [today, setToday] = useState<string | null>(null)
  const [start, setStart] = useState(iso(params.get('start')))
  const [end, setEnd] = useState(iso(params.get('end')))
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('10:00')
  const [coverage, setCoverage] = useState<CoverageId>(DEFAULT_COVERAGE)
  const [extras, setExtras] = useState<ExtraId[]>([])
  const [delivery, setDelivery] = useState(false)
  const [address, setAddress] = useState('')
  const [agree, setAgree] = useState(false)
  const [useCredit, setUseCredit] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const city = getCity(car.city)

  useEffect(() => setToday(todayIso()), [])

  const blocked = useMemo(() => (today ? blockedRanges(car, today) : []), [car, today])
  const days = start && end && end >= start ? billableDays(start, startTime, end, endTime) : 0
  const clash = start && end ? blocked.find((b) => rangesOverlap(start, end, b.start, b.end)) : undefined
  const datesOk = days >= car.minDays && days <= car.maxDays && !clash && Boolean(today && start >= today)
  const elig = today ? checkEligibility(facts, car.valueTier, end || null, today) : null

  const q: Quote = makeQuote({
    dailyRateCents: car.dailyRateCents,
    days: Math.max(1, days),
    weeklyDiscountPct: car.weeklyDiscountPct,
    monthlyDiscountPct: car.monthlyDiscountPct,
    plan: getPlan(coverage),
    delivery: delivery && car.delivery.offered,
    deliveryFeeCents: car.delivery.feeCents,
    extras: extras.map(getExtra),
    taxRate: city?.taxRate ?? 0,
    youngDriverFeeCents: youngDriverFee(facts.age, Math.max(1, days), facts.cleanRecord),
    circle: session.advantage ? { tier: session.advantage.tier, feePct: session.advantage.feePct, freeCancelHours: session.advantage.freeCancelHours } : undefined,
  })
  const creditAvailable = session.advantage?.creditCents ?? 0
  const credit = useCredit && days ? creditToApply(creditAvailable, q.totalCents, Boolean(modes?.payments)) : 0
  const due = q.totalCents - credit

  const canPay = datesOk && Boolean(elig?.ok) && Boolean(session.user) && agree && !busy && (!delivery || address.trim().length >= 6)
  const here = `/checkout/${car.slug}?start=${start}&end=${end}`
  const verifyHref = session.user ? `/verify?next=${encodeURIComponent(here)}` : `/signin?next=${encodeURIComponent(here)}`

  const pay = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: car.slug, start, end, startTime, endTime, coverage, extras, delivery: delivery && car.delivery.offered, deliveryAddress: delivery ? address : '', useCredit, agreeTerms: agree }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Booking failed.')
      if (json.mode === 'stripe' && json.url) {
        window.location.assign(json.url)
        return
      }
      toast(json.status === 'requested' ? 'Request sent' : 'You’re booked')
      void session.refresh()
      router.push(`/trips/${json.bookingId}?new=1`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed.')
      setBusy(false)
    }
  }

  const step1 = datesOk
  const step2 = Boolean(elig?.ok) && Boolean(session.user)

  return (
    <div className="wrap page">
      <Breadcrumbs items={[{ label: 'Search', href: '/search' }, { label: carTitle(car), href: `/cars/${car.slug}` }, { label: 'Checkout' }]} />
      <h1 className="page-title" style={{ marginBottom: 28 }}>
        Almost yours.
      </h1>
      <div className="checkout">
        <div>
          <section className="step" data-done={step1 ? 'true' : undefined} aria-labelledby="s1">
            <div className="step-head">
              <span className="step-num">{step1 ? <Icon name="check" size={15} /> : 1}</span>
              <h2 id="s1">When</h2>
            </div>
            <div className="grid-2">
              <label className="field">
                <span className="label">Pickup</span>
                <input className="input" type="date" min={today ?? undefined} value={start} onChange={(e) => { setStart(e.target.value); if (end && e.target.value > end) setEnd(addDays(e.target.value, car.minDays)) }} />
              </label>
              <label className="field">
                <span className="label">Pickup time</span>
                <select className="select" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                  {PICKUP_TIMES.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="label">Return</span>
                <input className="input" type="date" min={start || today || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
              <label className="field">
                <span className="label">Return time</span>
                <select className="select" value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                  {PICKUP_TIMES.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                </select>
              </label>
            </div>
            {clash ? <p className="error" style={{ marginTop: 10 }}>Booked {formatDate(clash.start)} – {formatDate(clash.end)}.</p> : null}
            {days > 0 && !clash && !datesOk ? <p className="error" style={{ marginTop: 10 }}>{car.minDays}–{car.maxDays} days on this car, starting today or later.</p> : null}
            {car.delivery.offered ? (
              <div className="stack" style={{ marginTop: 16, gap: 10 }}>
                <label className="check">
                  <input type="checkbox" checked={delivery} onChange={() => setDelivery((d) => !d)} />
                  <span>
                    Deliver it to me for {money(car.delivery.feeCents)} <span className="dim">(within {car.delivery.radiusMiles} mi, airports included)</span>
                  </span>
                </label>
                {delivery ? <input className="input" placeholder="Address, hotel or terminal" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" aria-label="Delivery address" /> : null}
              </div>
            ) : null}
          </section>

          <section className="step" data-done={step2 ? 'true' : undefined} aria-labelledby="s2">
            <div className="step-head">
              <span className="step-num">{step2 ? <Icon name="check" size={15} /> : 2}</span>
              <h2 id="s2">Driver</h2>
            </div>
            <div className="driver-pass" data-verified={facts.verified ? 'true' : undefined}>
              <span className="driver-pass-icon">
                <Icon name={facts.verified ? 'check' : 'id'} size={22} />
              </span>
              <div style={{ flex: 1, minWidth: 200 }}>
                {!loaded || !session.loaded ? (
                  <strong>Checking your Driver Pass…</strong>
                ) : !session.user ? (
                  <>
                    <strong>Sign in to book</strong>
                    <p className="small muted">One account for your trips, messages with your host and your Driver Pass.</p>
                  </>
                ) : facts.verified ? (
                  <>
                    <strong>Driver Pass verified{method === 'demo' ? ' (preview)' : ''}</strong>
                    <p className="small muted">
                      Age {facts.age} · licensed {facts.licenceYears} yr · valid to {facts.licenceExpires}
                      {facts.cleanRecord ? ' · clean record' : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <strong>Verify your licence once</strong>
                    <p className="small muted">About two minutes. We keep your age and licence validity, never your ID or photos.</p>
                  </>
                )}
              </div>
              {(!facts.verified || !session.user) && loaded && session.loaded ? (
                <Link href={verifyHref} className="btn btn-primary btn-md">
                  {session.user ? 'Verify now' : 'Sign in'}
                </Link>
              ) : null}
            </div>
            {facts.verified && elig && !elig.ok ? (
              <div className="error-block" style={{ marginTop: 12 }} role="alert">
                {elig.messages.join(' ')}{' '}
                <Link href={`/search?city=${car.city}`} className="link">
                  See cars you can book
                </Link>
              </div>
            ) : null}
            {facts.verified && elig?.ok && q.youngDriverCents ? (
              <p className="small muted" style={{ marginTop: 10 }}>
                Young driver fee: {moneyExact(elig.youngDriverPerDayCents)}/day, capped at {moneyExact(elig.youngDriverCapCents)} a trip{facts.cleanRecord ? ' (clean-record rate)' : '. Halve it with a verified clean record.'}
              </p>
            ) : null}
            <p className="small dim" style={{ marginTop: 10 }}>
              {VALUE_TIERS[car.valueTier].label} class: {VALUE_TIERS[car.valueTier].blurb}
            </p>
          </section>

          <section className="step" aria-labelledby="s3">
            <div className="step-head">
              <span className="step-num">3</span>
              <h2 id="s3">Coverage</h2>
            </div>
            <p className="muted" style={{ marginBottom: 14 }}>
              Pick the most you&apos;d pay if the car is damaged. Third-party liability is included either way.{' '}
              <Link href="/coverage" className="link">
                30-second explainer
              </Link>
            </p>
            <CoveragePicker value={coverage} onChange={setCoverage} tripCents={q.tripCents} days={Math.max(1, days)} />
          </section>

          <section className="step" aria-labelledby="s4">
            <div className="step-head">
              <span className="step-num">4</span>
              <h2 id="s4">Extras</h2>
              <span className="small dim">optional</span>
            </div>
            <div>
              {EXTRAS.map((x) => {
                const on = extras.includes(x.id)
                const cost = (x.perTripCents ?? 0) + (x.perDayCents ?? 0) * Math.max(1, days)
                return (
                  <label key={x.id} className="extra check" style={{ display: 'grid' }}>
                    <input type="checkbox" checked={on} onChange={() => setExtras((l) => (on ? l.filter((i) => i !== x.id) : [...l, x.id]))} />
                    <span>
                      <strong>{x.name}</strong>
                      <span className="small muted" style={{ display: 'block' }}>
                        {x.description}
                      </span>
                    </span>
                    <span className="tabular">{money(cost)}</span>
                  </label>
                )
              })}
            </div>
          </section>

          <section className="step" aria-labelledby="s5">
            <div className="step-head">
              <span className="step-num">5</span>
              <h2 id="s5">Confirm</h2>
            </div>
            <label className="check">
              <input type="checkbox" checked={agree} onChange={() => setAgree((a) => !a)} />
              <span className="muted">
                I agree to the host&apos;s rules, the <Link href="/legal/terms" className="link">trip terms</Link> and the {getPlan(coverage).name} coverage summary. Free cancellation until 24 hours before pickup.
              </span>
            </label>
            {creditAvailable > 0 ? (
              <label className="check" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={useCredit} onChange={() => setUseCredit((u) => !u)} />
                <span>
                  <strong>Use my AVANT credit</strong>
                  <span className="small muted" style={{ display: 'block' }}>
                    {moneyExact(creditAvailable)} in your wallet{credit ? `; ${moneyExact(credit)} comes off this trip` : ''}.
                  </span>
                </span>
              </label>
            ) : null}
            {error ? <p className="error-block" role="alert" style={{ marginTop: 12 }}>{error}</p> : null}
            <button type="button" className="btn btn-primary btn-lg btn-block" style={{ marginTop: 18 }} disabled={!canPay} onClick={pay}>
              <Icon name="lock" size={17} />
              {busy ? 'Confirming…' : modes?.payments ? `Pay ${moneyExact(due)}` : car.instantBook ? `Confirm preview booking · ${moneyExact(due)}` : `Request to book · ${moneyExact(due)}`}
            </button>
            <p className="small dim" style={{ marginTop: 10 }}>
              {modes?.payments ? 'Card details are entered on Stripe’s secure page. AVANT never sees your card number.' : 'Preview mode: nothing is charged.'} The price is re-checked on our server before anything is confirmed.
            </p>
          </section>
        </div>

        <aside className="sticky" aria-label="Your total">
          <div className="bookcard">
            <div className="row" style={{ gap: 12 }}>
              <div style={{ width: 96, borderRadius: 12, overflow: 'hidden', flex: 'none' }}>
                <CarImage body={car.body} color={car.color.hex} photo={car.photos[0]} sample={car.sample} alt="" />
              </div>
              <div>
                <strong>{carTitle(car)}</strong>
                <div className="small muted">{car.neighborhood}, {city?.name}</div>
                {days ? <div className="small muted">{formatDate(start)} → {formatDate(end)} · {days} days</div> : null}
              </div>
            </div>
            <hr className="hairline" style={{ margin: 0 }} />
            {days ? <PriceBreakdown quote={q} credit={credit} /> : <p className="muted small">Pick dates for the full price.</p>}
          </div>
        </aside>
      </div>
      <div className="mobile-pay">
        <div>
          <div className="small muted">Total{days ? `, ${days} days` : ''}</div>
          <strong style={{ fontSize: '1.2rem' }} className="tabular">{days ? moneyExact(due) : '—'}</strong>
        </div>
        <a href="#s5" className="btn btn-primary btn-md">Review &amp; pay</a>
      </div>
    </div>
  )
}
