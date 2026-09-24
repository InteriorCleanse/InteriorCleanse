/**
 * The front door and the security audit. Secrets here are TEST FIXTURES: the
 * RFC 6238 key and made-up PINs.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LoginGate } from '../../src/security/login.ts'
import { totpAt, counterAt } from '../../src/security/vault.ts'
import { scanForSecrets, assess, summarise, type AuditState } from '../../src/security/audit.ts'

const ROOT = join(import.meta.dirname, '..', '..')
const KEY = Buffer.from('12345678901234567890', 'ascii')

test('login: with an authenticator set up, the PIN alone is not enough, and a failure never says which half', () => {
  const now = { t: 1_790_000_000_000 }
  const g = new LoginGate({ pin: '482913', secret: () => KEY, now: () => now.t })
  assert.equal(g.needsCode(), true)
  const code = totpAt(KEY, counterAt(now.t))
  const pinOnly = g.attempt('a', '482913', '')
  const wrongPin = g.attempt('b', '000000', code)
  assert.equal(pinOnly.ok, false)
  assert.equal(wrongPin.ok, false)
  assert.equal((pinOnly as { reason: string }).reason, (wrongPin as { reason: string }).reason)
  assert.equal(g.attempt('c', '482913', code).ok, true)
  assert.equal(g.attempt('d', '482913', code).ok, false, 'a code opens the door once')
})

test('login: without an authenticator it is the PIN, as before', () => {
  const g = new LoginGate({ pin: '482913', secret: () => null })
  assert.equal(g.needsCode(), false)
  assert.equal(g.attempt('a', ' 482913 ', undefined).ok, true)
  assert.equal(g.attempt('a', '482914', undefined).ok, false)
})

test('login: ten failures lock that device out; another device still gets in', () => {
  const now = { t: 1_790_000_000_000 }
  const g = new LoginGate({ pin: '482913', secret: () => KEY, now: () => now.t })
  for (let i = 0; i < 10; i++) g.attempt('guesser', '111111', '000000')
  const r = g.attempt('guesser', '482913', totpAt(KEY, counterAt(now.t)))
  assert.equal(r.ok, false)
  assert.equal((r as { status: number }).status, 429)
  assert.equal(g.attempt('owner', '482913', totpAt(KEY, counterAt(now.t) + 1)).ok, true)
})

test('server wiring: the made-up PIN is cryptographic, the login goes through the gate, the cookie stays HttpOnly', () => {
  const server = readFileSync(join(ROOT, 'src', 'server.ts'), 'utf8')
  assert.equal(/Math\.random/.test(server), false, 'no secret in the server may come from Math.random')
  assert.match(server, /String\(randomInt\(100000, 1000000\)\)/)
  assert.match(server, /loginGate\.attempt\(client, form\.get\('pin'\), form\.get\('code'\)\)/)
  assert.match(server, /mrcash=\$\{SESSION_TOKEN\}; Path=\/; HttpOnly; SameSite=Lax/)
  const login = readFileSync(join(ROOT, 'src', 'security', 'login.ts'), 'utf8')
  assert.equal(/console\./.test(login), false, 'the front door never logs')
})

test('the Docker build leaves secrets and records out', () => {
  const ignore = readFileSync(join(ROOT, '.dockerignore'), 'utf8')
  for (const line of ['.env', 'data', 'data-*']) assert.match(ignore, new RegExp(`^${line.replace(/[.*]/g, (c) => `\\${c}`)}$`, 'm'))
  assert.match(readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8'), /"127\.0\.0\.1:4173:4173"/)
})

test('audit: finds a key by its shape, names the line and never the value; ignores fixtures, examples and lockfiles', () => {
  // SYNTHETIC key-shaped strings, assembled at runtime so this file does not trip the scanner itself.
  const fakeAws = 'AKIA' + 'Q'.repeat(16)
  const fakeSecret = 'MRCASH_ALPACA_SECRET=' + 'z9'.repeat(10)
  const hits = scanForSecrets([
    { path: 'src/a.ts', text: `const k = '${fakeAws}'\n` },
    { path: '.env.sample', text: `${fakeSecret}\n# MRCASH_PIN=246810\n` },
    { path: 'docs/x.md', text: `for example ${fakeAws}\n` },
    { path: 'package-lock.json', text: `"integrity": "sha512-${'A'.repeat(86)}=="` },
    { path: 'test/t.ts', text: "'PKABCDEFGHIJKLMNOPQRSTUV'" },
  ])
  assert.deepEqual(hits.map((h) => `${h.path}:${h.line}:${h.kind}`), ['src/a.ts:1:AWS access key', '.env.sample:1:secret assigned in a file'])
  const report = JSON.stringify(assess({ ...BASE, secretHits: hits }))
  assert.equal(report.includes(fakeAws) || report.includes('z9z9'), false, 'the report never repeats a key')
})

const BASE: AuditState = {
  secretHits: [], scannedFiles: 10, env: { exists: true, tracked: false, ignored: true, mode: 0o600 }, dockerignoreCoversEnv: true,
  allowPhone: false, pinFrom: 'random', pinLength: 0, totpConfigured: true, vaultConfigured: true, login2faOff: false,
  liveTradingEnabled: false, runtimeDependencies: 0, nodeMajor: 22, brokerKeys: [], webhookSecretLength: 0, cookieSecure: false,
}

test('audit: a safe setup has no failures; each dangerous setting is called out', () => {
  assert.equal(summarise(assess(BASE)).fail, 0)
  const lv = (s: Partial<AuditState>) => assess({ ...BASE, ...s }).filter((f) => f.level === 'FAIL' || f.level === 'WARN').map((f) => f.title)
  assert.ok(lv({ env: { ...BASE.env, tracked: true } }).some((t) => /tracked by git/.test(t)))
  assert.ok(lv({ env: { ...BASE.env, mode: 0o644 } }).some((t) => /readable by other users/.test(t)))
  assert.ok(lv({ dockerignoreCoversEnv: false }).some((t) => /Docker/.test(t)))
  assert.ok(lv({ allowPhone: true, totpConfigured: false }).some((t) => /only the PIN/.test(t)))
  assert.ok(lv({ allowPhone: true, pinFrom: 'config', pinLength: 4 }).some((t) => /PIN is 4/.test(t)))
  assert.ok(lv({ liveTradingEnabled: true }).some((t) => /LIVE_TRADING_ENABLED/.test(t)))
  assert.ok(lv({ vaultConfigured: false, brokerKeys: ['Alpaca'] }).some((t) => /without the vault/.test(t)))
})
