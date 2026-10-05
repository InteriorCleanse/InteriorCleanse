import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

process.env.AVANT_DB = 'memory'
delete process.env.STRIPE_SECRET_KEY
delete process.env.RESEND_API_KEY
const { createSession, createUser, getUser, tokenHash } = await import('../accounts.ts')
const { savePhoto } = await import('../photos.ts')
const { carBySlug, createListing } = await import('../listings.ts')
const { createBooking, DatesTaken } = await import('../bookings.ts')
const { BlockedError, sendMessage, threadsFor } = await import('../inbox.ts')
const { block, blocksFor, report, unblockHandle } = await import('../safety.ts')
const { normalisePrefs, prefsFor, readUnsubscribeToken, setPrefs, unsubscribe, unsubscribeToken, wants } = await import('../prefs.ts')
const { confirmEmailChange, endSessionById, sessionsFor, startEmailChange } = await import('../account-settings.ts')
const { registerDevice } = await import('../push.ts')
const { consentsFor } = await import('../consent.ts')
const { db } = await import('../db.ts')
const { PHOTO_ANGLES } = await import('../../listing.ts')

const CITIES = [{ slug: 'denver', name: 'Denver', state: 'CO', lat: 39.74, lng: -104.99, bounds: [39.6, -105.1, 39.9, -104.8], taxRate: 0.0881, tz: 'America/Denver', landmarks: [] }] as never

function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])
}
const draft = {
  vin: '1M8GDM9AXKP042788', year: 2021, make: 'Mazda', model: 'MX-5', body: 'convertible', fuel: 'gas', transmission: 'manual', seats: 2,
  miles: 30000, city: 'denver', neighborhood: 'Wash Park', deliveryOffered: false, deliveryFeeCents: 0, dailyRateCents: 9000, weeklyDiscountPct: 10,
  instantBook: true, noOpenRecalls: true, insuredAndRegistered: true, color: 'Silver', efficiency: 30, monthlyDiscountPct: 20, milesPerDay: 200,
  description: 'A light, honest roadster kept in a garage. Top down on a sunny day in the foothills is the whole point of this car.',
  features: [], rules: ['No smoking.'],
} as const
const request = (slug: string, start: string, end: string) => ({ slug, start, end, startTime: '10:00', endTime: '10:00', coverage: 'plus' as const, extras: [], delivery: false, deliveryAddress: '' })
const quote = { days: 2, tripCents: 18000, deliveryCents: 0, extrasCents: 0, totalCents: 25000, lines: [] } as never
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

