import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

process.env.AVANT_DB = 'memory'
delete process.env.STRIPE_SECRET_KEY
const { createUser } = await import('../accounts.ts')
const { savePhoto } = await import('../photos.ts')
const { carBySlug, createListing, updateListing } = await import('../listings.ts')
const { cancel, createBooking, expireRequests, tripFor } = await import('../bookings.ts')
const { applyReferral, circleFor, circlePricing, nudgeReviews, referralCodeFor, rewardReferrals } = await import('../advantage.ts')
const { creditBalance, creditHistory } = await import('../credit.ts')
const { notificationsFor, setFavorite } = await import('../inbox.ts')
const { db } = await import('../db.ts')
const { PHOTO_ANGLES } = await import('../../listing.ts')
const { PROMISE, REFERRAL } = await import('../../circle.ts')

const CITIES = [{ slug: 'denver', name: 'Denver', state: 'CO', lat: 39.74, lng: -104.99, bounds: [39.6, -105.1, 39.9, -104.8], taxRate: 0.0881, tz: 'America/Denver', landmarks: [] }] as never

function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])
}

const draft = {
  vin: '1M8GDM9AXKP042788', year: 2022, make: 'Porsche', model: 'Taycan', body: 'sedan', fuel: 'electric', transmission: 'automatic', seats: 4,
  miles: 20000, city: 'denver', neighborhood: 'Cherry Creek', deliveryOffered: false, deliveryFeeCents: 0, dailyRateCents: 20000, weeklyDiscountPct: 10,
  instantBook: true, noOpenRecalls: true, insuredAndRegistered: true, color: 'Silver', efficiency: 250, monthlyDiscountPct: 20, milesPerDay: 200,
  description: 'An electric grand tourer I keep immaculate. Quiet, quick and comfortable for a long weekend in the mountains or a special evening out.',
  features: ['awd'], rules: ['No smoking.'], welcome: 'Welcome! The cable is in the frunk.', pickup: 'Level 2 of the garage on 3rd Ave, bay 14.',
} as const

const request = (slug: string, start: string, end: string) => ({ slug, start, end, startTime: '10:00', endTime: '10:00', coverage: 'plus' as const, extras: [], delivery: false, deliveryAddress: '' })
const quote = (total = 40_000) => ({ days: 2, tripCents: 30_000, deliveryCents: 0, extrasCents: 0, totalCents: total, lines: [] }) as never
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

