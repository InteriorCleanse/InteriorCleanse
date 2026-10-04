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
import { db, type Db } from './db.ts'
import { ownListingPhotos } from './photos.ts'
import { HOLDS_CAR, notify } from './bookings.ts'
import { reviewsForListing } from './reviews.ts'

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
  host_rating: string | null
  car_rating: string | null
  car_trips: string
  booked: { start: string; end: string }[] | null
}

/** Booked and host-blocked days look the same to a guest: unavailable. */
const LIVE_SELECT = `
  select l.*, u.name as host_name, u.bio as host_bio, u.avatar_photo_id as host_avatar, u.created_at as host_created,
    (select count(*) from bookings b where b.host_id = u.id and b.status = 'confirmed' and b.end_date < current_date) as host_trips,
    (select avg(r.rating) from reviews r where r.subject_user_id = u.id and r.subject = 'car') as host_rating,
    (select avg(r.rating) from reviews r where r.listing_slug = l.slug and r.subject = 'car') as car_rating,
    (select count(*) from bookings b where b.listing_slug = l.slug and b.status = 'confirmed' and b.end_date < current_date) as car_trips,
    (select json_agg(x) from (
       select b.start_date::text as start, b.end_date::text as "end" from bookings b
        where b.listing_slug = l.slug and ${HOLDS_CAR} and b.end_date >= current_date
       union all
       select lb.start_date::text, lb.end_date::text from listing_blocks lb
        where lb.listing_id = l.id and lb.end_date >= current_date) x) as booked
  from listings l join users u on u.id = l.host_id`

export async function liveCars(cities: City[]): Promise<Car[]> {
  const rows = await (await db()).query<CarRow>(`${LIVE_SELECT} where l.status = 'live' order by l.created_at desc`)
  return rows.map((r) => toCar(r, cities))
}

export async function carBySlug(slug: string, cities: City[], includePaused = false): Promise<Car | null> {
  const [row] = await (await db()).query<CarRow>(`${LIVE_SELECT} where l.slug = $1 ${includePaused ? '' : `and l.status = 'live'`}`, [slug])
  return row ? { ...toCar(row, cities), reviews: await reviewsForListing(slug) } : null
}

