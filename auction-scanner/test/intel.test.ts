/** Car intel parsers on TEST FIXTURE responses shaped like the public APIs, and the offline path. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { carIntel, intelSummary, parseComplaints, parseMpg, parseRecalls, parseSafety } from '../src/research/intel.ts'

const RECALLS = { Count: 2, results: [{ NHTSACampaignNumber: '19V001000', Component: 'FUEL SYSTEM', Summary: 'TEST FIXTURE fuel pump may fail.', Remedy: 'Dealers will replace the pump.', ReportReceivedDate: '01/02/2019' }, { NHTSACampaignNumber: '20V002000', Component: 'AIR BAGS', Summary: 'TEST FIXTURE inflator.' }] }
const COMPLAINTS = { count: 3, results: [{ components: 'ENGINE', summary: 'TEST FIXTURE stalls at idle.', crash: 'No', fire: 'No' }, { components: 'ENGINE,FUEL SYSTEM', summary: 'TEST FIXTURE hesitation.', crash: false, fire: false }, { components: 'ELECTRICAL SYSTEM', summary: 'TEST FIXTURE battery drain.', crash: 'Yes', fire: 'No' }] }
const SAFETY_LIST = { Results: [{ VehicleDescription: '2019 Toyota Camry 4 DR FWD', VehicleId: 12345 }] }
const SAFETY = { Results: [{ OverallRating: '5', OverallFrontCrashRating: '5', OverallSideCrashRating: '5', RolloverRating: '4', VehicleDescription: '2019 Toyota Camry 4 DR FWD' }] }
const MENU = { menuItem: [{ text: 'Auto (S8), 4 cyl, 2.5 L', value: '41234' }] }
const VEHICLE = { city08: 29, highway08: 41, comb08: 34, fuelType: 'Regular' }

test('parsers read the documented shapes', () => {
  const r = parseRecalls(RECALLS)
  assert.equal(r.length, 2)
  assert.equal(r[0].campaign, '19V001000')
  const c = parseComplaints(COMPLAINTS)
  assert.equal(c.count, 3)
  assert.equal(c.topComponents[0].component, 'ENGINE')
  assert.equal(c.topComponents[0].count, 2)
  assert.equal(c.crashes, 1)
  assert.equal(c.sample.length, 3)
  const s = parseSafety(SAFETY)
  assert.equal(s.overall, 5)
  assert.equal(s.rollover, 4)
  const m = parseMpg(VEHICLE)
  assert.equal(m.combined, 34)
  assert.equal(parseSafety({ Results: [] }).overall, undefined)
})

test('carIntel assembles everything through an injected fetch and summarises it', async () => {
  const fake: typeof fetch = async (input) => {
    const u = String(input)
    const body = u.includes('/recalls/') ? RECALLS : u.includes('/complaints/') ? COMPLAINTS : u.includes('/SafetyRatings/VehicleId/') ? SAFETY : u.includes('/SafetyRatings/') ? SAFETY_LIST : u.includes('/menu/options') ? MENU : VEHICLE
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const i = await carIntel(2019, 'Toyota', 'Camry SE', fake, 1_000)
  assert.equal(i.model, 'Camry')
  assert.equal(i.recalls?.length, 2)
  assert.equal(i.complaints?.count, 3)
  assert.equal(i.safety?.overall, 5)
  assert.equal(i.mpg?.combined, 34)
  assert.equal(i.notes.length, 0)
  const lines = intelSummary(i)
  assert.ok(lines.some((l) => /2 recalls/.test(l)))
  assert.ok(lines.some((l) => /5 of 5 stars/.test(l)))
  assert.ok(lines.some((l) => /34 mpg/.test(l)))
})

test('when the services are down every piece is null with a plain note, and nothing throws', async () => {
  const down: typeof fetch = async () => { throw new Error('TEST FIXTURE: offline') }
  const i = await carIntel(2015, 'Honda', 'Civic', down, 2_000)
  assert.equal(i.recalls, null)
  assert.equal(i.complaints, null)
  assert.equal(i.safety, null)
  assert.equal(i.mpg, null)
  assert.equal(i.notes.length, 4)
  assert.deepEqual(intelSummary(i), [])
})
