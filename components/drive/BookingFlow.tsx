'use client'

/**
 * /drive/book/[slug]/. Four short steps with one question each: when, how
 * protected, anything extra, and a final check. The quote is recomputed on
 * every change and the total is visible on every step, so nothing appears at
 * the end that was not there at the start.
 */

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { EXTRAS, getExtra, getPlan } from '@/lib/drive/catalog'
import { DEFAULT_PICKUP_TIME, DEFAULT_RETURN_TIME } from '@/lib/drive/config'
import { carTitle, getCity, getHost } from '@/lib/drive/data'
import { PICKUP_TIMES, addDays, billableDays, formatDate, formatRange, formatTime, rangesOverlap, todayIso } from '@/lib/drive/dates'
import { money, moneyExact, plural } from '@/lib/drive/format'
import { quote } from '@/lib/drive/pricing'
import { DRIVE } from '@/lib/drive/routes'
import { blockedRanges } from '@/lib/drive/search'
import { useDriveActions, useDriveState } from '@/lib/drive/store'
import type { Car, ExtraId, ProtectionPlanId } from '@/lib/drive/types'
import { CarArt } from './CarArt'
import { Icon } from './Icons'
import { PriceBreakdown } from './PriceBreakdown'
import { ProtectionPicker } from './ProtectionPicker'
import { useToast } from './Toast'
import { Button, Field, Breadcrumbs } from './ui'

const STEPS = ['Dates', 'Protection', 'Extras', 'Review'] as const

