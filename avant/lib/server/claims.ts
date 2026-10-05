/**
 * Trip records and claims on the server. The rules are in lib/trip-record.ts.
 *
 * Only the guest and host of a confirmed trip can see or touch its record
 * and claims; everyone else gets "not found". The app never charges anyone
 * for a claim: it collects both sides' evidence, sends every report to the
 * claims desk (AVANT_CLAIMS_EMAIL, the carrier's adjuster or a TPA), and
 * caps what a guest can be asked for at their protection plan's maximum.
 */

import { getPlan } from '../catalog.ts'
import { randomId } from '../security/crypto.ts'
import {
  canRecord,
  canReport,
  CLAIM_KINDS,
  claimLabel,
  GUEST_RESPONSE_HOURS,
  MAX_CLAIM_PHOTOS,
  MAX_CLAIMS_PER_TRIP,
  mileage,
  validReading,
  type ClaimKind,
  type ClaimStatus,
  type LogKind,
} from '../trip-record.ts'
import type { Quote } from '../types.ts'
import type { TripRequest } from '../checkout.ts'
import { day, notify, todayUtc, type CarSnapshot } from './bookings.ts'
import { db, type Db } from './db.ts'
import { sendEmail } from './email.ts'
import { insuranceDetails } from './insurance.ts'
import { photoUrl } from './accounts.ts'
import { ownClaimPhotos } from './photos.ts'
import { openText, sealText } from './sealed.ts'
import { siteUrl } from './stripe.ts'

interface TripRow {
  id: string
  guest_id: string
  host_id: string | null
  start_date: string | Date
  end_date: string | Date
  status: string
  quote: Quote
  request: TripRequest
  car: CarSnapshot
}

export interface Reading {
  odometer: number
  fuelPct: number
  recordedAt: string
  recordedByYou: boolean
  confirmed: boolean
}

export interface ClaimView {
  id: string
  kind: ClaimKind
  label: string
  role: 'host' | 'guest'
  yours: boolean
  description: string
  amountCents: number | null
  photos: string[]
  policeReport: string | null
  otherParty: string | null
  status: ClaimStatus
  respondBy: string | null
  response: string | null
  responseAccepts: boolean | null
  createdAt: string
}

export interface TripRecordView {
  role: 'guest' | 'host'
  pickup: Reading | null
  return: Reading | null
  mileage: { driven: number; allowance: number | null; over: number } | null
  can: { recordPickup: boolean; recordReturn: boolean; confirmPickup: boolean; confirmReturn: boolean; report: boolean }
  reportKinds: { id: ClaimKind; label: string }[]
  claims: ClaimView[]
  /** The most the guest can be asked to pay for damage, from their protection plan. */
  capCents: number
  planName: string
}

type Party = { trip: TripRow; role: 'guest' | 'host' }

async function party(q: Db, userId: string, bookingId: string): Promise<Party | null> {
  const [trip] = await q.query<TripRow>(
    `select id, guest_id, host_id, start_date, end_date, status, quote, request, car from bookings
     where id = $1 and status = 'confirmed' and host_id is not null and (guest_id = $2 or host_id = $2)`,
    [bookingId, userId],
  )
  if (!trip) return null
  return { trip, role: trip.guest_id === userId ? 'guest' : 'host' }
}

const iso = (d: string | Date | null) => (d ? new Date(d).toISOString() : null)
const days = (t: TripRow) => Math.max(1, Math.round((Date.parse(day(t.end_date)) - Date.parse(day(t.start_date))) / 86_400_000))

