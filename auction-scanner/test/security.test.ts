/** The door and the hardening, on their own. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { safeEqual, newNonce, contentSecurityPolicy, withNonce, securityHeaders } from '../src/security/harden.ts'
import { Throttle } from '../src/security/throttle.ts'
import { Sessions, cookieHeader, clearCookieHeader, parseCookies } from '../src/security/session.ts'
import { MemberGate, newAccessCode, verifyStripeSignature, handleStripeEvent } from '../src/security/members.ts'

test('safeEqual compares secrets of any length without throwing', () => {
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abc', 'abd'), false)
  assert.equal(safeEqual('abc', 'abcd'), false)
  assert.equal(safeEqual(undefined, 'abc'), false)
  assert.equal(safeEqual(123 as unknown, '123'), false)
})

test('the CSP has no unsafe-inline for scripts, a fresh nonce, and allows Google Fonts', () => {
  const n = newNonce()
  const csp = contentSecurityPolicy(n)
  assert.ok(csp.includes(`'nonce-${n}'`))
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp))
  assert.ok(/style-src[^;]*fonts\.googleapis\.com/.test(csp))
  assert.ok(/font-src[^;]*fonts\.gstatic\.com/.test(csp))
  assert.ok(/frame-ancestors 'none'/.test(csp))
  assert.notEqual(n, newNonce())
  const h = securityHeaders(n)
  assert.equal(h['x-frame-options'], 'DENY')
  assert.equal(h['x-content-type-options'], 'nosniff')
})

test('withNonce stamps every script tag and replaces a stale nonce', () => {
  const html = '<script type="module" src="/js/app.js"></script><script nonce="old">x</script><script-loader>'
  const out = withNonce(html, 'NEW')
  assert.equal((out.match(/nonce="NEW"/g) || []).length, 2)
  assert.ok(!out.includes('old'))
  assert.ok(out.includes('<script-loader>'))
})

test('the throttle locks a client after repeated failures and frees it later', () => {
  let t = 0
  const th = new Throttle(3, 1000, () => t)
  for (let i = 0; i < 3; i++) th.failed('a')
  assert.equal(th.allowed('a').ok, false)
  assert.equal(th.allowed('b').ok, true)
  t = 1001
  assert.equal(th.allowed('a').ok, true)
  th.failed('a'); th.succeeded('a')
  assert.equal(th.failuresFor('a'), 0)
})

test('sessions: round-trip, tamper, expiry, revoke, cookies', () => {
  let now = 1_000_000
  const s = new Sessions(Buffer.alloc(32, 1), 10_000, () => now)
  const { token, session } = s.issue({ email: 'A@B.co', role: 'member' })
  assert.equal(session.email, 'a@b.co')
  assert.equal(s.read(`x=1; gavel_session=${token}`)?.role, 'member')
  assert.equal(s.read(`gavel_session=${token}x`), null)
  assert.equal(new Sessions(Buffer.alloc(32, 2), 10_000, () => now).read(`gavel_session=${token}`), null, 'another secret')
  now += 10_001
  assert.equal(s.read(`gavel_session=${token}`), null, 'expired')
  now -= 10_001
  s.revoke(token)
  assert.equal(s.read(`gavel_session=${token}`), null, 'revoked')
  assert.match(cookieHeader('tok', true), /HttpOnly.*SameSite=Strict.*Secure|Secure.*HttpOnly/s)
  assert.ok(!cookieHeader('tok', false).includes('Secure'))
  assert.match(clearCookieHeader(), /Max-Age=0|Expires=/)
  assert.deepEqual(parseCookies('a=1; b=2'), { a: '1', b: '2' })
  assert.throws(() => new Sessions(Buffer.alloc(4), 1000), /32 bytes|secret/i)
})

test('access codes look right and the gate accepts env codes, member codes, the PIN, and nothing else', () => {
  const code = newAccessCode()
  assert.match(code, /^GVL-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  let now = 5_000_000
  const gate = new MemberGate({ pin: '123456', envCodes: ['SHARED-CODE-1'], throttle: new Throttle(3, 60_000, () => now), now: () => now })
  assert.equal(gate.loginOwner('c1', '123456').ok, true)
  assert.equal(gate.loginOwner('c1', '000000').ok, false)
  assert.equal(gate.loginMember('c2', 'x@y.co', 'SHARED-CODE-1').ok, true)
  assert.equal(gate.loginMember('c2', 'x@y.co', 'shared-code-1').ok, false, 'owner-chosen shared codes compare exactly')
  const made = gate.createMember('New@Member.com')
  assert.equal(gate.loginMember('c3', 'new@member.com', made.code).ok, true)
  assert.equal(gate.loginMember('c3', 'new@member.com', made.code.toLowerCase().replace(/-/g, ' ')).ok, true, 'issued codes forgive case, spaces and dashes')
  assert.equal(gate.loginMember('c3', 'other@member.com', made.code).ok, false, 'the code is bound to the email')
  assert.equal(gate.listMembers()[0].codeLast4, made.code.slice(-4))
  gate.deactivate('new@member.com')
  assert.equal(gate.loginMember('c3', 'new@member.com', made.code).ok, false, 'deactivated')
  gate.activate('new@member.com')
  assert.equal(gate.loginMember('c3', 'new@member.com', made.code).ok, true)
  for (let i = 0; i < 3; i++) gate.loginMember('c4', 'a@b.co', 'wrong')
  const locked = gate.loginMember('c4', 'a@b.co', made.code)
  assert.equal(locked.ok, false)
  assert.equal((locked as { status: number }).status, 429)
  assert.equal(gate.removeMember('new@member.com'), true)
  assert.equal(gate.removeMember('new@member.com'), false)
})

test('Stripe: signatures verify per the scheme; events create, deactivate and dedupe', () => {
  const secret = 'whsec_TESTFIXTURE'
  const body = '{"x":1}'
  const now = 1_700_000_000_000
  const t = Math.floor(now / 1000)
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, now), true)
  assert.equal(verifyStripeSignature(body, `t=${t},v1=deadbeef,v1=${sig}`, secret, now), true, 'any v1 may match')
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, 'other', now), false)
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, now + 400_000), false, 'stale')
  assert.equal(verifyStripeSignature(body, undefined, secret, now), false)
  assert.equal(verifyStripeSignature(body, 'garbage', secret, now), false)

  const gate = new MemberGate({ pin: '1', envCodes: [] })
  const seen = new Set<string>()
  const created = handleStripeEvent(gate, { id: 'e1', type: 'checkout.session.completed', data: { object: { customer_details: { email: 'S@x.co' }, customer: 'cus_1', subscription: 'sub_1' } } }, seen)
  assert.equal(created.handled, true)
  assert.equal(created.email, 's@x.co')
  assert.ok(created.code)
  assert.equal(gate.getMember('s@x.co')?.active, true)
  assert.equal(handleStripeEvent(gate, { id: 'e1', type: 'checkout.session.completed', data: { object: {} } }, seen).handled, false, 'idempotent')
  const off = handleStripeEvent(gate, { id: 'e2', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'past_due' } } }, seen)
  assert.equal(off.handled, true)
  assert.equal(gate.getMember('s@x.co')?.active, false)
  const on = handleStripeEvent(gate, { id: 'e3', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active' } } }, seen)
  assert.equal(on.handled, true)
  assert.equal(gate.getMember('s@x.co')?.active, true)
  const gone = handleStripeEvent(gate, { id: 'e4', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1' } } }, seen)
  assert.equal(gone.handled, true)
  assert.equal(gate.getMember('s@x.co')?.active, false)
  assert.equal(handleStripeEvent(gate, { id: 'e5', type: 'invoice.paid', data: { object: {} } }, seen).handled, false)
})
