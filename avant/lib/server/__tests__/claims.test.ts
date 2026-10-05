import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

process.env.AVANT_DB = 'memory'
delete process.env.STRIPE_SECRET_KEY
delete process.env.RESEND_API_KEY
const { createUser } = await import('../accounts.ts')
const { savePhoto } = await import('../photos.ts')
const { carBySlug, createListing } = await import('../listings.ts')
const { createBooking } = await import('../bookings.ts')
const { confirmReading, escalateOverdueClaims, openClaim, recordReading, respondToClaim, tripRecord, withdrawClaim } = await import('../claims.ts')
const { notificationsFor } = await import('../inbox.ts')
const { db } = await import('../db.ts')
const { PHOTO_ANGLES } = await import('../../listing.ts')

const CITIES = [{ slug: 'denver', name: 'Denver', state: 'CO', lat: 39.74, lng: -104.99, bounds: [39.6, -105.1, 39.9, -104.8], taxRate: 0.0881, tz: 'America/Denver', landmarks: [] }] as never

function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])
}

const draft = {
  vin: '1M8GDM9AXKP042788', year: 2022, make: 'BMW', model: 'i4', body: 'sedan', fuel: 'electric', transmission: 'automatic', seats: 5,
  miles: 20000, city: 'denver', neighborhood: 'Highlands', deliveryOffered: false, deliveryFeeCents: 0, dailyRateCents: 15000, weeklyDiscountPct: 10,
  instantBook: true, noOpenRecalls: true, insuredAndRegistered: true, color: 'Silver', efficiency: 250, monthlyDiscountPct: 20, milesPerDay: 200,
  description: 'A quiet electric sedan, charged and detailed before every trip. Comfortable, quick and easy to park anywhere in the city.',
  features: ['awd'], rules: ['No smoking.'],
} as const

const request = (slug: string, start: string, end: string) => ({ slug, start, end, startTime: '10:00', endTime: '10:00', coverage: 'plus' as const, extras: [], delivery: false, deliveryAddress: '' })
const quote = { days: 3, tripCents: 45000, deliveryCents: 0, extrasCents: 0, totalCents: 60000, lines: [] } as never
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

