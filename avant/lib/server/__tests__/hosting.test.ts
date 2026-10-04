import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

process.env.AVANT_DB = 'memory'
delete process.env.STRIPE_SECRET_KEY
delete process.env.RESEND_API_KEY
const { authenticate, createSession, createUser, deleteAccount, getUser, userForToken } = await import('../accounts.ts')
const { savePhoto } = await import('../photos.ts')
const { addBlock, carBySlug, createListing, ListingRejected, listingForHost, removeBlock, updateListing } = await import('../listings.ts')
const { createBooking, DatesTaken, expireRequests, markPaid, personStats, respond, tripFor } = await import('../bookings.ts')
const { leaveReview } = await import('../reviews.ts')
const { earningsFor, queuePayouts, sendPayouts } = await import('../payouts.ts')
const { createResetLink, resetPassword } = await import('../recovery.ts')
const { deliverNotificationEmails } = await import('../email.ts')
const { db } = await import('../db.ts')
const { PHOTO_ANGLES } = await import('../../listing.ts')
const { hostEarnings } = await import('../../policy.ts')

const CITIES = [{ slug: 'denver', name: 'Denver', state: 'CO', lat: 39.74, lng: -104.99, bounds: [39.6, -105.1, 39.9, -104.8], taxRate: 0.0881, tz: 'America/Denver', landmarks: [] }] as never

function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])
}

const draft = {
  vin: '1M8GDM9AXKP042788', year: 2022, make: 'Volvo', model: 'XC60', body: 'suv', fuel: 'hybrid', transmission: 'automatic', seats: 5,
  miles: 30000, city: 'denver', neighborhood: 'RiNo', deliveryOffered: true, deliveryFeeCents: 3000, dailyRateCents: 9000, weeklyDiscountPct: 10,
  instantBook: false, noOpenRecalls: true, insuredAndRegistered: true, color: 'Silver', efficiency: 57, monthlyDiscountPct: 20, milesPerDay: 200,
  description: 'A quiet plug-in hybrid I keep detailed every month. Great for the mountains, easy downtown, and the seats fold flat for skis.',
  features: ['awd'], rules: ['No smoking.'],
} as const

const request = (slug: string, start: string, end: string) => ({ slug, start, end, startTime: '10:00', endTime: '10:00', coverage: 'plus' as const, extras: [], delivery: true, deliveryAddress: '' })
const quote = { days: 3, tripCents: 27000, deliveryCents: 3000, extrasCents: 0, totalCents: 40000, lines: [] } as never
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

