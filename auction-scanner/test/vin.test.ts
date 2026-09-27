/**
 * Tests for src/vin.ts — parseVpic on TEST FIXTURE rows shaped like NHTSA
 * vPIC's DecodeVin answer, and decodeVin's refusals, which must happen before
 * any network call. Offline.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeVin, parseVpic, type VpicRow } from '../src/vin.ts'

const VIN = 'WP0AB2A99GS123456'

/** TEST FIXTURE — the shape vPIC returns. Not a real decode. */
const ROWS: VpicRow[] = [
  { Variable: 'Error Code', Value: '0' },
  { Variable: 'Error Text', Value: '0 - VIN decoded clean. Check Digit (9th position) is correct' },
  { Variable: 'Model Year', Value: '2016' },
  { Variable: 'Make', Value: 'PORSCHE' },
  { Variable: 'Model', Value: '911' },
  { Variable: 'Trim', Value: 'Carrera S' },
  { Variable: 'Body Class', Value: 'Coupe' },
  { Variable: 'Displacement (L)', Value: '3.0' },
  { Variable: 'Engine Number of Cylinders', Value: '6' },
  { Variable: 'Engine Model', Value: '' },
  { Variable: 'Fuel Type - Primary', Value: 'Gasoline' },
  { Variable: 'Drive Type', Value: 'RWD/Rear-Wheel Drive' },
  { Variable: 'Plant Country', Value: 'GERMANY' },
  { Variable: 'Series', Value: null },
  { Variable: 'Note', Value: 'Not Applicable' },
]

test('parseVpic reads the build sheet and leaves blanks undefined', () => {
  const d = parseVpic(VIN.toLowerCase(), ROWS)
  assert.equal(d.vin, VIN, 'VIN is upper-cased')
  assert.equal(d.year, 2016)
  assert.equal(d.make, 'Porsche', 'shouted makes are made readable')
  assert.equal(d.model, '911')
  assert.equal(d.trim, 'Carrera S')
  assert.equal(d.bodyClass, 'Coupe')
  assert.equal(d.engine, '3.0 L, 6 cylinders')
  assert.equal(d.fuel, 'Gasoline')
  assert.equal(d.drive, 'RWD/Rear-Wheel Drive')
  assert.equal(d.plantCountry, 'GERMANY', 'everything but the make is kept exactly as vPIC wrote it')
  assert.equal(d.errorText, undefined, 'error code 0 means clean')
})

test('parseVpic keeps initials as initials and reports vPIC errors', () => {
  const d = parseVpic(VIN, [
    { Variable: 'Make', Value: 'BMW' },
    { Variable: 'Model Year', Value: '' },
    { Variable: 'Error Code', Value: '1' },
    { Variable: 'Error Text', Value: '1 - Check Digit (9th position) does not calculate properly' },
  ])
  assert.equal(d.make, 'BMW')
  assert.equal(d.year, undefined)
  assert.match(d.errorText ?? '', /Check Digit/)

  const empty = parseVpic(VIN, [])
  assert.deepEqual(empty, { vin: VIN, year: undefined, make: undefined, model: undefined, trim: undefined, bodyClass: undefined, engine: undefined, fuel: undefined, drive: undefined, plantCountry: undefined, errorText: undefined })
})

test('decodeVin rejects a bad VIN and a SAMPLE VIN without calling fetch', async () => {
  let calls = 0
  const fake: typeof fetch = async () => {
    calls += 1
    throw new Error('must not be called')
  }
  await assert.rejects(decodeVin('NOT-A-VIN', fake), /17 letters and numbers/)
  await assert.rejects(decodeVin('WP0AB2A99GS12345I', fake), /I, O or Q/)
  await assert.rejects(decodeVin('', fake), /VIN/)
  await assert.rejects(decodeVin('SAMPLE00000000001', fake), /SAMPLE/)
  assert.equal(calls, 0)
})

test('decodeVin asks vPIC for JSON and parses the rows', async () => {
  const urls: string[] = []
  const fake: typeof fetch = async (input) => {
    urls.push(String(input))
    return new Response(JSON.stringify({ Count: ROWS.length, Message: 'Results returned successfully', Results: ROWS }), { status: 200 })
  }
  const d = await decodeVin(VIN, fake)
  assert.equal(urls.length, 1)
  assert.equal(urls[0], `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${VIN}?format=json`)
  assert.deepEqual(d, parseVpic(VIN, ROWS))
})

test('decodeVin explains an HTTP failure and an unreadable answer in plain English', async () => {
  const busy: typeof fetch = async () => new Response('busy', { status: 503 })
  await assert.rejects(decodeVin(VIN, busy), /HTTP 503/)
  const odd: typeof fetch = async () => new Response(JSON.stringify({ hello: 'world' }), { status: 200 })
  await assert.rejects(decodeVin(VIN, odd), /could not read/)
})
