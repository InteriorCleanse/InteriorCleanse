import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { b64urlDecode, b64urlEncode, open, randomBytes, seal, sign, verify } from '../security/crypto.ts'
import { resetBuckets, take } from '../security/rate-limit.ts'
import { stripeSignatureHeader, verifyStripeSignature } from '../verification/stripe-signature.ts'

describe('seal / open', () => {
  const key = randomBytes(32)
  it('round-trips and binds associated data', async () => {
    const sealed = await seal('{"age":22}', key, 'record-a')
    assert.match(sealed, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/)
    assert.equal(await open(sealed, [key], 'record-a'), '{"age":22}')
    assert.equal(await open(sealed, [key], 'record-b'), null, 'a record cannot be replayed under another key')
  })
  it('rejects tampering and wrong keys, and supports rotation', async () => {
    const sealed = await seal('secret', key)
    const parts = sealed.split('.')
    const ct = b64urlDecode(parts[3])
    ct[0] ^= 1
    assert.equal(await open([...parts.slice(0, 3), b64urlEncode(ct)].join('.'), [key]), null)
    assert.equal(await open(sealed, [randomBytes(32)]), null)
    assert.equal(await open(sealed, [randomBytes(32), key]), 'secret')
  })
  it('refuses short keys', async () => {
    await assert.rejects(() => seal('x', randomBytes(16)))
  })
})

describe('sign / verify', () => {
  it('accepts its own signatures only', async () => {
    const k = randomBytes(32)
    const s = await sign('sid:abc', k)
    assert.equal(await verify('sid:abc', s, k), true)
    assert.equal(await verify('sid:abd', s, k), false)
    assert.equal(await verify('sid:abc', s, randomBytes(32)), false)
    assert.equal(await verify('sid:abc', '!!not-base64!!', k), false)
  })
})

describe('rate limit', () => {
  it('allows a burst, then refuses, then refills', () => {
    resetBuckets()
    const limit = { capacity: 3, refillPerSec: 1 }
    const t = 1_000_000
    assert.equal(take('k', limit, t).ok, true)
    assert.equal(take('k', limit, t).ok, true)
    assert.equal(take('k', limit, t).ok, true)
    const denied = take('k', limit, t)
    assert.equal(denied.ok, false)
    assert.equal(denied.retryAfterSec, 1)
    assert.equal(take('k', limit, t + 1100).ok, true)
    assert.equal(take('other', limit, t).ok, true, 'buckets are per key')
  })
})

describe('Stripe webhook signature', () => {
  const secret = 'whsec_test'
  const body = '{"type":"identity.verification_session.verified"}'
  it('accepts a fresh, correct signature', async () => {
    const now = 1_760_000_000
    const header = await stripeSignatureHeader(body, secret, now)
    assert.equal(await verifyStripeSignature(body, header, secret, 300, now + 10), true)
  })
  it('rejects stale, tampered or missing signatures', async () => {
    const now = 1_760_000_000
    const header = await stripeSignatureHeader(body, secret, now)
    assert.equal(await verifyStripeSignature(body, header, secret, 300, now + 301), false)
    assert.equal(await verifyStripeSignature(body + ' ', header, secret, 300, now), false)
    assert.equal(await verifyStripeSignature(body, null, secret), false)
    assert.equal(await verifyStripeSignature(body, header, 'whsec_other', 300, now), false)
  })
})