describe('hosting, payments and accounts', () => {
  let host: { id: string }, guest: { id: string }, other: { id: string; email: string }
  let listingId = ''
  let slug = ''
  const car = async () => (await carBySlug(slug, CITIES))!

  before(async () => {
    host = await createUser({ name: 'Morgan Hale', email: 'morgan@example.com', password: 'a-long-password' })
    guest = await createUser({ name: 'Riley Chen', email: 'riley@example.com', password: 'a-long-password' })
    other = await createUser({ name: 'Sam Other', email: 'sam@example.com', password: 'a-long-password' })
    const ids = []
    for (const a of PHOTO_ANGLES) ids.push((await savePhoto({ ownerId: host.id, kind: 'listing', angle: a.id, bytes: jpeg(1600, 1200) })).id)
    ;({ id: listingId, slug } = await createListing(host.id, draft as never, ids, 2026))
  })

  it('refunds a declined request in full', async () => {
    const b = await createBooking({ guestId: guest.id, car: await car(), cityName: 'Denver', request: request(slug, iso(40), iso(42)), quote, paid: 'demo' })
    assert.equal(await respond(host.id, b.id, false), 'ok')
    const t = (await tripFor(guest.id, b.id))!
    assert.equal(t.status, 'declined')
    assert.deepEqual(t.refund, { cents: 40000, status: 'demo', creditCents: 0 })
  })

  it('expires requests the host leaves unanswered', async () => {
    const b = await createBooking({ guestId: guest.id, car: await car(), cityName: 'Denver', request: request(slug, iso(50), iso(52)), quote, paid: 'demo' })
    await (await db()).query(`update bookings set created_at = now() - interval '9 hours' where id = $1`, [b.id])
    assert.deepEqual(await expireRequests(), [b.id])
    const t = (await tripFor(guest.id, b.id))!
    assert.equal(t.status, 'expired')
    assert.equal(t.refund.cents, 40000)
    assert.equal(await respond(host.id, b.id, true), 'not-allowed', 'too late to approve')
  })

  it('lets the host block days, and never over a booked trip', async () => {
    assert.equal(await addBlock(host.id, listingId, iso(60), iso(64)), 'ok')
    assert.equal(await addBlock(other.id, listingId, iso(70), iso(71)), 'not-found', 'only the host')
    assert.equal(await addBlock(host.id, listingId, iso(-3), iso(-1)), 'invalid', 'not in the past')
    await assert.rejects(createBooking({ guestId: guest.id, car: await car(), cityName: 'Denver', request: request(slug, iso(63), iso(66)), quote, paid: 'demo' }), DatesTaken)
    assert.ok((await car()).booked?.some((r) => r.start === iso(60)), 'guests see blocked days as unavailable')
    const trip = await createBooking({ guestId: guest.id, car: await car(), cityName: 'Denver', request: request(slug, iso(80), iso(82)), quote, paid: 'demo' })
    assert.equal(await addBlock(host.id, listingId, iso(81), iso(85)), 'has-trip')
    await respond(host.id, trip.id, false)
    const [block] = (await listingForHost(host.id, listingId))!.blocks
    assert.equal(await removeBlock(other.id, listingId, block.id), false)
    assert.equal(await removeBlock(host.id, listingId, block.id), true)
  })

  it('lets the host edit price and details, checked by the listing rules', async () => {
    assert.equal(await updateListing(host.id, listingId, { dailyRateCents: 9500, instantBook: true }), true)
    assert.equal((await car()).dailyRateCents, 9500)
    assert.equal((await car()).instantBook, true)
    await assert.rejects(updateListing(host.id, listingId, { dailyRateCents: 500 }), ListingRejected)
    await assert.rejects(updateListing(host.id, listingId, { description: 'Too short.' }), ListingRejected)
    assert.equal(await updateListing(host.id, listingId, { vin: 'XXXXXXXXXXXXXXXXX' } as never), true, 'fixed fields are ignored')
    assert.equal(await updateListing(other.id, listingId, { dailyRateCents: 9000 }), false, 'only the host')
    const theirs = (await savePhoto({ ownerId: other.id, kind: 'listing', angle: 'front', bytes: jpeg(1600, 1200) })).id
    await assert.rejects(updateListing(host.id, listingId, {}, { angle: 'front', photoId: theirs }), ListingRejected, 'not another user’s photo')
    const fresh = (await savePhoto({ ownerId: host.id, kind: 'listing', angle: 'front', bytes: jpeg(2000, 1500) })).id
    await updateListing(host.id, listingId, {}, { angle: 'front', photoId: fresh })
    assert.equal((await car()).photos[0], `/api/photos/${fresh}`)
    await updateListing(host.id, listingId, { instantBook: false })
  })

  it('opens two-way reviews once a trip has ended', async () => {
    const b = await createBooking({ guestId: guest.id, car: await car(), cityName: 'Denver', request: request(slug, iso(-6), iso(-4)), quote, paid: 'demo' })
    assert.equal(await respond(host.id, b.id, true), 'ok')
    assert.equal((await tripFor(guest.id, b.id))!.canReview, true)
    assert.equal(await leaveReview(other.id, b.id, 5, 'Not my trip'), 'not-found')
    assert.equal(await leaveReview(guest.id, b.id, 5, 'Spotless, and Morgan was lovely.'), 'ok')
    assert.equal(await leaveReview(guest.id, b.id, 1, 'Changed my mind'), 'duplicate')
    assert.equal(await leaveReview(host.id, b.id, 5, 'Returned it cleaner than it left.'), 'ok')
    const c = await car()
    assert.equal(c.rating, 5)
    assert.equal(c.tripCount, 1)
    assert.equal(c.reviews[0].author, 'Riley')
    assert.deepEqual(await personStats(guest.id, 'guest'), { rating: 5, reviews: 1, trips: 1 })
    const t = (await tripFor(host.id, b.id))!
    assert.equal(t.canReview, false)
    assert.equal(t.reviews.theirs?.rating, 5)
    assert.equal(t.otherStats?.rating, 5, 'hosts see the guest’s record')
  })

  it('queues the host’s share of a paid trip once it ends', async () => {
    const b = await createBooking({ guestId: guest.id, car: await car(), cityName: 'Denver', request: request(slug, iso(80), iso(82)), quote, paid: 'stripe' })
    await assert.rejects(markPaid(b.id, 'ch_not_a_payment_intent'), 'only a PaymentIntent confirms a booking')
    assert.equal(await markPaid(b.id, 'pi_test_123', { amountCents: 39_999, currency: 'usd' }), 'pending_payment', 'the amount must match')
    assert.equal(await markPaid(b.id, 'pi_test_123', { amountCents: 40_000, currency: 'usd' }), 'requested')
    assert.equal(await respond(host.id, b.id, true), 'ok')
    // The trip happens; move it into the past.
    await (await db()).query(`update bookings set start_date = current_date - 12, end_date = current_date - 10 where id = $1`, [b.id])
    assert.equal(await queuePayouts(), 1)
    assert.equal(await queuePayouts(), 0, 'never twice')
    assert.equal(await sendPayouts(), 0, 'nothing moves without Stripe')
    const e = await earningsFor(host.id)
    const row = e.rows.find((r) => r.bookingId === b.id)!
    assert.equal(row.state, 'pending')
    assert.equal(row.amountCents, hostEarnings(quote, 'completed'))
    assert.equal(e.totals.preview, hostEarnings(quote, 'completed'), 'the preview trip shows as preview')
  })

  it('resets a password once, from the newest link only', async () => {
    assert.equal(await createResetLink('nobody@example.com', 'https://x'), null)
    const first = (await createResetLink('riley@example.com', 'https://x'))!
    const second = (await createResetLink('RILEY@example.com', 'https://x'))!
    const token = (l: string) => l.split('#token=')[1]
    const session = await createSession(guest.id)
    assert.equal(await resetPassword(token(first.link), 'a new long password'), null, 'superseded')
    assert.equal(await resetPassword('x'.repeat(43), 'a new long password'), null)
    assert.equal(await resetPassword(token(second.link), 'a new long password'), guest.id)
    assert.equal(await resetPassword(token(second.link), 'another password!!'), null, 'single use')
    assert.ok(await authenticate('riley@example.com', 'a new long password'))
    assert.equal(await userForToken(session.token), null, 'other sessions end')
  })

  it('closes an account, but not with trips ahead', async () => {
    await createBooking({ guestId: other.id, car: await car(), cityName: 'Denver', request: request(slug, iso(90), iso(91)), quote, paid: 'demo' })
    assert.equal(await deleteAccount(other.id), 'has-trips')
    assert.equal(await deleteAccount(guest.id), 'ok')
    assert.equal(await authenticate('riley@example.com', 'a new long password'), null)
    assert.equal((await getUser(guest.id))?.name, 'Former member')
  })

  it('sends no email without a provider', async () => {
    assert.equal(await deliverNotificationEmails(), 0)
  })
})