describe('the AVANT Advantage', () => {
  let host: { id: string }, guest: { id: string }, friend: { id: string }
  let slug = ''
  const car = async () => (await carBySlug(slug, CITIES))!

  before(async () => {
    host = await createUser({ name: 'Morgan Hale', email: 'morgan@example.com', password: 'a-long-password' })
    guest = await createUser({ name: 'Riley Chen', email: 'riley@example.com', password: 'a-long-password' })
    friend = await createUser({ name: 'Sam Friend', email: 'sam@example.com', password: 'a-long-password' })
    const ids = []
    for (const a of PHOTO_ANGLES) ids.push((await savePhoto({ ownerId: host.id, kind: 'listing', angle: a.id, bytes: jpeg(1600, 1200) })).id)
    ;({ slug } = await createListing(host.id, draft as never, ids, 2026))
  })

  it('welcomes a referred friend with credit, once, and never to yourself', async () => {
    const code = await referralCodeFor(guest.id)
    assert.equal(await referralCodeFor(guest.id), code, 'the code is stable')
    assert.equal(await applyReferral(guest.id, code), false, 'no self-referral')
    assert.equal(await applyReferral(friend.id, code), true)
    assert.equal(await applyReferral(friend.id, code), false, 'only once')
    assert.equal(await creditBalance(friend.id), REFERRAL.friendCreditCents)
  })

  it('spends credit at booking and gives it back as credit when refunded', async () => {
    const b = await createBooking({ guestId: friend.id, car: await car(), cityName: 'Denver', request: request(slug, iso(40), iso(42)), quote: quote(), paid: 'demo', creditCents: 9_999_999 })
    assert.equal(b.creditCents, REFERRAL.friendCreditCents, 'never more than the balance')
    assert.equal(await creditBalance(friend.id), 0)
    const out = await cancel(friend.id, b.id)
    assert.equal(out.refundCents, 40_000)
    const t = (await tripFor(friend.id, b.id))!
    assert.deepEqual(t.refund, { cents: 40_000, status: 'demo', creditCents: REFERRAL.friendCreditCents })
    assert.equal(await creditBalance(friend.id), REFERRAL.friendCreditCents, 'credit came back as credit')
  })

  it('keeps the AVANT Promise when a host cancels: full refund plus credit, once', async () => {
    const b = await createBooking({ guestId: guest.id, car: await car(), cityName: 'Denver', request: request(slug, iso(50), iso(52)), quote: quote(), paid: 'demo' })
    assert.equal(b.status, 'confirmed')
    assert.equal((await cancel(host.id, b.id)).refundCents, 40_000)
    assert.equal(await creditBalance(guest.id), PROMISE.hostCancelCreditCents)
    assert.ok((await notificationsFor(guest.id)).some((n) => n.body.includes('AVANT credit for the trouble')))
    assert.equal((await cancel(host.id, b.id)).result, 'not-allowed')
    assert.equal(await creditBalance(guest.id), PROMISE.hostCancelCreditCents, 'never twice')
  })

  it('makes good on a request the host lets expire', async () => {
    await updateListing(host.id, (await (await db()).query<{ id: string }>(`select id from listings where slug = $1`, [slug]))[0].id, { instantBook: false })
    const before = await creditBalance(guest.id)
    const b = await createBooking({ guestId: guest.id, car: await car(), cityName: 'Denver', request: request(slug, iso(60), iso(62)), quote: quote(), paid: 'demo', creditCents: 0 })
    await (await db()).query(`update bookings set created_at = now() - interval '9 hours' where id = $1`, [b.id])
    await expireRequests()
    assert.equal(await creditBalance(guest.id), before + PROMISE.requestExpiredCreditCents)
  })

  it('alerts people who saved a car when its price drops, without flooding them', async () => {
    const [{ id }] = await (await db()).query<{ id: string }>(`select id from listings where slug = $1`, [slug])
    await setFavorite(friend.id, slug, true)
    await updateListing(host.id, id, { dailyRateCents: 18_000 })
    await updateListing(host.id, id, { dailyRateCents: 19_000 })
    await updateListing(host.id, id, { dailyRateCents: 17_000 })
    const drops = (await notificationsFor(friend.id)).filter((n) => n.title === 'Price drop')
    assert.equal(drops.length, 1, 'one alert in three days')
    assert.match(drops[0].body, /\$180 a day, down from \$200/)
  })

  it('shows the host’s welcome and pickup note only to a confirmed guest', async () => {
    const [{ id }] = await (await db()).query<{ id: string }>(`select id from listings where slug = $1`, [slug])
    await updateListing(host.id, id, { instantBook: true })
    const b = await createBooking({ guestId: guest.id, car: await car(), cityName: 'Denver', request: request(slug, iso(70), iso(71)), quote: quote(), paid: 'demo', creditCents: 0 })
    assert.deepEqual((await tripFor(guest.id, b.id))!.hostNote, { welcome: draft.welcome, pickup: draft.pickup })
    assert.equal((await tripFor(host.id, b.id))!.hostNote, null)
    assert.equal(JSON.stringify(await car()).includes('bay 14'), false, 'never on the public listing')
  })

  it('rewards the referrer after the friend’s first finished trip, and nudges for reviews', async () => {
    const b = await createBooking({ guestId: friend.id, car: await car(), cityName: 'Denver', request: request(slug, iso(-3), iso(-1)), quote: quote(), paid: 'demo', creditCents: 0 })
    assert.equal((await tripFor(friend.id, b.id))!.status, 'confirmed')
    const before = await creditBalance(guest.id)
    assert.equal(await rewardReferrals(), 1)
    assert.equal(await rewardReferrals(), 0, 'once')
    assert.equal(await creditBalance(guest.id), before + REFERRAL.referrerCreditCents)
    assert.ok((await creditHistory(guest.id)).some((c) => c.reason === 'referral_reward'))
    assert.equal(await nudgeReviews(), 1)
    assert.equal(await nudgeReviews(), 0, 'asked once')
    assert.ok((await notificationsFor(friend.id)).some((n) => n.title === 'How was the drive?'))
  })

  it('lowers the trip fee as completed trips add up', async () => {
    assert.equal((await circlePricing(guest.id)).feePct, 12)
    for (let i = 0; i < 3; i++) {
      await createBooking({ guestId: guest.id, car: await car(), cityName: 'Denver', request: request(slug, iso(-30 + i * 3), iso(-29 + i * 3)), quote: quote(), paid: 'demo', creditCents: 0 })
    }
    const status = await circleFor(guest.id)
    assert.equal(status.tier.id, 'silver')
    assert.equal((await circlePricing(guest.id)).feePct, 10)
    assert.equal(status.next?.tier.id, 'gold')
  })
})
