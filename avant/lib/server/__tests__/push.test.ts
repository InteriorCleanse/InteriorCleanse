import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { describe, it } from 'node:test'

process.env.AVANT_DB = 'memory'
delete process.env.APNS_KEY_P8
const { createSession, createUser, endAllSessions, endSession, tokenHash } = await import('../accounts.ts')
const { deliverPushNotifications, isDeviceToken, providerToken, registerDevice, removeDevice } = await import('../push.ts')
const { db } = await import('../db.ts')

const DEVICE = 'a'.repeat(64)

describe('push notifications', () => {
  it('signs the provider token APNs expects', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const jwt = providerToken(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'KEY123', 'TEAM456', 1_700_000_000)
    const [h, c, s] = jwt.split('.')
    assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { alg: 'ES256', kid: 'KEY123' })
    assert.deepEqual(JSON.parse(Buffer.from(c, 'base64url').toString()), { iss: 'TEAM456', iat: 1_700_000_000 })
    assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')))
  })

  it('accepts only device tokens', () => {
    assert.equal(isDeviceToken(DEVICE), true)
    assert.equal(isDeviceToken('abc'), false)
    assert.equal(isDeviceToken('z'.repeat(64)), false)
  })

  it('ties a device to the session that registered it', async () => {
    const u = await createUser({ name: 'Kai Lane', email: 'kai@example.com', password: 'a-long-password' })
    const d = await db()
    const count = async () => Number((await d.query<{ n: string }>(`select count(*) as n from push_devices where user_id = $1`, [u.id]))[0].n)

    const one = await createSession(u.id)
    await registerDevice(u.id, tokenHash(one.token), DEVICE)
    await registerDevice(u.id, tokenHash(one.token), DEVICE)
    assert.equal(await count(), 1, 'registering twice keeps one row')
    await endSession(one.token)
    assert.equal(await count(), 0, 'signing out stops notifications to that phone')

    const two = await createSession(u.id)
    await registerDevice(u.id, tokenHash(two.token), DEVICE)
    await removeDevice('someone-else', DEVICE)
    assert.equal(await count(), 1, 'only the owner can remove it')
    await endAllSessions(u.id)
    assert.equal(await count(), 0, 'signing out everywhere too')
  })

  it('sends nothing until APNs is configured', async () => {
    assert.equal(await deliverPushNotifications(), 0)
  })
})
