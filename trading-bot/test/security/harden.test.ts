/**
 * SECURITY HARDENING.
 *
 * The audit that produced this found the server sending NO security headers at
 * all — no CSP, no nosniff, no frame protection — and comparing four different
 * secrets with `===`, which returns the moment two bytes differ.
 *
 * These tests pin both, and are written to fail loudly if a future change
 * quietly weakens them: a CSP that grows `'unsafe-inline'` on scripts, or a
 * secret compared with `===` again, is a regression that no feature test would
 * ever notice.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../helpers.ts'
import { safeEqual, newNonce, contentSecurityPolicy, securityHeaders, withNonce } from '../../src/security/harden.ts'

// ---------------------------------------------------------------
// Constant-time comparison
// ---------------------------------------------------------------

test('safeEqual matches identical secrets and rejects everything else', () => {
  assert.equal(safeEqual('hunter2', 'hunter2'), true)
  assert.equal(safeEqual('hunter2', 'hunter3'), false)
  assert.equal(safeEqual('hunter2', 'hunter2 '), false, 'trailing whitespace is a different secret')
  assert.equal(safeEqual('', ''), true)
})

test('safeEqual never throws on a length mismatch — that branch would leak the length', () => {
  // node:crypto's timingSafeEqual throws when the buffers differ in size, so a
  // naive wrapper leaks "your guess is the wrong length" through an exception.
  // Hashing first makes both sides 32 bytes, always.
  assert.equal(safeEqual('a', 'a-much-longer-secret-value'), false)
  assert.equal(safeEqual('a-much-longer-secret-value', 'a'), false)
})

test('safeEqual refuses non-strings instead of coercing them', () => {
  assert.equal(safeEqual(undefined, 'x'), false)
  assert.equal(safeEqual('x', null), false)
  assert.equal(safeEqual(undefined, undefined), false, 'two missing secrets are not a match')
})

test('no secret is compared with === any more', () => {
  // The four that were: the CSRF token, the webhook secret, the PIN, the session
  // cookie. A grep guard is crude, but it is the thing that catches the fifth.
  const server = readFileSync(join(ROOT, 'src', 'server.ts'), 'utf8')
  const guard = readFileSync(join(ROOT, 'src', 'guard.ts'), 'utf8')
  const offenders: string[] = []
  for (const [file, src] of [['server.ts', server], ['guard.ts', guard]] as const) {
    for (const line of src.split('\n')) {
      if (/^\s*(\/\/|\*)/.test(line)) continue
      if (/(===|!==)/.test(line) && /\b(PIN|WEBHOOK_SECRET|SESSION_TOKEN|CSRF_TOKEN|expectedToken)\b/.test(line)) {
        offenders.push(`${file}: ${line.trim()}`)
      }
    }
  }
  assert.deepEqual(offenders, [], `these compare a secret in non-constant time:\n${offenders.join('\n')}`)
})

// ---------------------------------------------------------------
// The nonce and the policy
// ---------------------------------------------------------------

test('every nonce is fresh and long enough to be unguessable', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 500; i++) seen.add(newNonce())
  assert.equal(seen.size, 500, 'a repeated nonce would let injected script run')
  assert.ok(newNonce().length >= 20, 'a short nonce can be brute-forced')
})

test('the script policy uses the nonce and NEVER unsafe-inline', () => {
  const csp = contentSecurityPolicy('TESTNONCE')
  const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src'))!
  assert.match(scriptSrc, /'nonce-TESTNONCE'/)
  assert.equal(scriptSrc.includes("'unsafe-inline'"), false, "script-src must never allow 'unsafe-inline' — that is the whole defence")
  assert.equal(scriptSrc.includes("'unsafe-eval'"), false, "script-src must never allow 'unsafe-eval'")
})

test('the policy closes the usual doors', () => {
  const csp = contentSecurityPolicy(newNonce())
  for (const directive of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "default-src 'self'"]) {
    assert.ok(csp.includes(directive), `the policy is missing: ${directive}`)
  }
})

test('the TradingView widget is allowlisted by origin, not by opening the door', () => {
  const csp = contentSecurityPolicy(newNonce())
  assert.match(csp, /script-src[^;]*https:\/\/s3\.tradingview\.com/)
  assert.match(csp, /frame-src[^;]*tradingview\.com/)
  assert.equal(/script-src[^;]*\*[^;]*;/.test(csp), false, 'script-src must not contain a bare wildcard')
})

test('the header set covers clickjacking, sniffing and referrer leaks', () => {
  const h = securityHeaders(newNonce())
  assert.equal(h['x-content-type-options'], 'nosniff')
  assert.equal(h['x-frame-options'], 'DENY')
  assert.equal(h['referrer-policy'], 'no-referrer')
  assert.equal(h['cross-origin-opener-policy'], 'same-origin')
  // Talking to him is a feature; the rest of the device is not on offer.
  assert.match(h['permissions-policy'], /microphone=\(self\)/)
  assert.match(h['permissions-policy'], /camera=\(\)/)
  assert.match(h['permissions-policy'], /geolocation=\(\)/)
})

// ---------------------------------------------------------------
// Getting the nonce onto the page
// ---------------------------------------------------------------

test('every script tag in the real page gets the nonce', () => {
  const html = readFileSync(join(ROOT, 'web', 'index.html'), 'utf8')
  const before = (html.match(/<script(?=[\s>])/g) ?? []).length
  assert.ok(before > 0, 'the page has no script tags — this test is checking nothing')
  const out = withNonce(html, 'ABC123')
  assert.equal((out.match(/<script nonce="ABC123"/g) ?? []).length, before, 'some script tag would be blocked by the policy')
  assert.equal(/<script(?![\s]*nonce)[\s>]/.test(out.replace(/<script nonce="ABC123"/g, '')), false)
})

test('the page still has no inline event handlers, which is what makes the nonce policy possible', () => {
  // onclick="…" attributes cannot carry a nonce. If one is ever added, the
  // choice is to remove it or to weaken the policy — and that should be a
  // deliberate decision, not a surprise in production.
  const html = readFileSync(join(ROOT, 'web', 'index.html'), 'utf8')
  const handlers = html.match(/<[^>]+\son[a-z]+\s*=\s*"/gi) ?? []
  assert.deepEqual(handlers, [], `inline handlers cannot run under this CSP: ${handlers.join(', ')}`)
})