export async function tripRecord(userId: string, bookingId: string): Promise<TripRecordView | null> {
  const d = await db()
  const p = await party(d, userId, bookingId)
  if (!p) return null
  const { trip, role } = p
  const logs = await d.query<{ kind: LogKind; odometer: number; fuel_pct: number; recorded_by: string; recorded_at: string | Date; confirmed_by: string | null }>(
    `select kind, odometer, fuel_pct, recorded_by, recorded_at, confirmed_by from trip_logs where booking_id = $1`,
    [bookingId],
  )
  const reading = (kind: LogKind): Reading | null => {
    const l = logs.find((x) => x.kind === kind)
    return l ? { odometer: l.odometer, fuelPct: l.fuel_pct, recordedAt: iso(l.recorded_at)!, recordedByYou: l.recorded_by === userId, confirmed: Boolean(l.confirmed_by) } : null
  }
  const pickup = reading('pickup')
  const ret = reading('return')
  const today = todayUtc()
  const start = day(trip.start_date)
  const end = day(trip.end_date)
  const rows = await d.query<ClaimRow>(`select * from claims where booking_id = $1 order by created_at`, [bookingId])
  const plan = getPlan(trip.request.coverage)
  return {
    role,
    pickup,
    return: ret,
    mileage: mileage(pickup?.odometer ?? null, ret?.odometer ?? null, days(trip), trip.car.milesPerDay, trip.request.extras.includes('unlimited-miles')),
    can: {
      recordPickup: !pickup && canRecord('pickup', start, end, today, false),
      recordReturn: !ret && canRecord('return', start, end, today, Boolean(pickup)),
      confirmPickup: Boolean(pickup && !pickup.confirmed && !pickup.recordedByYou),
      confirmReturn: Boolean(ret && !ret.confirmed && !ret.recordedByYou),
      report: canReport(role, start, end, today) && rows.filter((r) => r.opened_by === userId).length < MAX_CLAIMS_PER_TRIP,
    },
    reportKinds: CLAIM_KINDS.filter((k) => k.by === role).map(({ id, label }) => ({ id, label })),
    claims: await Promise.all(rows.map((r) => claimView(r, userId))),
    capCents: plan.maxOutOfPocketCents,
    planName: plan.name,
  }
}

interface ClaimRow {
  id: string
  booking_id: string
  opened_by: string
  role: 'host' | 'guest'
  kind: ClaimKind
  description: string
  amount_cents: number | null
  photo_ids: string[]
  police_report: string | null
  other_party: string | null
  status: ClaimStatus
  respond_by: string | Date | null
  response: string | null
  response_accepts: boolean | null
  created_at: string | Date
}

async function claimView(r: ClaimRow, userId: string): Promise<ClaimView> {
  return {
    id: r.id,
    kind: r.kind,
    label: claimLabel(r.kind),
    role: r.role,
    yours: r.opened_by === userId,
    description: await openText(r.description, `claim:${r.id}:description`),
    amountCents: r.amount_cents,
    photos: r.photo_ids.map((id) => photoUrl(id)!),
    policeReport: r.police_report,
    otherParty: r.other_party ? await openText(r.other_party, `claim:${r.id}:other`) : null,
    status: r.status,
    respondBy: iso(r.respond_by),
    response: r.response ? await openText(r.response, `claim:${r.id}:response`) : null,
    responseAccepts: r.response_accepts,
    createdAt: iso(r.created_at)!,
  }
}

export type RecordResult = 'ok' | 'not-found' | 'not-allowed' | { error: string }

export async function recordReading(userId: string, bookingId: string, kind: LogKind, odometer: number, fuelPct: number): Promise<RecordResult> {
  return (await db()).tx(async (t) => {
    const p = await party(t, userId, bookingId)
    if (!p) return 'not-found'
    await t.query(`select pg_advisory_xact_lock(hashtext($1))`, [`triplog:${bookingId}`])
    const [pickup] = await t.query<{ odometer: number }>(`select odometer from trip_logs where booking_id = $1 and kind = 'pickup'`, [bookingId])
    const [existing] = await t.query(`select 1 from trip_logs where booking_id = $1 and kind = $2`, [bookingId, kind])
    if (existing || !canRecord(kind, day(p.trip.start_date), day(p.trip.end_date), todayUtc(), Boolean(pickup))) return 'not-allowed'
    const problem = validReading(kind, odometer, fuelPct, pickup?.odometer ?? null)
    if (problem) return { error: problem }
    await t.query(`insert into trip_logs (booking_id, kind, odometer, fuel_pct, recorded_by) values ($1, $2, $3, $4, $5)`, [bookingId, kind, odometer, fuelPct, userId])
    const other = p.role === 'guest' ? p.trip.host_id! : p.trip.guest_id
    await notify(
      t,
      other,
      kind === 'pickup' ? 'Pickup recorded' : 'Return recorded',
      `The ${p.trip.car.title} ${kind === 'pickup' ? 'pickup' : 'return'} reading is in: ${odometer.toLocaleString('en-US')} mi, ${fuelPct}% fuel or charge. Check it and confirm.`,
      `/trips/${bookingId}#record`,
    )
    return 'ok'
  })
}

