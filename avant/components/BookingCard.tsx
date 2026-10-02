'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_COVERAGE, getPlan, VALUE_TIERS } from '@/lib/catalog'
import { getCity } from '@/lib/places'
import { addDays, billableDays, formatDate, isIsoDate, parseIso, rangesOverlap, todayIso } from '@/lib/dates'
import { checkEligibility, youngDriverFee } from '@/lib/eligibility'
import { money, moneyExact } from '@/lib/format'
import { allInDaily, quote } from '@/lib/pricing'
import { blockedRanges } from '@/lib/search'
import { actions, useLocal } from '@/lib/store'
import type { Car } from '@/lib/types'
import { useDriver } from './DriverProvider'
import { Icon } from './Icons'

const plan = getPlan(DEFAULT_COVERAGE)

export function BookingCard({ car }: { car: Car }) {
  const params = useSearchParams()
  const iso = (v: string | null) => (v && isIsoDate(v) ? v : '')
  const [start, setStart] = useState(iso(params.get('start')))
  const [end, setEnd] = useState(iso(params.get('end')))
  const [today, setToday] = useState<string | null>(null)
  const { allIn } = useLocal()
  const { facts, loaded } = useDriver()

  useEffect(() => {
    setToday(todayIso())
    actions.viewed(car.id)
  }, [car.id])

  const blocked = useMemo(() => (today ? blockedRanges(car, today) : []), [car, today])
  const days = start && end && end >= start ? billableDays(start, '10:00', end, '10:00') : 0
  const clash = start && end ? blocked.find((b) => rangesOverlap(start, end, b.start, b.end)) : undefined
  const lengthOk = days >= car.minDays && days <= car.maxDays
  const ready = days > 0 && !clash && lengthOk
  const elig = today ? checkEligibility(facts, car.valueTier, end || null, today) : null
  const tierMin = VALUE_TIERS[car.valueTier].minAge

  const q = ready
    ? quote({
        dailyRateCents: car.dailyRateCents,
        days,
        weeklyDiscountPct: car.weeklyDiscountPct,
        monthlyDiscountPct: car.monthlyDiscountPct,
        plan,
        delivery: false,
        deliveryFeeCents: 0,
        extras: [],
        taxRate: getCity(car.city)?.taxRate ?? 0,
        youngDriverFeeCents: youngDriverFee(facts.age, days, facts.cleanRecord),
      })
    : null

  const href = `/checkout/${car.slug}${ready ? `?start=${start}&end=${end}` : ''}`
  const daily = allIn ? allInDaily(car.dailyRateCents, plan.pctOfTrip, plan.minPerDayCents) : car.dailyRateCents

  return (
    <div className="bookcard sticky">
      <div className="rate">
        <strong>{money(daily)}</strong>
        <span>/day {allIn ? 'all-in' : 'rate'}</span>
        {car.weeklyDiscountPct ? <span className="badge badge-ok" style={{ marginLeft: 'auto' }}>−{car.weeklyDiscountPct}% weekly</span> : null}
      </div>
      <div className="dates">
        <label>
          <span>Pickup</span>
          <input
            type="date"
            min={today ?? undefined}
            value={start}
            onChange={(e) => {
              setStart(e.target.value)
              if (end && e.target.value > end) setEnd(addDays(e.target.value, Math.max(1, car.minDays)))
            }}
          />
        </label>
        <label>
          <span>Return</span>
          <input type="date" min={start || today || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>

      {clash ? (
        <p className="error" role="alert">
          Booked {formatDate(clash.start)} – {formatDate(clash.end)}. Try around it.
        </p>
      ) : days > 0 && !lengthOk ? (
        <p className="error" role="alert">
          This car books for {car.minDays}–{car.maxDays} days.
        </p>
      ) : null}

      {q ? (
        <div className="panel-flat" style={{ padding: 14 }}>
          <div className="between">
            <span className="muted">
              {days} days, Plus coverage{q.youngDriverCents ? ', young driver fee' : ''}
            </span>
            <strong className="tabular" style={{ fontSize: '1.2rem' }}>
              {moneyExact(q.totalCents)}
            </strong>
          </div>
          <p className="small dim" style={{ marginTop: 4 }}>
            Tax included. Change coverage at checkout.
          </p>
        </div>
      ) : (
        <p className="small muted">Pick dates to see the total, tax included.</p>
      )}

      {loaded && elig && facts.verified && !elig.ok ? (
        <p className="notice notice-warn small" role="note">
          <Icon name="help" size={16} />
          {elig.messages[0]}
        </p>
      ) : null}

      <a href={href} className="btn btn-primary btn-lg btn-block">
        {car.instantBook ? 'Book instantly' : 'Request to book'} <Icon name="arrow-right" size={17} />
      </a>

      <ul className="stack small muted" style={{ gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
        <li className="row">
          <Icon name="clock" size={15} /> Free cancellation until 24h before pickup
        </li>
        <li className="row">
          <Icon name="id" size={15} /> {VALUE_TIERS[car.valueTier].label} class · drivers {tierMin}+
        </li>
        <li className="row">
          <Icon name="map" size={15} /> {car.milesPerDay} miles/day included
        </li>
        {car.delivery.offered ? (
          <li className="row">
            <Icon name="truck" size={15} /> Delivers within {car.delivery.radiusMiles} mi for {money(car.delivery.feeCents)}
          </li>
        ) : null}
      </ul>
    </div>
  )
}

export function AvailabilityCalendar({ car }: { car: Car }) {
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => setToday(todayIso()), [])
  if (!today) return <div className="skeleton" style={{ minHeight: 220 }} aria-hidden="true" />
  const blocked = blockedRanges(car, today)
  const first = new Date(parseIso(today))
  const startDow = first.getUTCDay()
  const cells = Array.from({ length: 35 }, (_, i) => addDays(today, i - startDow))
  return (
    <div>
      <div className="calendar" role="grid" aria-label="Availability for the next five weeks">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="dow" role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const past = d < today
          const booked = blocked.some((b) => d >= b.start && d <= b.end)
          const state = past ? 'past' : booked ? 'booked' : 'free'
          return (
            <div key={d} className="day" data-state={state} role="gridcell" aria-label={`${formatDate(d)}: ${past ? 'past' : booked ? 'booked' : 'available'}`}>
              {Number(d.slice(8))}
            </div>
          )
        })}
      </div>
      <p className="small dim" style={{ marginTop: 10 }}>
        Struck-through days are booked. Everything else is open.
      </p>
    </div>
  )
}
