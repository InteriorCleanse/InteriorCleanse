/**
 * The rules of the trip record and of claims, in one pure module so the
 * server, the trip screen and the tests agree.
 *
 * The trip record is what insurers and state car-sharing laws ask a
 * platform to keep for every trip: when and where the car was handed over
 * and returned, and the miles driven. Odometer and fuel (or charge) are
 * entered by either person at pickup and at return; the other person
 * confirms them.
 *
 * Claims follow the process the terms promise: a host reports damage or
 * another charge within CLAIM_WINDOW_DAYS of the trip ending, with photos;
 * the guest has GUEST_RESPONSE_HOURS to respond; nothing is charged by the
 * app, and AVANT's claims desk decides with both sides' evidence, never
 * above the guest's protection-plan cap. A guest reports an accident or a
 * breakdown during the trip the same way.
 */

export type LogKind = 'pickup' | 'return'

export const CLAIM_WINDOW_DAYS = 3
export const GUEST_RESPONSE_HOURS = 72
export const MAX_CLAIM_PHOTOS = 8
export const MAX_CLAIMS_PER_TRIP = 5
export const MAX_ODOMETER = 2_000_000
/** A return reading more than this past pickup is almost certainly a typo. */
export const MAX_TRIP_MILES = 15_000

export type ClaimKind = 'damage' | 'cleaning' | 'fuel' | 'mileage' | 'late_return' | 'tolls' | 'other' | 'accident' | 'breakdown'
export type ClaimStatus = 'open' | 'responded' | 'review' | 'withdrawn' | 'resolved'

export const CLAIM_KINDS: { id: ClaimKind; label: string; by: 'host' | 'guest' }[] = [
  { id: 'damage', label: 'Damage to the car', by: 'host' },
  { id: 'cleaning', label: 'Cleaning or smoking', by: 'host' },
  { id: 'fuel', label: 'Fuel or charge not replaced', by: 'host' },
  { id: 'mileage', label: 'Miles over the allowance', by: 'host' },
  { id: 'late_return', label: 'Late return', by: 'host' },
  { id: 'tolls', label: 'Tolls or tickets', by: 'host' },
  { id: 'other', label: 'Something else', by: 'host' },
  { id: 'accident', label: 'An accident', by: 'guest' },
  { id: 'breakdown', label: 'A breakdown or a problem with the car', by: 'guest' },
]

export const claimLabel = (k: ClaimKind) => CLAIM_KINDS.find((c) => c.id === k)?.label ?? k

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** Pickup can be recorded from the day before the trip to the day after it ends; return once it has started. */
export function canRecord(kind: LogKind, start: string, end: string, today: string, pickupRecorded: boolean): boolean {
  if (today < addDays(start, kind === 'pickup' ? -1 : 0) || today > addDays(end, 1)) return false
  return kind === 'pickup' || pickupRecorded
}

/** Hosts report from the first day of the trip until CLAIM_WINDOW_DAYS after it ends; guests report incidents during the trip and the day after. */
export function canReport(by: 'host' | 'guest', start: string, end: string, today: string): boolean {
  return today >= start && today <= addDays(end, by === 'host' ? CLAIM_WINDOW_DAYS : 1)
}

/** Miles driven, and how many went past the allowance (null when unlimited or unknown). */
export function mileage(
  pickupOdo: number | null,
  returnOdo: number | null,
  days: number,
  milesPerDay: number | undefined,
  unlimited: boolean,
): { driven: number; allowance: number | null; over: number } | null {
  if (pickupOdo === null || returnOdo === null) return null
  const driven = Math.max(0, returnOdo - pickupOdo)
  const allowance = unlimited || !milesPerDay ? null : milesPerDay * Math.max(1, days)
  return { driven, allowance, over: allowance === null ? 0 : Math.max(0, driven - allowance) }
}

export function validReading(kind: LogKind, odometer: number, fuelPct: number, pickupOdo: number | null): string | null {
  if (!Number.isInteger(odometer) || odometer < 0 || odometer > MAX_ODOMETER) return 'Enter the odometer reading in whole miles.'
  if (!Number.isInteger(fuelPct) || fuelPct < 0 || fuelPct > 100) return 'Enter fuel or charge as a percentage.'
  if (kind === 'return' && pickupOdo !== null) {
    if (odometer < pickupOdo) return 'The return reading is lower than at pickup. Check it.'
    if (odometer - pickupOdo > MAX_TRIP_MILES) return 'That’s more miles than a trip could cover. Check the reading.'
  }
  return null
}
