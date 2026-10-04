import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

process.env.AVANT_DB = 'memory'
delete process.env.STRIPE_SECRET_KEY
delete process.env.RESEND_API_KEY
const { createUser, deleteAccount, getUser } = await import('../accounts.ts')
const { savePhoto } = await import('../photos.ts')
const { carBySlug, createListing, listingsForHost } = await import('../listings.ts')
const { cancel, createBooking, tripFor } = await import('../bookings.ts')
const { messagesIn, sendMessage, threadsFor } = await import('../inbox.ts')
const { openText, sealText } = await import('../sealed.ts')
const { recordConsent, consentsFor } = await import('../consent.ts')
const { createVerifyLink, verifyEmail } = await import('../recovery.ts')
const { exportAccount } = await import('../export.ts')
const { takeShared } = await import('../limits.ts')
const { purgeExpired } = await import('../retention.ts')
const { stripJpegMetadata } = await import('../jpeg.ts')
const { db } = await import('../db.ts')
const { PHOTO_ANGLES } = await import('../../listing.ts')
const { LEGAL_VERSIONS } = await import('../../legal.ts')

const CITIES = [{ slug: 'denver', name: 'Denver', state: 'CO', lat: 39.74, lng: -104.99, bounds: [39.6, -105.1, 39.9, -104.8], taxRate: 0.0881, tz: 'America/Denver', landmarks: [] }] as never

function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])
}

const VIN = '1M8GDM9AXKP042788'
const draft = {
  vin: VIN, year: 2021, make: 'Audi', model: 'e-tron GT', body: 'sedan', fuel: 'electric', transmission: 'automatic', seats: 4,
  miles: 18000, city: 'denver', neighborhood: 'LoHi', deliveryOffered: true, deliveryFeeCents: 3000, dailyRateCents: 18000, weeklyDiscountPct: 10,
  instantBook: true, noOpenRecalls: true, insuredAndRegistered: true, color: 'Silver', efficiency: 240, monthlyDiscountPct: 20, milesPerDay: 200,
  description: 'A grand tourer kept in the garage and detailed every month. Silent, fast and comfortable for a weekend drive into the mountains.',
  features: ['awd'], rules: ['No smoking.'], pickup: 'Lockbox code 4471 on the garage door, bay 9.',
} as const

const request = (slug: string, start: string, end: string, address = '') => ({
  slug, start, end, startTime: '10:00', endTime: '10:00', coverage: 'plus' as const, extras: [], delivery: Boolean(address), deliveryAddress: address,
})
const quote = { days: 2, tripCents: 36000, deliveryCents: 3000, extrasCents: 0, totalCents: 45000, lines: [] } as never
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

describe('sealed fields', () => {
  it('round-trips, and refuses to open on another row', async () => {
    const sealed = await sealText('221B Baker Street', 'booking:a:address')
    assert.match(sealed, /^v1\./)
    assert.equal(sealed.includes('Baker'), false)
    assert.equal(await openText(sealed, 'booking:a:address'), '221B Baker Street')
    assert.equal(await openText(sealed, 'booking:b:address'), '', 'bound to its row')
    assert.equal(await openText('written before encryption', 'x'), 'written before encryption')
    assert.equal(await sealText('', 'x'), '')
  })
})

describe('photo metadata', () => {
  it('drops EXIF, comments and trailing data but keeps the image', () => {
    const exif = [0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]
    const comment = [0xff, 0xfe, 0x00, 0x05, 0x47, 0x50, 0x53]
    const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0xb0, 0x06, 0x40, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
    const scan = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0xff, 0xd9]
    const input = new Uint8Array([0xff, 0xd8, ...exif, ...comment, ...sof, ...scan, 0x48, 0x49])
    const out = stripJpegMetadata(input)!
    assert.deepEqual([...out], [0xff, 0xd8, ...sof, ...scan])
    assert.equal(stripJpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null)
  })
})

describe('shared rate limits', () => {
  it('refuses past capacity and never stores the key itself', async () => {
    const limit = { capacity: 3, refillPerSec: 0.0001 }
    const key = 'login-email:someone@example.com'
    const results = []
    for (let i = 0; i < 5; i++) results.push((await takeShared(key, limit)).ok)
    assert.deepEqual(results, [true, true, true, false, false])
    assert.equal((await takeShared('another-key', limit)).ok, true, 'keys are independent')
    const rows = await (await db()).query<{ key_hash: string }>(`select key_hash from rate_limits`)
    assert.ok(rows.every((r) => /^[0-9a-f]{64}$/.test(r.key_hash)))
  })
})

