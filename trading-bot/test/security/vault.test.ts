/**
 * The vault: TOTP against the RFC 6238 test vectors, the passcode + code gate,
 * replay refusal, the throttle, sessions, and the server wiring. The secrets
 * here are TEST FIXTURES.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { base32Encode, base32Decode, totpAt, counterAt, verifyTotp, VaultGate, vaultCookie, generateSecret, otpauthUri } from '../../src/security/vault.ts'

const ROOT = join(import.meta.dirname, '..', '..')
// RFC 6238 Appendix B, SHA-1 key "12345678901234567890" (TEST FIXTURE). The RFC
// prints 8 digits; a 6-digit code is the last six of the same number.
const RFC_KEY = Buffer.from('12345678901234567890', 'ascii')

test('TOTP matches the RFC 6238 test vectors', () => {
  for (const [t, code] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']] as const) {
    assert.equal(totpAt(RFC_KEY, counterAt(t * 1000)), code, `T=${t}`)
  }
})

test('base32 round-trips and a generated secret is 160 bits', () => {
  assert.deepEqual(base32Decode(base32Encode(RFC_KEY)), RFC_KEY)
  assert.equal(base32Decode(generateSecret()).length, 20)
  assert.match(otpauthUri('ABCDEFGH'), /^otpauth:\/\/totp\/Mr\.%20Cash:vault\?secret=ABCDEFGH&issuer=Mr\.%20Cash&algorithm=SHA1&digits=6&period=30$/)
})

test('a code is accepted one step either side of now, and never twice', () => {
  const now = 1_790_000_000_000
  const c = counterAt(now)
  assert.equal(verifyTotp(RFC_KEY, totpAt(RFC_KEY, c - 1), now).ok, true)
  assert.equal(verifyTotp(RFC_KEY, totpAt(RFC_KEY, c + 1), now).ok, true)
  assert.equal(verifyTotp(RFC_KEY, totpAt(RFC_KEY, c + 3), now).ok, false, 'too far ahead')
  const first = verifyTotp(RFC_KEY, totpAt(RFC_KEY, c), now)
  assert.equal(first.ok, true)
  assert.equal(verifyTotp(RFC_KEY, totpAt(RFC_KEY, c), now, first.counter).ok, false, 'the same code must not open the vault twice')
  assert.equal(verifyTotp(RFC_KEY, '12345', now).ok, false)
  assert.equal(verifyTotp(RFC_KEY, 'abcdef', now).ok, false)
})

function gate(now: { t: number }, configured = true) {
  return new VaultGate({ now: () => now.t, config: () => (configured ? { passcode: 'correct horse', secret: RFC_KEY } : null) })
}

test('the vault needs BOTH the passcode and the code, and never says which was wrong', () => {
  const now = { t: 1_790_000_000_000 }
  const g = gate(now)
  const code = totpAt(RFC_KEY, counterAt(now.t))
  const wrongPass = g.unlock('a', 'wrong horse', code)
  const wrongCode = g.unlock('b', 'correct horse', '000000' === code ? '111111' : '000000')
  assert.equal(wrongPass.ok, false)
  assert.equal(wrongCode.ok, false)
  assert.equal((wrongPass as { reason: string }).reason, (wrongCode as { reason: string }).reason, 'the same message either way')
  const ok = g.unlock('c', 'correct horse', code)
  assert.equal(ok.ok, true)
  assert.equal(g.check((ok as { token: string }).token).open, true)
  assert.equal(g.unlock('c', 'correct horse', code).ok, false, 'a replayed code is refused')
})

test('not set up: the vault stays shut and says how to set it up', () => {
  const g = gate({ t: 1 }, false)
  const r = g.unlock('a', 'x', '123456')
  assert.equal(r.ok, false)
  assert.equal((r as { status: number }).status, 409)
  assert.match((r as { reason: string }).reason, /vault:setup/)
  assert.equal(g.check('anything').open, false)
})

test('five wrong attempts lock that device out; others are unaffected', () => {
  const now = { t: 1_790_000_000_000 }
  const g = gate(now)
  for (let i = 0; i < 5; i++) g.unlock('guesser', 'nope', '000000')
  const locked = g.unlock('guesser', 'correct horse', totpAt(RFC_KEY, counterAt(now.t)))
  assert.equal(locked.ok, false)
  assert.equal((locked as { status: number }).status, 429)
  assert.equal(g.unlock('owner', 'correct horse', totpAt(RFC_KEY, counterAt(now.t) + 1)).ok, true)
})

test('an open vault closes after 15 minutes idle, 60 in total, or on lock', () => {
  const now = { t: 1_790_000_000_000 }
  const g = gate(now)
  const r = g.unlock('a', 'correct horse', totpAt(RFC_KEY, counterAt(now.t))) as { token: string }
  now.t += 14 * 60_000; assert.equal(g.check(r.token).open, true, 'activity slides the idle timer')
  now.t += 14 * 60_000; assert.equal(g.check(r.token).open, true)
  now.t += 16 * 60_000; assert.equal(g.check(r.token).open, false, 'idle too long')
  const r2 = g.unlock('a', 'correct horse', totpAt(RFC_KEY, counterAt(now.t))) as { token: string }
  for (let i = 0; i < 5; i++) { now.t += 13 * 60_000; g.check(r2.token) }
  assert.equal(g.check(r2.token).open, false, 'never longer than an hour, however active')
  now.t += 60_000
  const r3 = g.unlock('a', 'correct horse', totpAt(RFC_KEY, counterAt(now.t))) as { token: string }
  g.lock(r3.token)
  assert.equal(g.check(r3.token).open, false)
  assert.equal(g.check('forged-token-that-was-never-issued').open, false)
})

test('the vault cookie is read strictly', () => {
  assert.equal(vaultCookie('a=1; mrcash_vault=abcdefghijklmnopqrstuvwxyz012345; b=2'), 'abcdefghijklmnopqrstuvwxyz012345')
  assert.equal(vaultCookie('mrcash_vault=short'), undefined)
  assert.equal(vaultCookie(undefined), undefined)
})

test('server wiring: HttpOnly strict cookie, balances gated, secrets never echoed or logged', () => {
  const server = readFileSync(join(ROOT, 'src', 'server.ts'), 'utf8')
  assert.match(server, /mrcash_vault=\$\{r\.token\}; Path=\$\{VAULT_COOKIE_PATH\}; HttpOnly; SameSite=Strict/)
  assert.match(server, /\(path === '\/api\/portfolio' \|\| path === '\/api\/portfolio\/kraken'\) && vaultGate\.configured\(\) && !vaultGate\.check/, 'real balances go through the vault once it is set up')
  assert.equal(/MRCASH_VAULT_(PASSCODE|TOTP)/.test(server), false, 'the server never reads or prints the secrets itself')
  const vault = readFileSync(join(ROOT, 'src', 'security', 'vault.ts'), 'utf8')
  assert.equal(/console\./.test(vault), false, 'the vault never logs')
  assert.equal(/\/api\/(order|paper\/close|kill|live)/.test(vault), false)
})
