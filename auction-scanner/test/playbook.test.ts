/** The playbook: every guide is complete, honest, and free of hype. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GUIDES, guideById } from '../src/playbook/content.ts'

const BANNED = /guaranteed|risk[- ]free|proven profit|get rich|can't lose|cannot lose|sure thing profit/i

test('every guide has an id, a tagline, sections and a checklist', () => {
  assert.ok(GUIDES.length >= 7)
  for (const g of GUIDES) {
    assert.ok(g.id && g.title && g.tagline, g.id)
    assert.ok(['start', 'next', 'later'].includes(g.level))
    assert.ok(g.minutes > 0)
    assert.ok(g.sections.length >= 4, `${g.id} has ${g.sections.length} sections`)
    assert.ok(g.checklist.length >= 5 && g.checklist.length <= 12, `${g.id} checklist ${g.checklist.length}`)
    for (const s of g.sections) assert.ok(s.body || (s.steps && s.steps.length), `${g.id}/${s.title} is empty`)
  }
})

test('guide ids are unique and findable', () => {
  const ids = GUIDES.map((g) => g.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(guideById('first-car')?.level, 'start')
  assert.equal(guideById('nope'), undefined)
})

test('no banned promise words anywhere in the playbook', () => {
  const text = JSON.stringify(GUIDES)
  const hit = BANNED.exec(text)
  assert.equal(hit, null, hit ? `found "${hit[0]}"` : '')
})

test('the legal and safety weight is carried by warnings', () => {
  const warnings = GUIDES.flatMap((g) => g.sections.map((s) => s.warning ?? '')).join(' ').toLowerCase()
  for (const must of ['title', 'airbag', 'jack stands', 'insurance', 'wire']) assert.ok(warnings.includes(must), `no warning mentions ${must}`)
})

test('the guides never state a single national per-year sale limit', () => {
  const licence = guideById('dealer-licence')!
  const text = JSON.stringify(licence)
  assert.ok(/varies by state/i.test(text))
  assert.ok(!/\b(?:sell|selling) (?:up to )?\d+ cars? (?:a|per) year\b/i.test(text))
})

test('the supercar guide puts the inspection and the insurance first, with no prices it cannot know', () => {
  const g = guideById('supercar')!
  assert.ok(g)
  const text = JSON.stringify(g)
  assert.match(text, /specialist in the make/i)
  assert.match(text, /insurance/i)
  assert.ok(g.sections.some((s) => /No inspection, no bid/.test(s.warning ?? '')))
  assert.ok(!/\$\d/.test(text), 'no dollar figures: they vary by car and shop')
})
