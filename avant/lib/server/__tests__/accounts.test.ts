import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

process.env.AVANT_DB = 'memory'
const { authenticate, createSession, createUser, EmailTakenError, endSession, hashPassword, userForToken, verifyPassword } = await import('../accounts.ts')
const { db } = await import('../db.ts')

describe('passwords', () => {
  it('hashes with a salt and verifies only the right password', async () => {
    const a = await hashPassword('correct horse battery')
    const b = await hashPassword('correct horse battery')
    assert.notEqual(a, b, 'salted')
    assert.match(a, /^scrypt\$32768\$8\$1\$/)
    assert.equal(await verifyPassword('correct horse battery', a), true)
    assert.equal(await verifyPassword('correct horse batterz', a), false)
    assert.equal(await verifyPassword('x', 'garbage'), false)
  })
})

describe('accounts and sessions', () => {
  before(async () => {
    await db()
  })
  it('signs up, rejects a duplicate email in any case, and signs in', async () => {
    const u = await createUser({ name: 'Ada Host', email: 'Ada@Example.com', password: 'a-long-password' })
    assert.equal(u.email, 'ada@example.com')
    await assert.rejects(createUser({ name: 'X', email: 'ADA@example.com', password: 'another-password' }), EmailTakenError)
    assert.equal((await authenticate('ada@example.com', 'a-long-password'))?.id, u.id)
    assert.equal(await authenticate('ada@example.com', 'wrong-password'), null)
    assert.equal(await authenticate('nobody@example.com', 'a-long-password'), null)
  })
  it('stores only a hash of the session token, and ends sessions', async () => {
    const u = await createUser({ name: 'Ben Guest', email: 'ben@example.com', password: 'a-long-password' })
    const { token } = await createSession(u.id)
    const rows = await (await db()).query<{ token_hash: string }>(`select token_hash from sessions where user_id = $1`, [u.id])
    assert.equal(rows.length, 1)
    assert.notEqual(rows[0].token_hash, token)
    assert.equal((await userForToken(token))?.id, u.id)
    await endSession(token)
    assert.equal(await userForToken(token), null)
    assert.equal(await userForToken('not-a-token'), null)
  })
})