/** The other person agrees with a reading. */
export async function confirmReading(userId: string, bookingId: string, kind: LogKind): Promise<RecordResult> {
  return (await db()).tx(async (t) => {
    const p = await party(t, userId, bookingId)
    if (!p) return 'not-found'
    const done = await t.query(
      `update trip_logs set confirmed_by = $3, confirmed_at = now() where booking_id = $1 and kind = $2 and recorded_by <> $3 and confirmed_by is null returning kind`,
      [bookingId, kind, userId],
    )
    return done.length ? 'ok' : 'not-allowed'
  })
}

export interface ClaimInput {
  kind: ClaimKind
  description: string
  amountCents?: number
  photoIds?: string[]
  policeReport?: string
  otherParty?: string
}

export async function openClaim(userId: string, bookingId: string, input: ClaimInput): Promise<{ id: string } | RecordResult> {
  const result = await (await db()).tx(async (t) => {
    const p = await party(t, userId, bookingId)
    if (!p) return 'not-found' as const
    const kind = CLAIM_KINDS.find((k) => k.id === input.kind)
    if (!kind || kind.by !== p.role) return { error: 'Choose what happened.' }
    if (!canReport(p.role, day(p.trip.start_date), day(p.trip.end_date), todayUtc())) return 'not-allowed' as const
    await t.query(`select pg_advisory_xact_lock(hashtext($1))`, [`claims:${bookingId}`])
    const [{ n }] = await t.query<{ n: string }>(`select count(*) as n from claims where booking_id = $1 and opened_by = $2`, [bookingId, userId])
    if (Number(n) >= MAX_CLAIMS_PER_TRIP) return { error: 'That’s the most reports one trip can have. Contact support.' }
    const photos = await ownClaimPhotos(userId, (input.photoIds ?? []).slice(0, MAX_CLAIM_PHOTOS), t)
    if (p.role === 'host' && input.kind === 'damage' && !photos.length) return { error: 'Add at least one photo of the damage.' }
    const id = randomId(12)
    const respondBy = p.role === 'host' ? new Date(Date.now() + GUEST_RESPONSE_HOURS * 3_600_000).toISOString() : null
    await t.query(
      `insert into claims (id, booking_id, opened_by, role, kind, description, amount_cents, photo_ids, police_report, other_party, respond_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        bookingId,
        userId,
        p.role,
        input.kind,
        await sealText(input.description, `claim:${id}:description`),
        p.role === 'host' ? (input.amountCents ?? null) : null,
        photos,
        input.policeReport || null,
        input.otherParty ? await sealText(input.otherParty, `claim:${id}:other`) : null,
        respondBy,
      ],
    )
    const other = p.role === 'guest' ? p.trip.host_id! : p.trip.guest_id
    await notify(
      t,
      other,
      p.role === 'host' ? 'Your host reported an issue' : 'Your guest reported an incident',
      p.role === 'host'
        ? `A report about the ${p.trip.car.title} trip needs your side: ${kind.label.toLowerCase()}. You have ${GUEST_RESPONSE_HOURS} hours to respond. Nothing is charged before our claims team reviews it.`
        : `${kind.label} on the ${p.trip.car.title} trip. Open the trip to see the report and add anything you know.`,
      `/trips/${bookingId}#claims`,
    )
    return { id, trip: p.trip, role: p.role }
  })
  if (typeof result === 'string' || 'error' in result) return result
  await toClaimsDesk(result.id, 'opened').catch(() => console.error('claims desk email failed'))
  return { id: result.id }
}

/** The other person answers a report once: accepting it, or giving their side. */
export async function respondToClaim(userId: string, claimId: string, accepts: boolean, response: string): Promise<RecordResult> {
  const out = await (await db()).tx(async (t) => {
    const [c] = await t.query<ClaimRow>(`select * from claims where id = $1 for update`, [claimId])
    if (!c) return 'not-found' as const
    const p = await party(t, userId, c.booking_id)
    if (!p || c.opened_by === userId) return 'not-found' as const
    if (c.status !== 'open' && c.status !== 'review') return 'not-allowed' as const
    if (c.response_accepts !== null) return 'not-allowed' as const
    await t.query(
      `update claims set status = 'responded', response = $2, response_accepts = $3, responded_at = now(), updated_at = now() where id = $1`,
      [claimId, response ? await sealText(response, `claim:${claimId}:response`) : null, accepts],
    )
    await notify(t, c.opened_by, 'Your report has a response', `The other side responded to your report on the ${p.trip.car.title} trip. Our claims team now reviews both.`, `/trips/${c.booking_id}#claims`)
    return 'ok' as const
  })
  if (out === 'ok') await toClaimsDesk(claimId, 'responded').catch(() => console.error('claims desk email failed'))
  return out
}

