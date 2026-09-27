/** The knowledge base: complete, honest about numbers, searchable. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOUSE_POLICIES, REGULATIONS, GLOSSARY, searchKnowledge } from '../src/knowledge/index.ts'
import { AUCTION_HOUSES } from '../src/sources/directory.ts'

test('every auction house in the directory has a policy card', () => {
  for (const h of AUCTION_HOUSES) assert.ok(HOUSE_POLICIES.some((p) => p.houseId === h.id), h.id)
  for (const p of HOUSE_POLICIES) {
    assert.ok(p.checked && /^\d{4}-\d{2}$/.test(p.checked), p.houseId)
    assert.ok(p.fees.length >= 1 && p.gotchas.length >= 1 && p.registration.needs.length >= 1, p.houseId)
  }
})

test('sliding-scale houses never state a buyer-fee percent', () => {
  for (const id of ['copart', 'iaa', 'manheim', 'adesa']) {
    const p = HOUSE_POLICIES.find((x) => x.houseId === id)!
    const fee = p.fees.find((f) => /buyer fee|buy fee/i.test(f.name))!
    assert.match(fee.basis, /sliding/i, id)
    assert.doesNotMatch(fee.basis, /\d+%/, id)
  }
})

test('regulations: federal ones are dated and sourced; state ones say they vary', () => {
  assert.ok(REGULATIONS.length >= 10)
  for (const r of REGULATIONS) {
    assert.ok(r.summary.length > 80 && r.whatToDo.length >= 1, r.id)
    if (r.scope === 'federal') assert.ok(r.sources.length >= 1, `${r.id} needs a source`)
    if (r.scope === 'state') assert.equal(r.variesByState, true, r.id)
  }
  const odo = REGULATIONS.find((r) => r.id === 'odometer-disclosure')!
  assert.match(odo.summary, /20 model years|first 20/i)
  assert.match(odo.summary, /2011/)
  const limit = REGULATIONS.find((r) => r.id === 'sale-limit')!
  assert.doesNotMatch(limit.summary, /\b\d+ cars? (a|per) year\b/i, 'no single national number')
})

test('glossary terms are unique and plain', () => {
  const terms = GLOSSARY.map((g) => g.term.toLowerCase())
  assert.equal(new Set(terms).size, terms.length)
  assert.ok(GLOSSARY.length >= 40)
  for (const g of GLOSSARY) assert.ok(g.meaning.length > 20 && g.tags.length >= 1, g.term)
})

test('search finds the right things by plain words', () => {
  const snipe = searchKnowledge('does sniping work on bring a trailer')
  assert.ok(snipe.some((h) => h.kind === 'term' && /snip/i.test(h.title)))
  assert.ok(snipe.some((h) => h.kind === 'policy' && h.id === 'bat'))
  const odo = searchKnowledge('odometer 20 year rule')
  assert.equal(odo[0].kind === 'regulation' || odo[0].kind === 'term', true)
  assert.deepEqual(searchKnowledge(''), [])
  assert.ok(searchKnowledge('licence dealer').some((h) => h.kind === 'guide'))
})

test('no promise words in the knowledge base', () => {
  const text = JSON.stringify({ HOUSE_POLICIES, REGULATIONS, GLOSSARY })
  assert.equal(/guaranteed profit|risk[- ]free|proven profit|get rich/i.test(text), false)
})
