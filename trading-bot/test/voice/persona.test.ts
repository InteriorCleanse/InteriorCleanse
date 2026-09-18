/**
 * THE VOICE — warm is allowed, overselling is not.
 *
 * Giving a trading system a relaxed, friendly voice is the easiest way to make
 * it dishonest by accident. "Chill" slides into "it's fine", "no rush" slides
 * into "nothing to worry about", and a person reads reassurance into a screen
 * that was only ever describing an empty market.
 *
 * So the voice may change HOW something is said and never WHAT is said. These
 * tests hold that line: a banned vocabulary that fails on hype, a check that
 * warnings survive the friendly rewrite intact, and a determinism check so the
 * desk does not reword itself on every poll.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../helpers.ts'
import { floorLine, trustLine, evidenceLine, agentLine, spokenDesk, AGENT_NAMES, SPEECH } from '../../src/voice/persona.ts'
import type { FloorFacts } from '../../src/voice/persona.ts'

const base: FloorFacts = {
  verdict: 'LONG WATCH', verdictDetail: 'a long lean at 9/100, not enough to act yet.',
  trust: 70, blind: ['BOOK'], evidence: 'INSUFFICIENT SAMPLE',
  gatesMet: 0, gatesTotal: 9, paperTrades: 0, symbol: 'BTCUSDT',
}

/**
 * Words that promise, predict or reassure. A trading system may not use any of
 * them about its own prospects, no matter how friendly the voice is.
 */
const BANNED = [
  'guaranteed', 'guarantee', 'sure thing', 'can\'t lose', 'cannot lose', 'easy money',
  'to the moon', 'moon', 'rocket', 'pump', 'gonna win', 'will win', 'will profit',
  'risk-free', 'riskless', 'no risk', 'trust me', 'don\'t worry', 'nothing to worry',
  'always works', 'never fails', 'proven edge', 'printing', 'free money',
]

function everyLine(): string[] {
  const cases: FloorFacts[] = [
    base,
    { ...base, verdict: 'LONG', verdictDetail: 'LONG cleared the whole veto chain at size 0.25.', trust: 100, blind: [] },
    { ...base, verdict: 'SHORT', verdictDetail: 'SHORT cleared the whole veto chain at size 0.1.' },
    { ...base, verdict: 'VETOED', verdictDetail: 'The kill switch is on.' },
    { ...base, verdict: 'LONG (UNCHECKED)' },
    { ...base, verdict: 'NO TRADE', verdictDetail: 'Nothing is proposed.' },
    { ...base, evidence: 'GATES MET', gatesMet: 9, paperTrades: 40, trust: 100, blind: [] },
    { ...base, trust: 20, blind: ['BOOK', 'REGIME'] },
  ]
  const out: string[] = []
  for (const c of cases) {
    out.push(floorLine(c), trustLine(c.trust, c.blind), evidenceLine(c), spokenDesk(c))
  }
  for (const id of Object.keys(AGENT_NAMES)) {
    for (const status of ['LIVE', 'PARTIAL', 'BLIND', 'WAITING'] as const) {
      out.push(agentLine({ id, status, headline: '—', waitingOn: status === 'LIVE' ? null : 'a trusted stream' }))
    }
  }
  return out
}

test('the voice never promises, predicts or reassures — in any state', () => {
  for (const line of everyLine()) {
    const lower = line.toLowerCase()
    for (const word of BANNED) {
      assert.equal(lower.includes(word), false, `the voice said "${word}" in: ${line}`)
    }
  }
})

test('a warning stays a warning after the friendly rewrite', () => {
  const vetoed = floorLine({ ...base, verdict: 'VETOED', verdictDetail: 'The kill switch is on.' })
  assert.match(vetoed, /kill switch/i, 'the reason a trade was refused must survive verbatim')
  assert.equal(/fine|no problem|all good/i.test(vetoed), false, 'a veto must not be softened into reassurance')
})

test('with no paper trades it says so plainly rather than sounding encouraging', () => {
  const line = evidenceLine({ evidence: 'INSUFFICIENT SAMPLE', gatesMet: 0, gatesTotal: 9, paperTrades: 0 })
  assert.match(line, /no paper trades/i)
  assert.match(line, /nothing here that counts as evidence/i)
})

test('even GATES MET refuses to claim an edge or imply real money', () => {
  const line = evidenceLine({ evidence: 'GATES MET', gatesMet: 9, gatesTotal: 9, paperTrades: 40 })
  assert.match(line, /not proof of an edge/i)
  assert.match(line, /not real money/i)
})

test('the trust line says what trust is NOT, because the number invites misreading', () => {
  assert.match(trustLine(100, []), /not how sure I am about any trade/i)
})

test('a blind panel admits it rather than guessing', () => {
  const line = agentLine({ id: 'book', status: 'BLIND', headline: '—', waitingOn: 'a trusted trade/book stream' })
  assert.match(line, /can't see/i)
  assert.match(line, /not going to guess/i)
})

test('the same state always produces the same words', () => {
  for (let i = 0; i < 5; i++) {
    assert.equal(floorLine(base), floorLine(base), 'the desk must not reword itself between polls')
    assert.equal(agentLine({ id: 'tape', status: 'LIVE', headline: 'x', waitingOn: null }), agentLine({ id: 'tape', status: 'LIVE', headline: 'x', waitingOn: null }))
  }
})

test('every agent has a plain-English name and one-line explanation', () => {
  for (const id of ['book', 'tape', 'signal', 'risk', 'regime', 'proof']) {
    const n = AGENT_NAMES[id]
    assert.ok(n, `no friendly name for ${id}`)
    assert.ok(n.title.length > 2 && n.title === n.title.trim())
    assert.ok(n.plain.length > 10, `${id} needs an explanation a beginner can read`)
    assert.equal(/[A-Z]{3,}/.test(n.title), false, `${id} title "${n.title}" is shouting — this desk is meant to read as English`)
  }
})

test('he speaks slower than default, which is the whole point of the voice', () => {
  assert.ok(SPEECH.rate < 1, `rate ${SPEECH.rate} is not unhurried`)
  assert.ok(SPEECH.rate > 0.6, `rate ${SPEECH.rate} would be comically slow`)
  assert.ok(SPEECH.languages.includes('en-AU'), 'the relaxed voice preference should lead with en-AU')
})

/**
 * ONE VOICE, DEFINED ONCE.
 *
 * The browser cannot import a TypeScript module, so the speech rate and pitch
 * are necessarily written twice: here in `SPEECH`, and again in the inline
 * script in `web/index.html`. That is exactly the shape of defect this session
 * has been finding all week — two copies of one concept, agreeing today,
 * drifting silently later. So the second copy is pinned to the first.
 */
test('the browser speech settings match the persona, so he has one voice', () => {
  const html = readFileSync(join(ROOT, 'web', 'index.html'), 'utf8')
  const rate = Number((html.match(/SPEECH_RATE\s*=\s*([\d.]+)/) || [])[1])
  const pitch = Number((html.match(/SPEECH_PITCH\s*=\s*([\d.]+)/) || [])[1])
  assert.equal(rate, SPEECH.rate, `web/index.html speaks at ${rate}, the persona says ${SPEECH.rate}`)
  assert.equal(pitch, SPEECH.pitch, `web/index.html is pitched ${pitch}, the persona says ${SPEECH.pitch}`)
  // And the relaxed accent preference has to survive in the browser too.
  assert.match(html, /'en-AU'/, 'the browser voice picker no longer prefers the relaxed accent first')
})
