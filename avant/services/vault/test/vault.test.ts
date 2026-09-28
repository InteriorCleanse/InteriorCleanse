import assert from 'node:assert/strict'
import { createHmac, createHash, randomBytes } from 'node:crypto'
import { describe, it } from 'node:test'
import { handle, purge, type D1Like, type Env } from '../src/index.ts'
import { seal } from '../../../lib/security/crypto.ts'

/** A Map-backed stand-in for the three statements the vault issues. */
function fakeDb() {
  const records = new Map<string, { sealed: string; expires_at: number }>()
  const audit: unknown[][] = []
  const db: D1Like = {
    prepare(sql: string) {
      return {
        bind(...v: unknown[]) {
          return {
            async first<T>() {
              const r = records.get(v[0] as string)
              return (r && r.expires_at > (v[1] as number) ? { sealed: r.sealed } : null) as T | null
            },
            async run() {
              if (sql.startsWith('INSERT INTO records')) records.set(v[0] as string, { sealed: v[1] as string, expires_at: v[3] as number })
              else if (sql.startsWith('DELETE FROM records WHERE key')) records.delete(v[0] as string)
              else if (sql.startsWith('DELETE FROM records WHERE expires_at')) for (const [k, r] of records) if (r.expires_at <= (v[0] as number)) records.delete(k)
              else if (sql.startsWith('INSERT INTO audit')) audit.push(v)
              return {}
            },
          }
        },
      }
    },
  }
  return { db, records, audit }
}

const secretBytes = randomBytes(32)
const SIGNING_KEY = secretBytes.toString('base64url')
const KEY = 'a'.repeat(48)
// Sealed by the app's own code, so the test proves both sides agree on the format.
const SEALED = await seal('{"v":1,"age":22}', new Uint8Array(randomBytes(32)), 'a'.repeat(48))
const PATH = `/v1/records/${KEY}`

function signed(method: string, body = '', ts = Math.floor(Date.now() / 1000)) {
  const digest = createHash('sha256').update(body).digest('hex')
  const sig = createHmac('sha256', secretBytes).update(`${method}\n${PATH}\n${ts}\n${digest}`).digest('base64url')
  return new Request(`https://vault.test${PATH}`, { method, body: method === 'PUT' ? body : undefined, headers: { 'x-avant-ts': String(ts), 'x-avant-sig': sig } })
}

describe('vault', () => {
  it('stores, reads and deletes a sealed record with signed requests', async () => {
    const { db, audit } = fakeDb()
    const env: Env = { DB: db, SIGNING_KEY }
    assert.equal((await handle(signed('PUT', SEALED), env)).status, 204)
    const got = await handle(signed('GET'), env)
    assert.equal(got.status, 200)
    assert.equal(await got.text(), SEALED)
    assert.equal((await handle(signed('DELETE'), env)).status, 204)
    assert.equal((await handle(signed('GET'), env)).status, 404)
    assert.ok(audit.every((row) => !JSON.stringify(row).includes(KEY)), 'audit keeps only a key prefix')
  })

  it('refuses unsigned, stale and tampered requests', async () => {
    const env: Env = { DB: fakeDb().db, SIGNING_KEY }
    assert.equal((await handle(new Request(`https://vault.test${PATH}`), env)).status, 401)
    assert.equal((await handle(signed('GET', '', Math.floor(Date.now() / 1000) - 600), env)).status, 401)
    const req = signed('PUT', SEALED)
    const tampered = new Request(req.url, { method: 'PUT', body: SEALED.slice(0, -1) + (SEALED.endsWith('A') ? 'B' : 'A'), headers: req.headers })
    assert.equal((await handle(tampered, env)).status, 401)
  })

  it('refuses plaintext and malformed keys', async () => {
    const env: Env = { DB: fakeDb().db, SIGNING_KEY }
    assert.equal((await handle(signed('PUT', '{"age":22}'), env)).status, 422)
    assert.equal((await handle(new Request('https://vault.test/v1/records/../../etc'), env)).status, 404)
    assert.equal((await handle(new Request('https://vault.test/v1/records/NOT-HEX'), env)).status, 400)
  })

  it('purges expired records', async () => {
    const { db, records } = fakeDb()
    const env: Env = { DB: db, SIGNING_KEY, RECORD_TTL_DAYS: '1' }
    await handle(signed('PUT', SEALED), env)
    await purge(env, Date.now() + 2 * 86_400_000)
    assert.equal(records.size, 0)
  })
})
