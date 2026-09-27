'use client'

/**
 * The sticky "book it" panel on a car page. Dates in, a live quote out, and
 * the button carries the dates into the booking flow so nothing is typed
 * twice. Also records the car as recently viewed.
 */

import { useEffect, useMemo, useState } from 'react'
import { getPlan } from '@/lib/drive/catalog'
import { DEFAULT_PICKUP_TIME, DEFAULT_RETURN_TIME } from '@/lib/drive/config'
import { getCity } from '@/lib/drive/data'
import { addDays, billableDays, formatDate, rangesOverlap, todayIso } from '@/lib/drive/dates'
import { money, moneyExact, plural } from '@/lib/drive/format'
import { quote } from '@/lib/drive/pricing'
import { DRIVE } from '@/lib/drive/routes'
import { blockedRanges } from '@/lib/drive/search'
import { useDriveActions } from '@/lib/drive/store'
import type { Car } from '@/lib/drive/types'
import { Icon } from './Icons'
import { Button } from './ui'

export function BookingPanel({ car, initialStart, initialEnd }: { car: Car; initialStart?: string; initialEnd?: string }) {
  const { noteViewed } = useDriveActions()
  const [today, setToday] = useState<string | null>(null)
  const [start, setStart] = useState(initialStart ?? '')
  const [end, setEnd] = useState(initialEnd ?? '')

  useEffect(() => {
    setToday(todayIso())
    noteViewed(car.id)
  }, [car.id, noteViewed])

  const blocked = useMemo(() => (today ? blockedRanges(car, today) : []), [car, today])
  const city = getCity(car.city)

  const days = start && end && end >= start ? billableDays(start, DEFAULT_PICKUP_TIME, end, DEFAULT_RETURN_TIME) : 0
  const conflict = start && end ? blocked.find((b) => rangesOverlap(start, end, b.start, b.end)) : undefined
  const tooShort = days > 0 && days < car.minDays
  const tooLong = days > car.maxDays
  const ready = days > 0 && !conflict && !tooShort && !tooLong

  const estimate = ready
    ? quote({
        dailyRateCents: car.dailyRateCents,
        days,
        weeklyDiscountPct: car.weeklyDiscountPct,
        monthlyDiscountPct: car.monthlyDiscountPct,
        plan: getPlan('standard'),
        delivery: false,
        deliveryFeeCents: 0,
        extras: [],
        taxRate: city?.taxRate ?? 0,
      })
    : null

  const bookHref = `${DRIVE.book(car.slug)}${ready ? `?start=${start}&end=${end}` : ''}`

  return (
    <div className="dr-bookpanel">
      <div className="dr-bookpanel-rate">
        <strong>{money(car.dailyRateCents)}</strong>
        <span>/day</span>
        {car.weeklyDiscountPct ? <em>{car.weeklyDiscountPct}% off a week</em> : null}
      </div>

      <div className="dr-bookpanel-dates">
        <label>
          <span>Pickup</span>
          <input
            type="date"
            min={today ?? undefined}
            value={start}
            onChange={(e) => {
              setStart(e.target.value)
              if (end && e.target.value && end < e.target.value) setEnd(addDays(e.target.value, car.minDays))
            }}
          />
        </label>
        <label>
          <span>Return</span>
          <input type="date" min={start || today || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>

      {conflict ? (
        <p className="dr-error" role="alert">
          Booked {formatDate(conflict.start)} to {formatDate(conflict.end)}. Try around it.
        </p>
      ) : tooShort ? (
        <p className="dr-error" role="alert">
          This car has a {plural(car.minDays, 'day')} minimum.
        </p>
      ) : tooLong ? (
        <p className="dr-error" role="alert">
          Trips on this car run up to {car.maxDays} days.
        </p>
      ) : null}

      {estimate ? (
        <div className="dr-bookpanel-estimate">
          <div>
            <span>{plural(days, 'day')} with Standard protection</span>
            <strong>{moneyExact(estimate.totalCents)}</strong>
          </div>
          <small>Itemised on the next screen. No hidden fees.</small>
        </div>
      ) : (
        <p className="dr-bookpanel-hint">Add dates to see the full price, fees included.</p>
      )}

      <Button href={bookHref} block size="lg" iconAfter="arrow-right">
        {car.instantBook ? 'Book instantly' : 'Request to book'}
      </Button>

      <ul className="dr-bookpanel-facts">
        <li>
          <Icon name="clock" size={15} /> Free cancellation up to 24 hours before pickup
        </li>
        <li>
          <Icon name="map" size={15} /> {car.milesPerDay} miles a day included
        </li>
        {car.delivery.offered ? (
          <li>
            <Icon name="truck" size={15} /> Delivery within {car.delivery.radiusMiles} mi for {money(car.delivery.feeCents)}
          </li>
        ) : null}
      </ul>

      {blocked.length ? (
        <details className="dr-bookpanel-blocked">
          <summary>Unavailable dates</summary>
          <ul>
            {blocked.map((b) => (
              <li key={b.start}>
                {formatDate(b.start)} – {formatDate(b.end)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
