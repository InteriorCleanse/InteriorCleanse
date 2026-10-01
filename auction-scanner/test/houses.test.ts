/** The browser's list of houses must match the server's directory, and the importer must recognise each house's site. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AUCTION_HOUSES } from '../src/sources/directory.ts'
import { houseFromUrl } from '../src/sources/importer.ts'
import { feeScheduleFor } from '../src/fees.ts'
import { policyFor } from '../src/knowledge/policies.ts'

test('web/js/houses.js lists exactly the directory, in order, with the same names', () => {
  const web = readFileSync(new URL('../web/js/houses.js', import.meta.url), 'utf8')
  const rows = [...web.matchAll(/\["([a-z0-9]+)", "([^"]+)"\]/g)].map((m) => [m[1], m[2]])
  assert.deepEqual(rows, AUCTION_HOUSES.map((h) => [h.id, h.name]))
})

test('every house has a fee schedule, a policy card and an https link; its own site is recognised on import', () => {
  for (const h of AUCTION_HOUSES) {
    assert.ok(feeScheduleFor(h.id), `${h.id}: fee schedule`)
    assert.ok(policyFor(h.id), `${h.id}: policy card`)
    assert.match(h.url, /^https:\/\//, h.id)
    assert.match(h.searchUrl('Porsche 911'), /^https:\/\//, h.id)
  }
  const sites: Array<[string, string]> = [['https://www.pcarmarket.com/auction/x', 'pcarmarket'], ['https://collectingcars.com/for-sale/x', 'collectingcars'], ['https://www.hagerty.com/marketplace/auction/x', 'hagerty'], ['https://live.dupontregistry.com/x', 'dupont'], ['https://municibid.com/listing/x', 'municibid'], ['https://hibid.com/lot/x', 'hibid'], ['https://www.cwsmarketing.com/x', 'treasury']]
  for (const [url, id] of sites) assert.equal(houseFromUrl(url), id, url)
})