export async function withdrawClaim(userId: string, claimId: string): Promise<RecordResult> {
  const done = await (await db()).query(
    `update claims set status = 'withdrawn', updated_at = now() where id = $1 and opened_by = $2 and status in ('open', 'responded', 'review') returning id`,
    [claimId, userId],
  )
  if (!done.length) return 'not-found'
  await toClaimsDesk(claimId, 'withdrawn').catch(() => console.error('claims desk email failed'))
  return 'ok'
}

/** Reports whose response window passed go to the claims desk for review (cron). */
export async function escalateOverdueClaims(): Promise<number> {
  const rows = await (await db()).query<{ id: string }>(
    `update claims set status = 'review', updated_at = now() where status = 'open' and respond_by is not null and respond_by < now() returning id`,
  )
  for (const r of rows) await toClaimsDesk(r.id, 'no response in time').catch(() => console.error('claims desk email failed'))
  return rows.length
}

/**
 * Every report goes to the claims desk with what an adjuster needs: the
 * trip, both parties, the plan cap, the readings, the words and photos.
 */
async function toClaimsDesk(claimId: string, event: string): Promise<void> {
  const to = insuranceDetails().claimsEmail
  if (!to) return
  const d = await db()
  const [c] = await d.query<ClaimRow & { start_date: string | Date; end_date: string | Date; car: CarSnapshot; request: TripRequest; guest_id: string; host_id: string; guest_email: string; host_email: string; guest_name: string; host_name: string }>(
    `select c.*, b.start_date, b.end_date, b.car, b.request, b.guest_id, b.host_id,
            g.email as guest_email, g.name as guest_name, h.email as host_email, h.name as host_name
     from claims c join bookings b on b.id = c.booking_id join users g on g.id = b.guest_id join users h on h.id = b.host_id
     where c.id = $1`,
    [claimId],
  )
  if (!c) return
  const logs = await d.query<{ kind: string; odometer: number; fuel_pct: number; recorded_at: string | Date; confirmed_by: string | null }>(
    `select kind, odometer, fuel_pct, recorded_at, confirmed_by from trip_logs where booking_id = $1 order by kind desc`,
    [c.booking_id],
  )
  const site = siteUrl()
  const plan = getPlan(c.request.coverage)
  const lines = [
    `Claim ${c.id} — ${event}`,
    `Kind: ${claimLabel(c.kind)} (reported by the ${c.role})`,
    `Status: ${c.status}${c.respond_by ? ` · guest response due ${new Date(c.respond_by).toISOString()}` : ''}`,
    '',
    `Trip ${c.booking_id}: ${c.car.title}, ${day(c.start_date)} ${c.request.startTime} to ${day(c.end_date)} ${c.request.endTime}`,
    `Pickup: ${c.request.delivery ? 'delivered' : `${c.car.neighborhood}, ${c.car.city}`}`,
    `Guest: ${c.guest_name} <${c.guest_email}> (${c.guest_id})`,
    `Host: ${c.host_name} <${c.host_email}> (${c.host_id})`,
    `Protection plan: ${plan.name}, guest maximum ${plan.maxOutOfPocketCents === 0 ? '$0' : `$${plan.maxOutOfPocketCents / 100}`}`,
    ...logs.map((l) => `${l.kind}: ${l.odometer} mi, ${l.fuel_pct}% at ${new Date(l.recorded_at).toISOString()}${l.confirmed_by ? ' (confirmed by both)' : ' (not confirmed)'}`),
    '',
    `Amount claimed: ${c.amount_cents === null ? '—' : `$${(c.amount_cents / 100).toFixed(2)}`}`,
    c.police_report ? `Police report: ${c.police_report}` : '',
    `Description:\n${await openText(c.description, `claim:${c.id}:description`)}`,
    c.other_party ? `Other party:\n${await openText(c.other_party, `claim:${c.id}:other`)}` : '',
    c.response_accepts === null ? '' : `Response (${c.response_accepts ? 'accepts' : 'disputes'}):\n${c.response ? await openText(c.response, `claim:${c.id}:response`) : '(no words)'}`,
    c.photo_ids.length ? `Photos:\n${c.photo_ids.map((id) => `${site}${photoUrl(id)}`).join('\n')}` : '',
  ].filter((l) => l !== '')
  await sendEmail({ to, subject: `[AVANT claim] ${claimLabel(c.kind)} · ${c.car.title} · ${event}`, text: lines.join('\n'), idempotencyKey: `claim-${c.id}-${event}` })
}
