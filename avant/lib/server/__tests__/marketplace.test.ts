import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

process.env.AVANT_DB = 'memory'
const { createUser } = await import('../accounts.ts')
const { savePhoto, PhotoError } = await import('../photos.ts')
const { createListing, liveCars, ListingRejected, listingsForHost, setListingStatus } = await import('../listings.ts')
const { createBooking, DatesTaken, tripsFor, respond, cancel, heldRanges } = await import('../bookings.ts')
const { threadsFor, messagesIn, sendMessage, unreadCounts, notificationsFor, setFavorite, favoritesFor } = await import('../inbox.ts')
const { PHOTO_ANGLES } = await import('../../listing.ts')

const CITIES = [{ slug: 'denver', name: 'Denver', state: 'CO', lat: 39.74, lng: -104.99, bounds: [39.6, -105.1, 39.9, -104.8], taxRate: 0.0881, landmarks: [] }] as never

/** A JPEG header the server can measure; the pixels never matter here. */
function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])
}

const draft = {
  vin: '1M8GDM9AXKP042788', year: 2022, make: 'Toyota', model: 'RAV4 Hybrid', body: 'suv', fuel: 'hybrid', transmission: 'automatic', seats: 5,
  miles: 30000, city: 'denver', neighborhood: 'RiNo', deliveryOffered: false, deliveryFeeCents: 0, dailyRateCents: 7000, weeklyDiscountPct: 10,
  instantBook: false, noOpenRecalls: true, insuredAndRegistered: true, color: 'Silver', efficiency: 40, monthlyDiscountPct: 20, milesPerDay: 200,
  description: 'My everyday hybrid, kept spotless. Great on mountain roads, easy to park downtown, and the back seats fold flat for bikes.',
  features: ['awd'], rules: ['No smoking.'],
} as const

const request = (start: string, end: string) => ({ slug: '', start, end, startTime: '10:00', endTime: '10:00', coverage: 'plus' as const, extras: [], delivery: false, deliveryAddress: '' })
const quote = { lines: [], totalCents: 21000 } as never