function toCar(r: CarRow, cities: City[]): Car {
  const d = r.data
  const city = cities.find((c) => c.slug === r.city)
  const color = COLORS.find((c) => c.name === d.color) ?? COLORS[2]
  const trips = Number(r.host_trips)
  const hostRating = r.host_rating == null ? 0 : Math.round(Number(r.host_rating) * 100) / 100
  const host: Host = {
    id: r.host_id,
    name: r.host_name,
    joined: new Date(r.host_created).toISOString().slice(0, 10),
    // The same bar guests know: a near-perfect rating over a real number of trips.
    allStar: hostRating >= 4.9 && trips >= 10,
    rating: hostRating,
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
    rating: r.car_rating == null ? 0 : Math.round(Number(r.car_rating) * 100) / 100,
    tripCount: Number(r.car_trips),
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

// ── Host editing ────────────────────────────────────────────────────────

/** What a host can change on a live listing; the car itself (VIN, model, city) is fixed. */
export const EDITABLE = [
  'dailyRateCents',
  'weeklyDiscountPct',
  'monthlyDiscountPct',
  'milesPerDay',
  'instantBook',
  'deliveryOffered',
  'deliveryFeeCents',
  'description',
  'features',
  'rules',
  'neighborhood',
  'efficiency',
  'color',
  'welcome',
  'pickup',
] as const satisfies readonly (keyof ListingDraft)[]

export type ListingEdit = Partial<Pick<ListingDraft, (typeof EDITABLE)[number]>>

export interface EditableListing {
  id: string
  slug: string
  status: 'live' | 'paused'
  title: string
  city: string
  data: Omit<StoredListing, 'vin'>
  photos: { angle: string; url: string }[]
  blocks: { id: string; start: string; end: string }[]
  trips: { id: string; start: string; end: string; status: string }[]
}

const iso = (d: string | Date) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

export async function listingForHost(hostId: string, id: string): Promise<EditableListing | null> {
  const d = await db()
  const [r] = await d.query<ListingRow>(`select * from listings where id = $1 and host_id = $2`, [id, hostId])
  if (!r) return null
  const blocks = await d.query<{ id: string; start_date: string | Date; end_date: string | Date }>(
    `select id, start_date, end_date from listing_blocks where listing_id = $1 and end_date >= current_date order by start_date`,
    [id],
  )
  const trips = await d.query<{ id: string; start_date: string | Date; end_date: string | Date; status: string }>(
    `select id, start_date, end_date, status from bookings where listing_slug = $1 and status in ('requested', 'confirmed') and end_date >= current_date order by start_date`,
    [r.slug],
  )
  const { vin: _v, ...data } = r.data
  return {
    id: r.id,
    slug: r.slug,
    status: r.status,
    title: `${r.data.year} ${r.data.make} ${r.data.model}`,
    city: r.city,
    data,
    photos: PHOTO_ANGLES.map((a, i) => ({ angle: a.id, url: photoUrl(r.data.photoIds[i]) as string })),
    blocks: blocks.map((b) => ({ id: b.id, start: iso(b.start_date), end: iso(b.end_date) })),
    trips: trips.map((t) => ({ id: t.id, start: iso(t.start_date), end: iso(t.end_date), status: t.status })),
  }
}

/** Applies a host's edits (and optionally one replacement photo), re-checked by the listing rules. */
export async function updateListing(hostId: string, id: string, changes: ListingEdit, photo?: { angle: string; photoId: string }): Promise<boolean> {
  const d = await db()
  const [r] = await d.query<ListingRow>(`select * from listings where id = $1 and host_id = $2`, [id, hostId])
  if (!r) return false
  const editable = Object.fromEntries(Object.entries(changes).filter(([k]) => (EDITABLE as readonly string[]).includes(k)))
  const next: StoredListing = { ...r.data, ...editable, photoIds: [...r.data.photoIds] }
  if (photo) {
    const index = PHOTO_ANGLES.findIndex((a) => a.id === photo.angle)
    const [fresh] = await d.query<{ id: string }>(
      `select id from photos where id = $1 and owner_id = $2 and kind = 'listing' and angle = $3 and (listing_id is null or listing_id = $4)`,
      [photo.photoId, hostId, photo.angle, id],
    )
    if (index < 0 || !fresh) throw new ListingRejected([{ step: 'photos', field: 'photos', message: 'That photo can’t be used here. Upload it again.' }])
    next.photoIds[index] = fresh.id
  }
  const photos = await ownListingPhotos(hostId, next.photoIds)
  const full: ListingDraft = {
    ...next,
    photos: photos.map((p) => ({ id: p.id, angle: p.angle!, sha256: p.sha256, width: p.width, height: p.height, bytes: 0, addedAt: '' })),
  }
  // Only rules about what can change here; the car's age and mileage were checked at listing.
  const fields = new Set<string>([...EDITABLE, 'photos'])
  const problems = validateListing(full, new Date().getFullYear()).filter((p) => fields.has(p.field))
  if (problems.length) throw new ListingRejected(problems)
  await d.tx(async (t) => {
    await t.query(`update listings set data = $3, daily_rate_cents = $4, updated_at = now() where id = $1 and host_id = $2`, [
      id,
      hostId,
      JSON.stringify(next),
      next.dailyRateCents,
    ])
    if (photo) await t.query(`update photos set listing_id = $1 where id = $2 and owner_id = $3`, [id, photo.photoId, hostId])
    if (next.dailyRateCents < r.data.dailyRateCents) await announcePriceDrop(t, r.slug, hostId, `${r.data.year} ${r.data.make} ${r.data.model}`, r.data.dailyRateCents, next.dailyRateCents)
  })
  return true
}

/**
 * Tells everyone who saved this car that it got cheaper. At most one alert
 * per person per car every three days, so a host adjusting prices can't
 * flood anyone's inbox.
 */
async function announcePriceDrop(t: Db, slug: string, hostId: string, title: string, was: number, now: number) {
  const fans = await t.query<{ user_id: string }>(
    `select f.user_id from favorites f where f.listing_slug = $1 and f.user_id <> $2
       and not exists (select 1 from notifications n where n.user_id = f.user_id and n.href = $3 and n.title = 'Price drop' and n.created_at > now() - interval '3 days')`,
    [slug, hostId, `/cars/${slug}`],
  )
  for (const f of fans) {
    await notify(t, f.user_id, 'Price drop', `The ${title} you saved is now $${Math.round(now / 100)} a day, down from $${Math.round(was / 100)}.`, `/cars/${slug}`)
  }
}

export type BlockResult = 'ok' | 'not-found' | 'invalid' | 'has-trip'

/** Takes days off the calendar. Days already booked can't be blocked. */
export async function addBlock(hostId: string, listingId: string, start: string, end: string): Promise<BlockResult> {
  const valid = /^\d{4}-\d{2}-\d{2}$/
  const today = new Date().toISOString().slice(0, 10)
  if (!valid.test(start) || !valid.test(end) || end < start || start < today) return 'invalid'
  if (Date.parse(end) - Date.parse(start) > 366 * 86_400_000) return 'invalid'
  return (await db()).tx(async (t) => {
    const [l] = await t.query<{ slug: string }>(`select slug from listings where id = $1 and host_id = $2`, [listingId, hostId])
    if (!l) return 'not-found'
    await t.query(`select pg_advisory_xact_lock(hashtext($1))`, [l.slug])
    const [busy] = await t.query(`select 1 from bookings where listing_slug = $1 and ${HOLDS_CAR} and start_date <= $3::date and end_date >= $2::date`, [l.slug, start, end])
    if (busy) return 'has-trip'
    await t.query(`insert into listing_blocks (id, listing_id, start_date, end_date) values ($1, $2, $3, $4)`, [randomId(12), listingId, start, end])
    return 'ok'
  })
}

export async function removeBlock(hostId: string, listingId: string, blockId: string): Promise<boolean> {
  const rows = await (await db()).query(
    `delete from listing_blocks lb using listings l where lb.id = $1 and lb.listing_id = l.id and l.id = $2 and l.host_id = $3 returning lb.id`,
    [blockId, listingId, hostId],
  )
  return rows.length > 0
}
