/**
 * THE LEARNING LOOP — post-mortems on paper close, reassessment of what the
 * vault and the hypotheses believed, the living passport, and the boundary:
 * the learning layers never reach the engine, and the engine reaches them
 * through exactly one observer call it does not read the result of.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tempDataDir } from '../helpers.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'

const tmp = tempDataDir('mrcash-learn-')
process.env.MRCASH_DATA_DIR = tmp.dir
const obs = await import('../../src/learning/observer.ts')
const lp = await import('../../src/learning/passport.ts')
const vault = await import('../../src/knowledge/vault.ts')
const H = await import('../../src/research/hypotheses.ts')
const { config } = await import('../../config.ts')
after(() => tmp.cleanup())

const HERE = fileURLToPath(new URL('.', import.meta.url))
const SRC = join(HERE, '..', '..', 'src')
const T0 = Date.UTC(2026, 0, 13, 13, 30)

function pos(i: number, over: Partial<PaperPosition> = {}): PaperPosition {
  const openedAt = T0 + i * 3_600_000
  return {
    id: `pp${i}`, openedAt, dayKey: '2026-01-13', session: 'London', setupKey: `BTCUSDT|5m|silver-bullet|long`, direction: 'long',
    intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 0.01, riskUsd: 1, quality: 85, reason: 'test', atr: 0.5, status: 'closed',
    filledAt: openedAt + 300_000, strategyId: 'silver-bullet', regime: 'trending-up', closedAt: openedAt + 1_800_000, exit: 102, exitReason: 'target', rMultiple: 1.9, pnlUsd: 1.9, feesUsd: 0.01, outcome: 'win', candlesHeld: 5,
    snapshot: { signalId: `sig${i}`, symbol: 'BTCUSDT', interval: '5m', engineVersion: '2.3.0', featureVersion: 1, volatility: 'normal', fusedScore: 80, fusedAction: 'LONG', confirms: [], invalidates: [], contributors: [{ id: 'silver-bullet', action: 'BUY', confidence: 80 }], evidence: [], riskChecks: [], riskVetoedBy: null, newsMinutes: null, inBlackout: false },
    ...over,
  }
}

test('a post-mortem is observations with a list of what it cannot conclude; a loss on a full checklist is named as one observation', () => {
  const win = obs.observePaperClose(pos(0), T0 + 10)
  assert.equal(win.kind, 'win')
  assert.equal(win.evidenceLabel, 'OBSERVED')
  assert.deepEqual(win.provenance.recordIds, ['pp0'])
  assert.ok(win.cannotConclude.some((c) => /sample of one/.test(c)))
  assert.ok(win.observations.some((o) => /fused score was 80\/100/.test(o)))
  const item = vault.getItem(win.vaultItemId)!
  assert.equal(item.kind, 'lesson')
  assert.equal(item.provenance.sampleSize, 1)
  assert.ok(item.tags.includes('silver-bullet'))

  const loss = obs.observePaperClose(pos(1, { exit: 99, exitReason: 'stop', rMultiple: -1, pnlUsd: -1, outcome: 'loss' }), T0 + 11)
  assert.equal(loss.kind, 'loss-on-full-checklist')
  assert.ok(loss.observations.some((o) => /not evidence that a condition is missing/.test(o)))
  const weak = obs.observePaperClose(pos(2, { exit: 99, exitReason: 'stop', rMultiple: -1, outcome: 'loss', snapshot: undefined }), T0 + 12)
  assert.equal(weak.kind, 'loss')
  assert.ok(weak.observations.some((o) => /No decision-time snapshot/.test(o)))
  assert.ok(weak.observations.some((o) => /not computed until reconciliation/.test(o)), 'excursions are not estimated')
  const missed = obs.observePaperClose(pos(3, { status: 'closed', exitReason: 'missed', rMultiple: undefined, exit: undefined, outcome: undefined }), T0 + 13)
  assert.equal(missed.kind, 'missed')
})

test('observing the same close twice writes one item and counts the evidence once', () => {
  const item = vault.addItem({ kind: 'strategy-observation', title: 'Silver Bullet positive', body: 'Observed positive over 60 PAPER trades.', evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER', sampleSize: 60 }, payload: { direction: 'positive', filters: [{ dimension: 'strategyId', values: ['silver-bullet'] }] }, now: T0 })
  const first = obs.observePaperClose(pos(10, { exit: 99, exitReason: 'stop', rMultiple: -1, outcome: 'loss' }), T0 + 20)
  assert.ok(first.itemsTouched.includes(item.id))
  assert.equal(vault.getItem(item.id)!.contradictory_evidence_count, 1, 'a loss contradicts a positive observation')
  const again = obs.observePaperClose(pos(10, { exit: 99, exitReason: 'stop', rMultiple: -1, outcome: 'loss' }), T0 + 21)
  assert.deepEqual(again.itemsTouched, [])
  assert.equal(vault.getItem(item.id)!.contradictory_evidence_count, 1)
  assert.equal(vault.listItems({ kind: 'lesson' }).filter((i) => i.id === first.vaultItemId).length, 1)
  obs.observePaperClose(pos(11), T0 + 22)
  assert.equal(vault.getItem(item.id)!.new_evidence_count, 1, 'a win supports it')
  const other = obs.observePaperClose(pos(12, { strategyId: 'unicorn', setupKey: 'BTCUSDT|5m|unicorn|long' }), T0 + 23)
  assert.ok(!other.itemsTouched.includes(item.id), 'a trade outside the cohort is not evidence for it')
})

test('a PAPER hypothesis in the cohort is flagged UNDER REVIEW after ten new closes, with the tally in the reason', () => {
  const h = H.createHypothesis({ question: 'Silver bullet in London positive?', observation: 'x', hypothesis: 'positive', nullHypothesis: 'zero', direction: 'positive', dataset: { source: 'PAPER', label: 'PAPER' }, cohortFilters: [{ dimension: 'strategyId', values: ['silver-bullet'] }, { dimension: 'session', values: ['london'] }], method: 'm', strategy: 'silver-bullet', session: 'london', now: T0 })
  H.saveHypothesis(H.recordStage(h, 'inSample', { at: T0, source: 'PAPER', dataType: 'LIVE MARKET / SIMULATED EXECUTION', trades: 40, sampleStatus: 'EARLY SAMPLE', meanR: 0.5, ci95: { lo: 0.1, hi: 0.9 }, method: 'm', recordIds: [], note: 'n' }, T0))
  for (let i = 0; i < obs.HYPOTHESIS_REVIEW_AFTER - 1; i++) obs.observePaperClose(pos(100 + i, { rMultiple: i % 3 ? 1 : -1, outcome: i % 3 ? 'win' : 'loss' }), T0 + 100 + i)
  assert.equal(H.getHypothesis(h.id)!.status, 'OBSERVED IN SAMPLE')
  obs.observePaperClose(pos(200), T0 + 200)
  const flagged = H.getHypothesis(h.id)!
  assert.equal(flagged.status, 'UNDER REVIEW')
  assert.match(flagged.history[flagged.history.length - 1].detail, /10 new paper trade\(s\).*with the hypothesis.*against/)
  const asia = obs.observePaperClose(pos(201, { session: 'Asia' }), T0 + 201)
  assert.ok(!asia.hypothesesTouched.includes(h.id), 'an Asia trade is outside the London cohort')
})

test('reassessAll expires what was not reviewed and deletes nothing', () => {
  const old = vault.addItem({ kind: 'regime-observation', title: 'Old', body: 'x', evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER' }, now: T0 - 2 * vault.REVIEW.afterMs })
  const r = obs.reassessAll(T0)
  assert.ok(r.staleItems.includes(old.id))
  assert.equal(vault.getItem(old.id)!.status, 'STALE')
  assert.match(r.note, /Nothing was deleted/)
})

test('the living passport says NOT ENOUGH DATA under the bar and assembles the record above it, with nothing stored', () => {
  const none = lp.livingPassport('unicorn', [], { now: T0 })
  assert.equal(none.meta!.id, 'unicorn')
  assert.ok('status' in none.paper && none.paper.status === 'NOT ENOUGH DATA')
  assert.ok(none.wouldChange.some((w) => /more closed paper trade/.test(w)))
  assert.ok(none.concepts.some((c) => c.id === 'order-block'))
  assert.equal(none.oosReference, null)
  const closed = Array.from({ length: 12 }, (_, i) => pos(300 + i, { rMultiple: i % 4 === 0 ? -1 : 1.5, outcome: i % 4 === 0 ? 'loss' : 'win' }))
  const some = lp.livingPassport('silver-bullet', closed, { now: T0 })
  assert.ok('cohort' in some.paper)
  if ('cohort' in some.paper) {
    assert.equal(some.paper.cohort.stats.n, 12)
    assert.equal(some.paper.growth.band, '10–49')
    assert.equal(some.paper.provenance.source, 'PAPER')
    assert.ok(['NOT ESTABLISHED', 'OBSERVED POSITIVE', 'OBSERVED NEGATIVE'].includes(some.paper.thesis.status))
  }
  assert.ok(some.hypotheses.length >= 1)
  assert.ok(some.postMortems.length >= 1)
  assert.ok(some.notes.some((n) => /The engine reads none of this/.test(n)))
  assert.equal(lp.livingPassport('nope', [], { now: T0 }).meta, null)
})

// ---------------------------------------------------------------
// The boundary
// ---------------------------------------------------------------

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

const LEARNING_DIRS = ['school', 'research', 'knowledge', 'learning']

test('BOUNDARY — no engine module imports the school, research, knowledge or learning layers, except the watch loop\'s single observer call', () => {
  const offenders: string[] = []
  const layerImport = new RegExp(`from '(?:\\.\\.?/)+(?:${LEARNING_DIRS.join('|')})/`)
  for (const file of walk(SRC)) {
    const rel = file.replace(SRC, 'src')
    if (LEARNING_DIRS.some((d) => rel.startsWith(`src/${d}/`))) continue
    if (rel === 'src/server.ts' || rel.startsWith('src/analyst/')) continue
    const body = readFileSync(file, 'utf8')
    if (!layerImport.test(body)) continue
    if (rel === 'src/watch.ts') {
      const imports = body.match(/from '\.\/(?:school|research|knowledge|learning)\/[^']+'/g) ?? []
      assert.deepEqual(imports, ["from './learning/observer.ts'"], 'the watch loop may import the observer and nothing else from the learning layers')
      continue
    }
    offenders.push(rel)
  }
  assert.deepEqual(offenders, [])
})

test('BOUNDARY — the watch loop calls the observer after the close is final, inside a try/catch, and does not read its result', () => {
  const body = readFileSync(join(SRC, 'watch.ts'), 'utf8')
  const call = body.indexOf('observePaperClose(')
  const manage = body.indexOf('managePositions(snap.candles)')
  assert.ok(manage > 0 && call > manage, 'the observer runs after managePositions')
  const line = body.slice(body.lastIndexOf('\n', call), body.indexOf('\n', call))
  assert.match(line, /try \{ observePaperClose\(p, now\) \} catch/)
  assert.doesNotMatch(line, /const .* = observePaperClose|= observePaperClose/, 'the result is not assigned')
})

test('BOUNDARY — the learning layers value-import nothing that decides, sizes, places or manages an order, and call no writer', () => {
  const banned = /^import (?!type\b)[^\n]*from '.*\/(exchange\/binanceTrade|live\/trader|live\/orders|live\/reconcile|execution|riskEngine|fusion|watch|shadow\/[a-z]+|paramOverrides)\.ts'/m
  const writers = /\b(openPosition|closeManually|recordMissedSignal|savePosition|appendLedgerRow|managePositions|engageStop|releaseStop|withParams|withParamsAsync|recordPaperResult|savePassport|mint)\(/
  for (const d of LEARNING_DIRS) for (const file of walk(join(SRC, d))) {
    const body = readFileSync(file, 'utf8')
    const rel = file.replace(SRC, 'src')
    if (rel === 'src/school/caseStudies.ts') {
      // The one permitted exception: the case-study engine steps the REAL engine over stored candles,
      // which means calling the pure fuse() over historical votes. It is the only learning-layer file
      // that may import fusion, and it may import nothing else from the banned list.
      const hits = body.match(/from '\.\.\/(fusion|riskEngine|execution|watch)\.ts'/g) ?? []
      assert.deepEqual(hits, ["from '../fusion.ts'"], `${rel} may value-import fusion (pure, over stored candles) and nothing else that decides`)
    } else assert.equal(banned.test(body), false, `${rel} imports a deciding or acting module`)
    assert.equal(writers.test(body), false, `${rel} calls something that writes a position, an order, a passport or a parameter`)
    assert.equal(/EXCHANGE_API_KEY|EXCHANGE_API_SECRET/.test(body), false, `${rel} references exchange credentials`)
    assert.equal(/config\.[a-zA-Z.]+\s*=[^=]/.test(body), false, `${rel} assigns to config`)
  }
  assert.equal(config.live.enabled, false)
  assert.equal(config.shadow.enabled, false)
})
