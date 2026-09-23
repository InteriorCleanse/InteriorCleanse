import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkStateChange, PinThrottle } from '../src/guard.ts'

const TOKEN = 'abc123'
const HOST = '127.0.0.1:4173'

test('a same-origin request with the token is allowed', () => {
  const v = checkStateChange({ 'x-mrcash-csrf': TOKEN, 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1:4173' }, TOKEN, HOST)
  assert.equal(v.ok, true)
})

test('a request with no token is refused', () => {
  const v = checkStateChange({ 'sec-fetch-site': 'same-origin' }, TOKEN, HOST)
  assert.equal(v.ok, false)
  if (!v.ok) assert.equal(v.status, 403)
})

test('a request with the wrong token is refused', () => {
  const v = checkStateChange({ 'x-mrcash-csrf': 'nope' }, TOKEN, HOST)
  assert.equal(v.ok, false)
})

test('a cross-site browser request is refused even with the token', () => {
  const v = checkStateChange({ 'x-mrcash-csrf': TOKEN, 'sec-fetch-site': 'cross-site', origin: 'http://evil.test' }, TOKEN, HOST)
  assert.equal(v.ok, false)
})

test('an Origin from another host is refused when the browser sends no fetch metadata', () => {
  const v = checkStateChange({ 'x-mrcash-csrf': TOKEN, origin: 'http://evil.test' }, TOKEN, HOST)
  assert.equal(v.ok, false)
})

test('a Referer from another host is refused too', () => {
  const v = checkStateChange({ 'x-mrcash-csrf': TOKEN, referer: 'http://evil.test/page' }, TOKEN, HOST)
  assert.equal(v.ok, false)
})

test('a non-browser client with the token and no origin headers is allowed', () => {
  const v = checkStateChange({ 'x-mrcash-csrf': TOKEN }, TOKEN, HOST)
  assert.equal(v.ok, true)
})

test('an unreadable Origin is refused rather than ignored', () => {
  const v = checkStateChange({ 'x-mrcash-csrf': TOKEN, origin: 'not a url' }, TOKEN, HOST)
  assert.equal(v.ok, false)
})

test('the PIN throttle locks one client and leaves another alone', () => {
  let now = 1_000_000
  const t = new PinThrottle(3, 60_000, () => now)
  t.failed('a'); t.failed('a')
  assert.equal(t.allowed('a').ok, true, 'two failures do not lock')
  t.failed('a')
  assert.equal(t.allowed('a').ok, false, 'three failures lock')
  assert.equal(t.allowed('b').ok, true, 'another client is unaffected')
  now += 61_000
  assert.equal(t.allowed('a').ok, true, 'the lock expires')
  t.failed('b'); t.succeeded('b')
  t.failed('b'); t.failed('b')
  assert.equal(t.allowed('b').ok, true, 'a correct PIN resets the count')
})