describe('people’s information', () => {
  let host: { id: string }, guest: { id: string }
  let slug = ''
  let listingId = ''
  const car = async () => (await carBySlug(slug, CITIES))!

  before(async () => {
    host = await createUser({ name: 'Avery Stone', email: 'avery@example.com', password: 'a-long-password' })
    guest = await createUser({ name: 'Quinn Park', email: 'quinn@example.com', password: 'a-long-password' })
    const ids = []
    for (const a of PHOTO_ANGLES) ids.push((await savePhoto({ ownerId: host.id, kind: 'listing', angle: a.id, bytes: jpeg(1600, 1200) })).id)
    ;({ id: listingId, slug } = await createListing(host.id, draft as never, ids, 2026))
  })

  it('keeps the VIN, pickup note, address and messages encrypted at rest', async () => {
    const b = await createBooking({ guestId: guest.id, car: await car(), cityName: 'Denver', request: request(slug, iso(20), iso(22), '1600 Glenarm Pl'), quote, paid: 'demo' })
    const [thread] = await threadsFor(guest.id)
    assert.ok(await sendMessage(guest.id, thread.id, 'The gate code is 9921'))
    const d = await db()
    const raw = JSON.stringify([
      await d.query(`select data from listings where id = $1`, [listingId]),
      await d.query(`select request from bookings where id = $1`, [b.id]),
      await d.query(`select body from messages`),
    ])
    for (const secret of [VIN, '4471', 'Glenarm', '9921']) assert.equal(raw.includes(secret), false, `${secret} is not stored in the clear`)
    assert.equal((await messagesIn(host.id, thread.id))!.at(-1)!.body, 'The gate code is 9921')
    assert.equal((await tripFor(guest.id, b.id))!.request.deliveryAddress, '1600 Glenarm Pl', 'the guest reads it back')
  })

  it('records which version of each document someone accepted', async () => {
    await recordConsent(guest.id, ['terms', 'privacy'], 'signup')
    await recordConsent(guest.id, ['trip_terms'], 'booking', 'bkg_1')
    const c = await consentsFor(guest.id)
    assert.deepEqual(c.map((r) => r.document).sort(), ['privacy', 'terms', 'trip_terms'])
    assert.equal(c.find((r) => r.document === 'trip_terms')!.version, LEGAL_VERSIONS.trip_terms)
    assert.equal(c.find((r) => r.document === 'trip_terms')!.subjectId, 'bkg_1')
  })

  it('confirms an email address once, from the newest link only', async () => {
    const u = await createUser({ name: 'Rowan Ellis', email: 'rowan@example.com', password: 'a-long-password' })
    assert.equal((await getUser(u.id))!.emailVerified, false)
    const old = new URL((await createVerifyLink(u.id, 'https://x')).replace('#token=', '?token=')).searchParams.get('token')!
    const fresh = new URL((await createVerifyLink(u.id, 'https://x')).replace('#token=', '?token=')).searchParams.get('token')!
    assert.equal(await verifyEmail(old), null, 'a newer link replaces the old one')
    assert.equal(await verifyEmail('not-a-token'), null)
    assert.equal(await verifyEmail(fresh), u.id)
    assert.equal(await verifyEmail(fresh), null, 'single use')
    assert.equal((await getUser(u.id))!.emailVerified, true)
  })

  it('exports everything about a person, and nothing secret', async () => {
    const out = (await exportAccount(host.id))!
    const text = JSON.stringify(out)
    assert.ok(text.includes('avery@example.com'))
    assert.ok(text.includes(VIN), 'the host gets their own VIN back')
    assert.ok(text.includes('The gate code is 9921'), 'and their conversations')
    assert.equal(/scrypt\$/.test(text), false, 'never the password hash')
    assert.equal(await exportAccount('usr_nobody'), null)
  })

  it('won’t cancel a confirmed trip once pickup time has passed', async () => {
    const b = await createBooking({ guestId: guest.id, car: await car(), cityName: 'Denver', request: request(slug, iso(30), iso(32)), quote, paid: 'demo' })
    await (await db()).query(`update bookings set start_date = current_date - 1, end_date = current_date + 1 where id = $1`, [b.id])
    assert.equal((await cancel(guest.id, b.id)).result, 'not-allowed')
    assert.equal((await cancel(host.id, b.id)).result, 'not-allowed')
  })

  it('pauses a host’s cars after three cancellations of confirmed trips in a month', async () => {
    for (let i = 0; i < 3; i++) {
      const b = await createBooking({ guestId: guest.id, car: await car(), cityName: 'Denver', request: request(slug, iso(100 + i * 5), iso(101 + i * 5)), quote, paid: 'demo' })
      assert.equal((await cancel(host.id, b.id)).result, 'ok')
    }
    assert.equal((await listingsForHost(host.id))[0].status, 'paused')
  })

  it('erases a closed account’s words and addresses, and purges what has expired', async () => {
    const leaver = await createUser({ name: 'Blake Moss', email: 'blake@example.com', password: 'a-long-password' })
    const d = await db()
    await d.query(`update listings set status = 'live' where id = $1`, [listingId])
    const b = await createBooking({ guestId: leaver.id, car: await car(), cityName: 'Denver', request: request(slug, iso(-9), iso(-8), '77 Elm St'), quote, paid: 'demo' })
    const thread = (await threadsFor(leaver.id)).find((t) => t.bookingId === b.id)!
    await d.query(`insert into messages (id, thread_id, sender_id, body) values ('msg_leaver', $1, $2, 'my number is 555 0100')`, [thread.id, leaver.id])
    assert.equal(await deleteAccount(leaver.id), 'ok')
    const [m] = await d.query<{ body: string }>(`select body from messages where id = 'msg_leaver'`)
    assert.equal(m.body, '')
    const [row] = await d.query<{ address: string }>(`select request->>'deliveryAddress' as address from bookings where id = $1`, [b.id])
    assert.equal(row.address, '')
    assert.equal(typeof (await purgeExpired()), 'object')
  })
})
