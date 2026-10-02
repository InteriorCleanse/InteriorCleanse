/**
 * DNS rebinding and proxy trust: the Host allowlist and the forwarding-header
 * check in src/security/origin.ts. Host names here are TEST FIXTURES.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hostname } from 'node:os'
import { allowedHosts, forwardedBy, hostAllowed, hostOf } from '../../src/security/origin.ts'

test('origin: only this computer\'s own names pass; a rebinding domain, a missing Host and junk do not', () => {
  const hosts = allowedHosts({ allowPhone: false })
  for (const ok of ['127.0.0.1:4173', 'localhost:4173', 'LOCALHOST', '[::1]:4173', 'localhost.:4173']) assert.equal(hostAllowed(ok, hosts), true, ok)
  for (const bad of ['attacker.example:4173', 'localhost.attacker.example', '127.0.0.1.nip.io', '', undefined, 'a b', '127.0.0.1@evil.example']) assert.equal(hostAllowed(bad, hosts), false, String(bad))
})

test('origin: network names join only with phone access on; MRCASH_ALLOWED_HOSTS adds names', () => {
  const me = hostname().toLowerCase()
  assert.equal(allowedHosts({ allowPhone: false }).has(me), me === 'localhost')
  assert.equal(allowedHosts({ allowPhone: true }).has(me), true)
  const extra = allowedHosts({ allowPhone: false, extra: ' kestrel.example.ts.net , Desk.Local:443,, ' })
  assert.equal(hostAllowed('kestrel.example.ts.net', extra), true)
  assert.equal(hostAllowed('desk.local:4173', extra), true)
  assert.equal(hostOf('[FE80::1]:80'), '[fe80::1]')
})

test('origin: any forwarding header means a proxy or tunnel sent it', () => {
  assert.equal(forwardedBy({ host: '127.0.0.1:4173', 'user-agent': 'x' }), false)
  for (const h of ['x-forwarded-for', 'forwarded', 'x-real-ip', 'cf-connecting-ip', 'x-forwarded-host', 'x-forwarded-proto', 'true-client-ip']) assert.equal(forwardedBy({ [h]: '203.0.113.9' }), true, h)
})