describe('marketplace', () => {
  let host: { id: string }, guest: { id: string }, other: { id: string }
  before(async () => {
    host = await createUser({ name: 'Maya Host', email: 'maya@example.com', password: 'a-long-password' })
    guest = await createUser({ name: 'Sam Guest', email: 'sam@example.com', password: 'a-long-password' })
    other = await createUser({ name: 'Lee Other', email: 'lee@example.com', password: 'a-long-password' })
  })

  it('accepts only real JPEGs of a usable size', async () => {
    await assert.rejects(savePhoto({ ownerId: host.id, kind: 'listing', angle: 'front', bytes: new TextEncoder().encode('<svg/>') }), PhotoError)
    await assert.rejects(savePhoto({ ownerId: host.id, kind: 'listing', angle: 'front', bytes: jpeg(600, 400) }), PhotoError)
    await assert.rejects(savePhoto({ ownerId: host.id, kind: 'listing', angle: 'roof', bytes: jpeg(1600, 1200) }), PhotoError)
  })

  it('publishes a listing only with the host’s own photos of every angle', async () => {
    const ids = []
    for (const a of PHOTO_ANGLES.slice(0, 5)) ids.push((await savePhoto({ ownerId: host.id, kind: 'listing', angle: a.id, bytes: jpeg(1600, 1200) })).id)
    await assert.rejects(createListing(host.id, draft as never, ids, 2026), ListingRejected)
    const stolen = (await savePhoto({ ownerId: other.id, kind: 'listing', angle: 'rear-seats', bytes: jpeg(1600, 1200) })).id
    await assert.rejects(createListing(host.id, draft as never, [...ids, stolen], 2026), ListingRejected, 'another user’s photo does not count')
    ids.push((await savePhoto({ ownerId: host.id, kind: 'listing', angle: 'rear-seats', bytes: jpeg(1600, 1200) })).id)
    const { slug } = await createListing(host.id, draft as never, ids, 2026)
    const cars = await liveCars(CITIES)
    assert.equal(cars.length, 1)
    assert.equal(cars[0].slug, slug)
    assert.equal(cars[0].photos.length, 6)
    assert.equal(cars[0].host.name, 'Maya H.', 'only a first name and initial in public')
    assert.equal((cars[0] as { vin?: string }).vin, undefined, 'the VIN never leaves the server')
    assert.equal((await listingsForHost(host.id))[0].status, 'live')
  })

  it('holds dates: no overlapping bookings, no booking your own car', async () => {
    const [car] = await liveCars(CITIES)
    const first = await createBooking({ guestId: guest.id, car, cityName: 'Denver', request: { ...request('2030-05-01', '2030-05-04'), slug: car.slug }, quote, paid: 'demo' })
    assert.equal(first.status, 'requested', 'not instant-book, so the host decides')
    await assert.rejects(createBooking({ guestId: other.id, car, cityName: 'Denver', request: { ...request('2030-05-03', '2030-05-06'), slug: car.slug }, quote, paid: 'demo' }), DatesTaken)
    await assert.rejects(createBooking({ guestId: host.id, car, cityName: 'Denver', request: { ...request('2030-06-01', '2030-06-02'), slug: car.slug }, quote, paid: 'demo' }), DatesTaken)
    const ok = await createBooking({ guestId: other.id, car, cityName: 'Denver', request: { ...request('2030-05-05', '2030-05-06'), slug: car.slug }, quote, paid: 'demo' })
    assert.ok(ok.id)
    assert.equal((await heldRanges([car.slug])).get(car.slug)?.length, 2)
  })

  it('lets guest and host message, approve, and cancel', async () => {
    const [trip] = (await tripsFor(guest.id)).filter((t) => t.start === '2030-05-01')
    assert.equal(trip.role, 'guest')
    assert.equal(trip.host?.firstName, 'Maya')
    assert.ok(trip.threadId)
    assert.equal(await messagesIn(other.id, trip.threadId!), null, 'outsiders cannot read the thread')
    await sendMessage(guest.id, trip.threadId!, 'Hi Maya, is a bike rack OK?')
    assert.equal((await unreadCounts(host.id)).messages, 1)
    const [summary] = await threadsFor(host.id)
    assert.equal(summary.other?.firstName, 'Sam')
    assert.equal(summary.unread, 1)
    const msgs = await messagesIn(host.id, trip.threadId!)
    assert.equal(msgs?.[0].body, 'Hi Maya, is a bike rack OK?')
    assert.equal((await unreadCounts(host.id)).messages, 0, 'reading clears unread')
    assert.ok((await notificationsFor(host.id)).some((n) => n.title === 'New trip request'))
    assert.equal(await respond(guest.id, trip.id, true), 'not-found', 'only the host can approve')
    assert.equal(await respond(host.id, trip.id, true), 'ok')
    assert.ok((await notificationsFor(guest.id)).some((n) => n.title === 'Request approved'))
    const view = (await tripsFor(guest.id)).find((t) => t.id === trip.id)!
    assert.equal(view.cancelPreview?.free, true, 'years ahead of pickup, cancelling is free')
    assert.equal((await cancel(other.id, trip.id)).result, 'not-found')
    const out = await cancel(guest.id, trip.id)
    assert.deepEqual(out, { result: 'ok', refundCents: trip.quote.totalCents })
    const after = (await tripsFor(guest.id)).find((t) => t.id === trip.id)!
    assert.equal(after.status, 'cancelled')
    assert.deepEqual(after.refund, { cents: trip.quote.totalCents, status: 'demo', creditCents: 0 }, 'preview mode records the refund without moving money')
    assert.equal(after.cancelledBy, 'guest')
  })

  it('keeps favorites per person and hides paused listings', async () => {
    const [car] = await liveCars(CITIES)
    await setFavorite(guest.id, car.slug, true)
    await setFavorite(guest.id, car.slug, true)
    assert.deepEqual(await favoritesFor(guest.id), [car.slug])
    assert.deepEqual(await favoritesFor(other.id), [])
    await setFavorite(guest.id, car.slug, false)
    assert.deepEqual(await favoritesFor(guest.id), [])
    const [mine] = await listingsForHost(host.id)
    await setListingStatus(host.id, mine.id, 'paused')
    assert.equal((await liveCars(CITIES)).length, 0)
  })
})