export function BookingFlow({ car, initialStart, initialEnd }: { car: Car; initialStart: string; initialEnd: string }) {
  const router = useRouter()
  const toast = useToast()
  const { prefs, hydrated } = useDriveState()
  const { bookTrip } = useDriveActions()
  const host = getHost(car.hostId)
  const city = getCity(car.city)

  const [today, setToday] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd)
  const [startTime, setStartTime] = useState(DEFAULT_PICKUP_TIME)
  const [endTime, setEndTime] = useState(DEFAULT_RETURN_TIME)
  const [plan, setPlan] = useState<ProtectionPlanId>('standard')
  const [delivery, setDelivery] = useState(false)
  const [address, setAddress] = useState('')
  const [extras, setExtras] = useState<ExtraId[]>([])
  const [driverName, setDriverName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setToday(todayIso()), [])
  useEffect(() => {
    if (hydrated && prefs.name && !driverName) setDriverName(prefs.name)
  }, [hydrated, prefs.name, driverName])
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  const blocked = useMemo(() => (today ? blockedRanges(car, today) : []), [car, today])
  const days = start && end && end >= start ? billableDays(start, startTime, end, endTime) : 0
  const conflict = start && end ? blocked.find((b) => rangesOverlap(start, end, b.start, b.end)) : undefined
  const datesValid = days >= car.minDays && days <= car.maxDays && !conflict && (!today || start >= today)

  const q = useMemo(
    () =>
      quote({
        dailyRateCents: car.dailyRateCents,
        days: Math.max(1, days),
        weeklyDiscountPct: car.weeklyDiscountPct,
        monthlyDiscountPct: car.monthlyDiscountPct,
        plan: getPlan(plan),
        delivery: delivery && car.delivery.offered,
        deliveryFeeCents: car.delivery.feeCents,
        extras: extras.map(getExtra),
        taxRate: city?.taxRate ?? 0,
      }),
    [car, days, plan, delivery, extras, city],
  )

  const next = () => {
    setError(null)
    if (step === 0) {
      if (!start || !end) return setError('Choose a pickup and a return date.')
      if (today && start < today) return setError('Pickup is in the past.')
      if (conflict) return setError(`The car is booked ${formatDate(conflict.start)} to ${formatDate(conflict.end)}.`)
      if (days < car.minDays) return setError(`This car has a ${plural(car.minDays, 'day')} minimum.`)
      if (days > car.maxDays) return setError(`Trips on this car run up to ${car.maxDays} days.`)
      if (delivery && address.trim().length < 6) return setError('Add the delivery address, or turn delivery off.')
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const confirm = () => {
    setError(null)
    if (driverName.trim().length < 2) return setError('Add the driver’s name as it appears on the licence.')
    if (!agreed) return setError('Please agree to the host’s guidelines and the terms.')
    const trip = bookTrip(
      {
        carId: car.id,
        start,
        end,
        startTime,
        endTime,
        plan,
        delivery: delivery && car.delivery.offered,
        deliveryAddress: delivery ? address.trim() : '',
        extras,
        driverName: driverName.trim(),
        quote: q,
      },
      host.id,
      `Hi ${driverName.trim().split(' ')[0]}, thanks for booking the ${carTitle(car)}. I'll send the exact pickup spot in ${car.neighborhood} the day before. Anything you need in the meantime, just ask.`,
    )
    toast('Trip booked')
    router.push(`${DRIVE.trip(trip.id)}?new=1`)
  }

  return (
    <div className="dr-booking">
      <Breadcrumbs items={[{ label: 'Explore', href: DRIVE.cars }, { label: carTitle(car), href: DRIVE.car(car.slug) }, { label: 'Book' }]} />

      <ol className="dr-steps" aria-label="Booking steps">
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
            <section className="dr-panel" aria-labelledby="dr-step-dates">
              <h2 id="dr-step-dates">When do you need it?</h2>
              <div className="dr-grid-2">
                <Field label="Pickup date">
                  {(p) => (
                    <input
                      {...p}
                      type="date"
                      min={today ?? undefined}
                      value={start}
                      onChange={(e) => {
                        setStart(e.target.value)
                        if (end && e.target.value && end < e.target.value) setEnd(addDays(e.target.value, car.minDays))
                      }}
                    />
                  )}
                </Field>
                <Field label="Pickup time">
                  {(p) => (
                    <select {...p} value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                      {PICKUP_TIMES.map((t) => (
                        <option key={t} value={t}>
                          {formatTime(t)}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Return date">
                  {(p) => <input {...p} type="date" min={start || today || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />}
                </Field>
                <Field label="Return time" hint="Billed in 24-hour blocks from pickup, rounded up.">
                  {(p) => (
                    <select {...p} value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                      {PICKUP_TIMES.map((t) => (
                        <option key={t} value={t}>
                          {formatTime(t)}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>
              {days > 0 ? (
                <p className="dr-note" aria-live="polite">
                  {datesValid ? (
                    <>
                      <Icon name="check" size={15} /> {plural(days, 'day')}: {formatRange(start, end)}
                    </>
                  ) : conflict ? (
                    <>Booked {formatDate(conflict.start)} to {formatDate(conflict.end)}.</>
                  ) : (
                    <>Between {car.minDays} and {car.maxDays} days on this car.</>
                  )}
                </p>
              ) : null}

              {car.delivery.offered ? (
                <fieldset className="dr-fieldset dr-fieldset-boxed">
                  <legend>Pickup</legend>
                  <label className="dr-check dr-check-row">
                    <input type="radio" name="pickup" checked={!delivery} onChange={() => setDelivery(false)} />
                    <span>
                      <strong>Pick it up in {car.neighborhood}</strong>
                      <small>Exact spot shared after booking. Free.</small>
                    </span>
                  </label>
                  <label className="dr-check dr-check-row">
                    <input type="radio" name="pickup" checked={delivery} onChange={() => setDelivery(true)} />
                    <span>
                      <strong>Have it delivered</strong>
                      <small>
                        Within {car.delivery.radiusMiles} miles for {money(car.delivery.feeCents)}.
                      </small>
                    </span>
                  </label>
                  {delivery ? (
                    <Field label="Delivery address" hint="Street address, hotel or terminal.">
                      {(p) => <input {...p} type="text" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />}
                    </Field>
                  ) : null}
                </fieldset>
              ) : null}
            </section>
          ) : null}

          {step === 1 ? (
            <section className="dr-panel" aria-labelledby="dr-step-plan">
              <h2 id="dr-step-plan">How covered do you want to be?</h2>
              <p className="dr-lead">Priced against your {plural(days, 'day')} trip. Change it any time before pickup.</p>
              <ProtectionPicker value={plan} onChange={setPlan} tripCents={q.tripCents} />
            </section>
          ) : null}

          {step === 2 ? (
            <section className="dr-panel" aria-labelledby="dr-step-extras">
              <h2 id="dr-step-extras">Anything extra?</h2>
              <p className="dr-lead">All optional. Added to the total on the right as you tick them.</p>
              <div className="dr-extras">
                {EXTRAS.map((extra) => {
                  const on = extras.includes(extra.id)
                  const cost = (extra.perTripCents ?? 0) + (extra.perDayCents ?? 0) * Math.max(1, days)
                  return (
                    <label key={extra.id} className="dr-check dr-check-row dr-extra" data-checked={on ? 'true' : undefined}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setExtras((list) => (on ? list.filter((id) => id !== extra.id) : [...list, extra.id]))}
                      />
                      <span>
                        <strong>{extra.name}</strong>
                        <small>{extra.description}</small>
                      </span>
                      <em>
                        {money(cost)}
                        {extra.perDayCents ? <small> ({money(extra.perDayCents)}/day)</small> : null}
                      </em>
                    </label>
                  )
                })}
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="dr-panel" aria-labelledby="dr-step-review">
              <h2 id="dr-step-review">One last look</h2>
              <dl className="dr-summary">
                <div>
                  <dt>Car</dt>
                  <dd>{carTitle(car)}, {car.color.name.toLowerCase()}</dd>
                </div>
                <div>
                  <dt>Dates</dt>
                  <dd>
                    {formatDate(start, true)} {formatTime(startTime)} → {formatDate(end, true)} {formatTime(endTime)}
                  </dd>
                </div>
                <div>
                  <dt>Pickup</dt>
                  <dd>{delivery ? `Delivered to ${address}` : `${car.neighborhood}, ${city?.name}`}</dd>
                </div>
                <div>
                  <dt>Protection</dt>
                  <dd>{getPlan(plan).name}</dd>
                </div>
                <div>
                  <dt>Host</dt>
                  <dd>
                    {host.name} · replies in about {host.responseMinutes} min
                  </dd>
                </div>
              </dl>
              <Field label="Driver’s name" hint="As printed on the licence you will show at pickup.">
                {(p) => <input {...p} type="text" value={driverName} onChange={(e) => setDriverName(e.target.value)} autoComplete="name" />}
              </Field>
              <label className="dr-check dr-check-row">
                <input type="checkbox" checked={agreed} onChange={() => setAgreed((a) => !a)} />
                <span>
                  I agree to the host’s guidelines ({car.guidelines.length}) and the trip terms, and I understand this is a
                  demonstration: nothing is charged.
                </span>
              </label>
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
              <Button variant="secondary" icon="chevron-left" href={DRIVE.car(car.slug)}>
                Car
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button iconAfter="arrow-right" onClick={next}>
                Continue
              </Button>
            ) : (
              <Button size="lg" iconAfter="check" onClick={confirm}>
                {car.instantBook ? 'Confirm booking' : 'Send request'}
              </Button>
            )}
          </div>
        </div>

        <aside className="dr-booking-side" aria-label="Your quote">
          <div className="dr-panel dr-panel-sticky">
            <div className="dr-booking-car">
              <div style={{ color: car.color.hex }}>
                <CarArt body={car.body} color={car.color.hex} />
              </div>
              <div>
                <strong>{carTitle(car)}</strong>
                <span>
                  {car.neighborhood}, {city?.name}
                </span>
              </div>
            </div>
            {days > 0 ? (
              <PriceBreakdown quote={q} compact={step < 3} />
            ) : (
              <p className="dr-bookpanel-hint">Choose dates to see the full price.</p>
            )}
            {days > 0 ? (
              <p className="dr-booking-total-note">
                <strong>{moneyExact(q.totalCents)}</strong> total for {plural(days, 'day')}. Free cancellation until 24 hours before
                pickup.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  )
}
