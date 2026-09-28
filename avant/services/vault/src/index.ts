/**
 * AVANT privacy vault.
 *
 *   GET    /health
 *   GET    /v1/records/:key     → sealed record, or 404
 *   PUT    /v1/records/:key     ← sealed record (text/plain, ≤ 8 KB)
 *   DELETE /v1/records/:key
 *
 * Every /v1 call must be signed (see src/auth.ts). The vault refuses
 * anything that is not already sealed, so plaintext can never land here by
 * mistake. A daily cron deletes expired records and old audit rows.
 */

import { decodeSecret, verifyRequest } from './auth.ts'

export interface Env {
  DB: D1Like
  SIGNING_KEY: string
  RECORD_TTL_DAYS?: string
  AUDIT_TTL_DAYS?: string
}

/** The subset of D1 this service uses, so tests can supply a fake. */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>
      run(): Promise<unknown>
    }
  }
}

const KEY_RE = /^[0-9a-f]{48}$/
const SEALED_RE = /^v1\.[A-Za-z0-9_-]{8}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{16,}$/
const MAX_BODY = 8 * 1024
const DAY = 86_400_000

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })

async function audit(env: Env, action: string, key: string, status: number) {
  try {
    await env.DB.prepare('INSERT INTO audit (at, action, key_prefix, status) VALUES (?, ?, ?, ?)').bind(Date.now(), action, key.slice(0, 8), status).run()
  } catch {
    /* auditing must never break the request */
  }
}

export async function handle(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const url = new URL(req.url)
  if (url.pathname === '/health') return json(200, { ok: true })

  const m = url.pathname.match(/^\/v1\/records\/([^/]+)$/)
  if (!m) return json(404, { error: 'not found' })
  const key = decodeURIComponent(m[1])
  if (!KEY_RE.test(key)) return json(400, { error: 'bad key' })
  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) return json(405, { error: 'method not allowed' })

  const body = req.method === 'PUT' ? await req.text() : ''
  if (body.length > MAX_BODY) return json(413, { error: 'too large' })

  const ok = await verifyRequest(
    req.method,
    url.pathname,
    req.headers.get('x-avant-ts'),
    req.headers.get('x-avant-sig'),
    body,
    decodeSecret(env.SIGNING_KEY ?? ''),
    Math.floor(now / 1000),
  )
  if (!ok) {
    await audit(env, `${req.method}:denied`, key, 401)
    return json(401, { error: 'unsigned or expired request' })
  }

  if (req.method === 'GET') {
    const row = await env.DB.prepare('SELECT sealed FROM records WHERE key = ? AND expires_at > ?').bind(key, now).first<{ sealed: string }>()
    await audit(env, 'GET', key, row ? 200 : 404)
    return row ? new Response(row.sealed, { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } }) : json(404, { error: 'none' })
  }

  if (req.method === 'PUT') {
    if (!SEALED_RE.test(body)) {
      await audit(env, 'PUT:rejected', key, 422)
      return json(422, { error: 'the vault only accepts sealed records' })
    }
    const ttl = Number(env.RECORD_TTL_DAYS ?? '365') * DAY
    await env.DB.prepare(
      'INSERT INTO records (key, sealed, updated_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET sealed = excluded.sealed, updated_at = excluded.updated_at, expires_at = excluded.expires_at',
    )
      .bind(key, body, now, now + ttl)
      .run()
    await audit(env, 'PUT', key, 204)
    return new Response(null, { status: 204 })
  }

  await env.DB.prepare('DELETE FROM records WHERE key = ?').bind(key).run()
  await audit(env, 'DELETE', key, 204)
  return new Response(null, { status: 204 })
}

export async function purge(env: Env, now = Date.now()) {
  await env.DB.prepare('DELETE FROM records WHERE expires_at <= ?').bind(now).run()
  await env.DB.prepare('DELETE FROM audit WHERE at <= ?').bind(now - Number(env.AUDIT_TTL_DAYS ?? '400') * DAY).run()
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
  scheduled: (_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) => ctx.waitUntil(purge(env)),
}