describe('settings, safety and consent', () => {
  let host: { id: string }, guest: { id: string }, stranger: { id: string }
  let slug = ''
  let tripId = ''

  before(async () => {
    host = await createUser({ name: 'Rene Ito', email: 'rene@example.com', password: 'a-long-password' })
    guest = await createUser({ name: 'Kit Moreno', email: 'kit@example.com', password: 'a-long-password' })
    stranger = await createUser({ name: 'Lee Other', email: 'lee@example.com', password: 'a-long-password' })
    const ids = []
    for (const a of PHOTO_ANGLES) ids.push((await savePhoto({ ownerId: host.id, kind: 'listing', angle: a.id, bytes: jpeg(1600, 1200) })).id)
    let listingId = ''
    ;({ id: listingId, slug } = await createListing(host.id, draft as never, ids, 2026, true))
    assert.ok((await consentsFor(host.id)).some((c) => c.document === 'host_agreement' && c.subjectId === listingId), 'host agreement recorded with the listing')
    const car = (await carBySlug(slug, CITIES))!
    tripId = (await createBooking({ guestId: guest.id, car, cityName: 'Denver', request: request(slug, iso(10), iso(12)), quote, paid: 'demo', acceptedTerms: true })).id
    assert.ok((await consentsFor(guest.id)).some((c) => c.document === 'trip_terms' && c.subjectId === tripId), 'trip terms recorded with the booking')
  })

  it('reports and blocks only people you can see, and blocking stops messages and bookings', async () => {
    assert.equal(await report(stranger.id, { context: 'trip', subjectId: tripId, reason: 'Spam or a scam', details: '', alsoBlock: false }), 'not-found')
    assert.equal(await report(guest.id, { context: 'trip', subjectId: tripId, reason: 'Spam or a scam', details: 'Asked me to pay by bank transfer.', alsoBlock: false }), 'ok')
    const [r] = await (await db()).query<{ subject_user_id: string; details: string }>(`select subject_user_id, details from reports`)
    assert.equal(r.subject_user_id, host.id, 'the server works out who it is about')
    assert.equal(r.details.includes('bank'), false, 'details sealed at rest')

    assert.equal(await block(stranger.id, 'trip', tripId, true), 'not-found')
    assert.equal(await block(guest.id, 'trip', tripId, true), 'ok')
    const [thread] = await threadsFor(guest.id)
    await assert.rejects(sendMessage(host.id, thread.id, 'Hello?'), BlockedError)
    await assert.rejects(sendMessage(guest.id, thread.id, 'Hello?'), BlockedError)
    const car = (await carBySlug(slug, CITIES))!
    await assert.rejects(createBooking({ guestId: guest.id, car, cityName: 'Denver', request: request(slug, iso(20), iso(21)), quote, paid: 'demo' }), DatesTaken)

    const list = await blocksFor(guest.id)
    assert.deepEqual(list.map((b) => b.name), ['Rene I.'])
    assert.equal(list[0].handle.includes(host.id), false, 'no account id in the list')
    assert.equal(await unblockHandle(stranger.id, list[0].handle), false, 'a handle only works for its owner')
    assert.equal(await unblockHandle(guest.id, list[0].handle), true)
    assert.ok(await sendMessage(guest.id, thread.id, 'Sorted, thanks.'))
  })

  it('keeps notification choices, and signed unsubscribe links work only as signed', async () => {
    assert.deepEqual(await prefsFor(guest.id), normalisePrefs({}))
    const prefs = normalisePrefs({ push: { offers: false } })
    await setPrefs(guest.id, prefs)
    assert.equal(wants(await prefsFor(guest.id), 'push', 'offers'), false)
    assert.equal(wants(await prefsFor(guest.id), 'push', 'trips'), true, 'trip notices always go')
    const token = await unsubscribeToken(guest.id, 'offers')
    assert.deepEqual(await readUnsubscribeToken(token), { userId: guest.id, category: 'offers' })
    const forged = token.replace(/^[^.]+/, Buffer.from(`${host.id}:offers`).toString('base64url'))
    assert.equal(await readUnsubscribeToken(forged), null)
    await unsubscribe(guest.id, 'offers')
    assert.equal((await prefsFor(guest.id)).email.offers, false)
    assert.equal((await prefsFor(guest.id)).email.messages, true)
  })

  it('lists where you’re signed in and signs out one device, with its push registration', async () => {
    const a = await createSession(stranger.id)
    const b = await createSession(stranger.id)
    await registerDevice(stranger.id, tokenHash(b.token), 'b'.repeat(64))
    await registerDevice(stranger.id, tokenHash(b.token), 'c'.repeat(64))
    const d = await db()
    assert.equal((await d.query(`select token from push_devices where user_id = $1`, [stranger.id])).length, 1, 'one device per session')
    const list = await sessionsFor(stranger.id, a.token)
    assert.equal(list.length, 2)
    const other = list.find((s) => !s.current)!
    assert.equal(await endSessionById(guest.id, other.id), false, 'not someone else’s')
    assert.equal(await endSessionById(stranger.id, other.id), true)
    assert.equal((await sessionsFor(stranger.id, a.token)).length, 1)
    assert.equal((await d.query(`select token from push_devices where user_id = $1`, [stranger.id])).length, 0)
  })

  it('changes an email only after the new address confirms', async () => {
    assert.equal(await startEmailChange(guest.id, 'wrong-password', 'new@example.com', 'https://x'), 'wrong-password')
    assert.equal(await startEmailChange(guest.id, 'a-long-password', 'rene@example.com', 'https://x'), 'taken')
    const out = (await startEmailChange(guest.id, 'a-long-password', 'Kit.New@Example.com', 'https://x')) as { link: string }
    assert.equal((await getUser(guest.id))!.email, 'kit@example.com', 'unchanged until confirmed')
    const token = new URLSearchParams(out.link.split('#')[1]).get('token')!
    assert.equal(await confirmEmailChange('x'.repeat(43)), null)
    assert.deepEqual(await confirmEmailChange(token), { userId: guest.id, oldEmail: 'kit@example.com', name: 'Kit Moreno' })
    assert.equal((await getUser(guest.id))!.email, 'kit.new@example.com')
    assert.equal(await confirmEmailChange(token), null, 'single use')
  })
})
