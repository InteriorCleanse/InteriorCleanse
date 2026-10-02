/**
 * Real listings: created by signed-in hosts with their own photos, checked
 * with the same rules as the wizard (lib/listing.ts), and turned into the
 * Car shape every screen already understands.
 */

import { randomId } from '../security/crypto.ts'
import { tierForRate } from '../catalog.ts'
import { COLORS, normaliseVin, PHOTO_ANGLES, validateListing, type ListingDraft, type ListingProblem } from '../listing.ts'
import type { Car, City, Host } from '../types.ts'
import { photoUrl } from './accounts.ts'
import { db } from './db.ts'
import { ownListingPhotos } from './photos.ts'
import { HOLDS_CAR } from './bookings.ts'

export type StoredListing = Omit<ListingDraft, 'photos'> & { photoIds: string[] }

interface ListingRow {
  id: string
  slug: string
  host_id: string
  status: 'live' | 'paused'
  city: string
  daily_rate_cents: number
  data: StoredListing
  created_at: string | Date
}

export class ListingRejected extends Error {
  problems: ListingProblem[]
  constructor(problems: ListingProblem[]) {
    super(problems[0]?.message ?? 'Listing rejected')
    this.problems = problems
  }
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export async function createListing(hostId: string, draft: Omit<ListingDraft, 'photos'>, photoIds: string[], currentYear = new Date().getFullYear()) {
  const d = await db()
  const photos = await ownListingPhotos(hostId, photoIds)
  const full: ListingDraft = {
    ...draft,
    vin: normaliseVin(draft.vin),
    photos: photos.map((p) => ({ id: p.id, angle: p.angle!, sha256: p.sha256, width: p.width, height: p.height, bytes: 0, addedAt: '' })),
  }
  const problems = validateListing(full, currentYear)
  if (problems.length) throw new ListingRejected(problems)
  const [dupe] = await d.query(`select 1 from listings where data->>'vin' = $1 and host_id <> $2`, [full.vin, hostId])
  if (dupe) throw new ListingRejected([{ step: 'car', field: 'vin', message: 'That VIN is already listed by another host.' }])

  const ordered = PHOTO_ANGLES.map((a) => photos.find((p) => p.angle === a.id)!.id)
  const id = randomId(12)
  const slug = `${slugify(`${full.year} ${full.make} ${full.model} ${full.city}`)}-${id.slice(0, 6).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`
  const { photos: _p, ...rest } = full
  const data: StoredListing = { ...rest, photoIds: ordered }
  await d.tx(async (t) => {
    await t.query(`insert into listings (id, slug, host_id, status, city, daily_rate_cents, data) values ($1, $2, $3, 'live', $4, $5, $6)`, [
      id,
      slug,
      hostId,
      full.city,
      full.dailyRateCents,
      JSON.stringify(data),
    ])
    await t.query(`update photos set listing_id = $1 where owner_id = $2 and id = any($3::text[])`, [id, hostId, ordered])
  })
  return { id, slug }
}

export interface MyListing {
  id: string
  slug: string
  status: 'live' | 'paused'
  title: string
  city: string
  neighborhood: string
  dailyRateCents: number
  cover: string | null
  createdAt: string
  upcomingTrips: number
}

export async function listingsForHost(hostId: string): Promise<MyListing[]> {
  const rows = await (await db()).query<ListingRow & { upcoming: string }>(
    `select l.*, (select count(*) from bookings b where b.listing_slug = l.slug and b.status in ('requested','confirmed') and b.end_date >= current_date) as upcoming
     from listings l where host_id = $1 order by created_at desc`,
    [hostId],
  )
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    status: r.status,
    title: `${r.data.year} ${r.data.make} ${r.data.model}`,
    city: r.city,
    neighborhood: r.data.neighborhood,
    dailyRateCents: r.daily_rate_cents,
    cover: photoUrl(r.data.photoIds[0]),
    createdAt: new Date(r.created_at).toISOString(),
    upcomingTrips: Number(r.upcoming),
  }))
}

export async function setListingStatus(hostId: string, id: string, status: 'live' | 'paused'): Promise<boolean> {
  const rows = await (await db()).query(`update listings set status = $3, updated_at = now() where id = $1 and host_id = $2 returning id`, [id, hostId, status])
  return rows.length > 0
}

