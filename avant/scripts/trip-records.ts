/**
 * Trip records for the insurer, an auditor or a state regulator, as CSV:
 * every trip in a date range with its times, place, fees, the host's
 * earnings, the odometer and fuel readings, and how many claims it had.
 * Car-sharing laws (Colorado C.R.S. 6-1-1206 and others) require keeping
 * these and producing them for claims investigations.
 *
 *   DATABASE_URL=… node --experimental-strip-types scripts/trip-records.ts 2026-01-01 2026-12-31 > trips.csv
 *
 * Reads only; contains no addresses, licence data or messages.
 */

import { db } from '../lib/server/db.ts'
import { hostEarnings } from '../lib/policy.ts'

const [from = '2000-01-01', to = '2100-01-01'] = process.argv.slice(2)
if (![from, to].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
  console.error('Usage: trip-records.ts YYYY-MM-DD YYYY-MM-DD')
  process.exit(1)
}

const d = await db()
const rows = await d.query<Record<string, unknown>>(
  `select b.id, b.status, b.start_date, b.end_date, b.request, b.quote, b.car, b.paid, b.host_id, b.guest_id, b.created_at,
          p.odometer as pickup_odometer, p.fuel_pct as pickup_fuel, p.recorded_at as pickup_at, p.confirmed_by is not null as pickup_confirmed,
          r.odometer as return_odometer, r.fuel_pct as return_fuel, r.recorded_at as return_at, r.confirmed_by is not null as return_confirmed,
          (select count(*) from claims c where c.booking_id = b.id and c.status <> 'withdrawn') as claims
   from bookings b
   left join trip_logs p on p.booking_id = b.id and p.kind = 'pickup'
   left join trip_logs r on r.booking_id = b.id and r.kind = 'return'
   where b.status = 'confirmed' and b.start_date between $1 and $2
   order by b.start_date, b.id`,
  [from, to],
)

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))

const header = [
  'trip_id', 'car', 'listing', 'pickup_place', 'start_date', 'start_time', 'end_date', 'end_time', 'time_zone', 'guest_id', 'host_id',
  'payment', 'trip_price_cents', 'total_cents', 'host_earnings_cents', 'coverage_plan',
  'pickup_odometer', 'pickup_fuel_pct', 'pickup_recorded_at', 'pickup_confirmed', 'return_odometer', 'return_fuel_pct', 'return_recorded_at', 'return_confirmed',
  'miles_driven', 'claims', 'booked_at',
]
console.log(header.join(','))
for (const r of rows) {
  const req = r.request as { startTime: string; endTime: string; delivery: boolean; coverage: string }
  const quote = r.quote as { tripCents: number; totalCents: number }
  const car = r.car as { title: string; slug: string; neighborhood: string; city: string; tz?: string }
  const miles = r.pickup_odometer !== null && r.return_odometer !== null ? Number(r.return_odometer) - Number(r.pickup_odometer) : ''
  console.log(
    [
      r.id, car.title, car.slug, req.delivery ? 'delivered to guest' : `${car.neighborhood}, ${car.city}`,
      day(r.start_date), req.startTime, day(r.end_date), req.endTime, car.tz ?? '', r.guest_id, r.host_id,
      r.paid, quote.tripCents, quote.totalCents, hostEarnings(r.quote as never, 'completed'), req.coverage,
      r.pickup_odometer, r.pickup_fuel, r.pickup_at, r.pickup_odometer === null ? '' : r.pickup_confirmed,
      r.return_odometer, r.return_fuel, r.return_at, r.return_odometer === null ? '' : r.return_confirmed,
      miles, r.claims, r.created_at,
    ]
      .map(cell)
      .join(','),
  )
}
process.exit(0)