describe('trip records and claims', () => {
  let host: { id: string }, guest: { id: string }, stranger: { id: string }
  let slug = ''
  let tripId = ''

  before(async () => {
    host = await createUser({ name: 'Avery Lane', email: 'avery@example.com', password: 'a-long-password' })
    guest = await createUser({ name: 'Jules Park', email: 'jules@example.com', password: 'a-long-password' })
    stranger = await createUser({ name: 'Sam Other', email: 'sam@example.com', password: 'a-long-password' })
    const ids = []
    for (const a of PHOTO_ANGLES) ids.push((await savePhoto({ ownerId: host.id, kind: 'listing', angle: a.id, bytes: jpeg(1600, 1200) })).id)
    ;({ slug } = await createListing(host.id, draft as never, ids, 2026))
    const car = (await carBySlug(slug, CITIES))!
    tripId = (await createBooking({ guestId: guest.id, car, cityName: 'Denver', request: request(slug, iso(0), iso(3)), quote, paid: 'demo' })).id
  })

  it('records pickup and return readings, confirmed by the other side', async () => {
    assert.equal(await tripRecord(stranger.id, tripId), null, 'strangers see nothing')
    assert.equal(await recordReading(stranger.id, tripId, 'pickup', 1000, 90), 'not-found')
    assert.equal(await recordReading(guest.id, tripId, 'return', 1500, 80), 'not-allowed', 'return needs a pickup first')
    assert.equal(await recordReading(guest.id, tripId, 'pickup', 1000, 90), 'ok')
    assert.equal(await recordReading(host.id, tripId, 'pickup', 1200, 90), 'not-allowed', 'first reading stands')
    assert.equal(await confirmReading(guest.id, tripId, 'pickup'), 'not-allowed', 'you can’t confirm your own reading')
    assert.equal(await confirmReading(host.id, tripId, 'pickup'), 'ok')
    assert.deepEqual(await recordReading(guest.id, tripId, 'return', 900, 80), { error: 'The return reading is lower than at pickup. Check it.' })
    assert.equal(await recordReading(host.id, tripId, 'return', 1700, 60), 'ok')
    const r = (await tripRecord(guest.id, tripId))!
    assert.equal(r.pickup?.confirmed, true)
    assert.equal(r.return?.confirmed, false)
    assert.equal(r.can.confirmReturn, true)
    assert.deepEqual(r.mileage, { driven: 700, allowance: 600, over: 100 })
    assert.ok((await notificationsFor(host.id)).some((n) => n.title === 'Pickup recorded'))
  })

  it('takes a host’s report, gives the guest a window to respond, and never shows strangers', async () => {
    assert.deepEqual(await openClaim(host.id, tripId, { kind: 'accident', description: 'This is not a host report kind at all.' }), { error: 'Choose what happened.' })
    assert.deepEqual(await openClaim(host.id, tripId, { kind: 'damage', description: 'A long scratch on the rear passenger door.' }), { error: 'Add at least one photo of the damage.' })
    const photo = await savePhoto({ ownerId: host.id, kind: 'claim', bytes: jpeg(1200, 900) })
    const opened = (await openClaim(host.id, tripId, { kind: 'damage', description: 'A long scratch on the rear passenger door.', amountCents: 42000, photoIds: [photo.id, 'not-mine'] })) as { id: string }
    assert.ok(opened.id)
    const forGuest = (await tripRecord(guest.id, tripId))!.claims[0]
    assert.equal(forGuest.description, 'A long scratch on the rear passenger door.')
    assert.equal(forGuest.photos.length, 1, 'only the host’s own photo is attached')
    assert.ok(forGuest.respondBy)
    assert.equal((await tripRecord(guest.id, tripId))!.capCents, 50000, 'the Plus plan caps it')
    const [raw] = await (await db()).query<{ description: string }>(`select description from claims where id = $1`, [opened.id])
    assert.equal(raw.description.includes('scratch'), false, 'sealed at rest')
    assert.ok((await notificationsFor(guest.id)).some((n) => n.title === 'Your host reported an issue'))

    assert.equal(await respondToClaim(stranger.id, opened.id, true, ''), 'not-found')
    assert.equal(await respondToClaim(host.id, opened.id, true, ''), 'not-found', 'not your own report')
    assert.equal(await respondToClaim(guest.id, opened.id, false, 'That scratch was there at pickup; see my check-in photos.'), 'ok')
    assert.equal(await respondToClaim(guest.id, opened.id, true, ''), 'not-allowed', 'once')
    const after = (await tripRecord(host.id, tripId))!.claims[0]
    assert.equal(after.status, 'responded')
    assert.equal(after.responseAccepts, false)
    assert.equal(await withdrawClaim(guest.id, opened.id), 'not-found')
    assert.equal(await withdrawClaim(host.id, opened.id), 'ok')
  })

  it('lets a guest report an accident, and escalates reports nobody answered', async () => {
    const accident = (await openClaim(guest.id, tripId, { kind: 'accident', description: 'Rear-ended at a light on Colfax, no injuries.', policeReport: 'DPD 26-1234', otherParty: 'Blue Civic, CO plate ABC123' })) as { id: string }
    const view = (await tripRecord(host.id, tripId))!.claims.find((c) => c.id === accident.id)!
    assert.equal(view.otherParty, 'Blue Civic, CO plate ABC123')
    assert.equal(view.amountCents, null)
    const cleaning = (await openClaim(host.id, tripId, { kind: 'cleaning', description: 'Dog hair throughout the back seats.' })) as { id: string }
    await (await db()).query(`update claims set respond_by = now() - interval '1 hour' where id = $1`, [cleaning.id])
    assert.equal(await escalateOverdueClaims(), 1)
    assert.equal((await tripRecord(guest.id, tripId))!.claims.find((c) => c.id === cleaning.id)!.status, 'review')
  })
})