/** Deletes a listing with no upcoming trips; otherwise it must be paused. */
export async function deleteListing(hostId: string, id: string): Promise<'deleted' | 'has-trips' | 'not-found'> {
  const d = await db()
  return d.tx(async (t) => {
    const [row] = await t.query<{ slug: string }>(`select slug from listings where id = $1 and host_id = $2`, [id, hostId])
    if (!row) return 'not-found'
    const [busy] = await t.query(`select 1 from bookings where listing_slug = $1 and ${HOLDS_CAR} and end_date >= current_date`, [row.slug])
    if (busy) return 'has-trips'
    await t.query(`delete from photos where listing_id = $1`, [id])
    await t.query(`delete from listings where id = $1`, [id])
    return 'deleted'
  })
}

// ── Turning a listing into a Car ────────────────────────────────────────

function hashUnit(s: string, salt: number): number {
  let h = salt
  for (const c of s) h = (Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0) % 1_000_003
  return (h % 10_000) / 10_000 - 0.5
}

interface CarRow extends ListingRow {
  host_name: string
  host_bio: string
  host_avatar: string | null
  host_created: string | Date
  host_trips: string
  booked: { start: string; end: string }[] | null
}

const LIVE_SELECT = `
  select l.*, u.name as host_name, u.bio as host_bio, u.avatar_photo_id as host_avatar, u.created_at as host_created,
    (select count(*) from bookings b where b.host_id = u.id and b.status = 'confirmed' and b.end_date < current_date) as host_trips,
    (select json_agg(json_build_object('start', b.start_date::text, 'end', b.end_date::text))
       from bookings b where b.listing_slug = l.slug and ${HOLDS_CAR} and b.end_date >= current_date) as booked
  from listings l join users u on u.id = l.host_id`

export async function liveCars(cities: City[]): Promise<Car[]> {
  const rows = await (await db()).query<CarRow>(`${LIVE_SELECT} where l.status = 'live' order by l.created_at desc`)
  return rows.map((r) => toCar(r, cities))
}

export async function carBySlug(slug: string, cities: City[], includePaused = false): Promise<Car | null> {
  const [row] = await (await db()).query<CarRow>(`${LIVE_SELECT} where l.slug = $1 ${includePaused ? '' : `and l.status = 'live'`}`, [slug])
  return row ? toCar(row, cities) : null
}

function toCar(r: CarRow, cities: City[]): Car {
  const d = r.data
  const city = cities.find((c) => c.slug === r.city)
  const color = COLORS.find((c) => c.name === d.color) ?? COLORS[2]
  const trips = Number(r.host_trips)
  const host: Host = {
    id: r.host_id,
    name: r.host_name,
    joined: new Date(r.host_created).toISOString().slice(0, 10),
    allStar: false,
    rating: 0,
    trips,
    responseMinutes: null,
    bio: r.host_bio,
    photo: photoUrl(r.host_avatar),
  }
  return {
    id: r.id,
    slug: r.slug,
    make: d.make,
    model: d.model,
    year: d.year,
    trim: null,
    body: d.body,
    fuel: d.fuel,
    transmission: d.transmission,
    color: { name: color.name, hex: color.hex },
    seats: d.seats,
    doors: d.body === 'coupe' || d.body === 'convertible' ? 2 : 4,
    efficiency: d.fuel === 'electric' ? { rangeMiles: d.efficiency } : { mpg: d.efficiency },
    features: d.features,
    dailyRateCents: r.daily_rate_cents,
    weeklyDiscountPct: d.weeklyDiscountPct,
    monthlyDiscountPct: d.monthlyDiscountPct,
    instantBook: d.instantBook,
    delivery: { offered: d.deliveryOffered, feeCents: d.deliveryFeeCents, radiusMiles: 15 },
    milesPerDay: d.milesPerDay,
    minDays: 1,
    maxDays: 90,
    city: r.city,
    neighborhood: d.neighborhood,
    // An approximate pin inside the city until a trip is booked.
    lat: (city?.lat ?? 0) + hashUnit(r.id, 7) * 0.04,
    lng: (city?.lng ?? 0) + hashUnit(r.id, 13) * 0.05,
    approxLocation: true,
    hostId: r.host_id,
    host,
    rating: 0,
    tripCount: 0,
    listedAt: new Date(r.created_at).toISOString().slice(0, 10),
    description: d.description,
    guidelines: d.rules,
    blockedOffsets: [],
    booked: (r.booked ?? []).map((b) => ({ start: b.start, end: b.end })),
    reviews: [],
    valueTier: tierForRate(r.daily_rate_cents),
    photos: d.photoIds.map((id) => photoUrl(id) as string),
    sample: false,
  }
}
