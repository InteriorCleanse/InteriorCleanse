/**
 * ONE win rate, everywhere.
 *
 * `sim/trades.ts` opens with the promise that it is "the one place trade results
 * are worked out … so a number on one screen can never disagree with the same
 * number on another". Two reporting paths had since invented their own
 * thresholds and broken that promise:
 *
 *   paperStats (the paper account)   win = rMultiple >  0.05
 *   paperByStrategy / validation     win = rMultiple >  0.0001
 *   the engine (sim/trades, ledger)  win = pnlPercent > 0.001
 *
 * So a trade closing at +0.02R was a WIN on the validation panel and a SCRATCH
 * on the paper account — in the SAME `/api/paper` response. These tests pin the
 * single shared definition and would fail again if anyone re-introduces a local
 * threshold.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import { paperByStrategy } from '../../src/paper/metrics.ts'
import { byOutcome } from '../../src/paper/validation.ts'
import { classifyOutcome, OUTCOME_DEADBAND_PCT } from '../../src/sim/trades.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'

const tmp = tempDataDir('mrcash-outcome-')
process.env.MRCASH_DATA_DIR = tmp.dir
const pt = await import('../../src/paperTrader.ts')

const DAY = 86_400_000

function pos(o: Partial<PaperPosition>): PaperPosition {
  return {
    id: Math.random().toString(36).slice(2), openedAt: 0, dayKey: '2026-01-01', session: 'London',
    setupKey: 'BTCUSDT|5m|crossover|BUY', direction: 'long', intendedEntry: 100, entry: 100,
    stop: 99, target: 102, quantity: 1, riskUsd: 1, quality: 80, reason: 'x', atr: 1,
    status: 'closed', ...o,
  } as PaperPosition
}

test('the canonical classifier is the only threshold, and it sits where it says it does', () => {
  assert.equal(classifyOutcome(OUTCOME_DEADBAND_PCT * 2), 'WIN')
  assert.equal(classifyOutcome(-OUTCOME_DEADBAND_PCT * 2), 'LOSS')
  assert.equal(classifyOutcome(0), 'FLAT')
  assert.equal(classifyOutcome(OUTCOME_DEADBAND_PCT), 'FLAT', 'exactly on the band is a scratch, not a win')
})

test('a recorded engine outcome is always preferred over any re-derivation', () => {
  // A deliberately contradictory position: the recorded verdict must win.
  const p = pos({ outcome: 'LOSS', rMultiple: 5, pnlUsd: 500, exitReason: 'target' })
  assert.equal(pt.paperOutcome(p), 'LOSS', 'the engine recorded LOSS; reporting must not overrule it')
})

test('a missed order is never counted as a trade outcome', () => {
  assert.equal(pt.paperOutcome(pos({ exitReason: 'missed', rMultiple: 0 })), 'MISSED')
})

test('a legacy position without a recorded outcome recovers the exact percent from dollars', () => {
  // pnlUsd = pnlPercent/100 × notional, so the division back is exact.
  const notional = 100 * 2 // entry 100, quantity 2
  const winner = pos({ entry: 100, quantity: 2, pnlUsd: (0.5 / 100) * notional, outcome: undefined, exitReason: 'target' })
  assert.equal(pt.paperOutcome(winner), 'WIN')
  const loser = pos({ entry: 100, quantity: 2, pnlUsd: (-0.5 / 100) * notional, outcome: undefined, exitReason: 'stop' })
  assert.equal(pt.paperOutcome(loser), 'LOSS')
  const scratch = pos({ entry: 100, quantity: 2, pnlUsd: 0, outcome: undefined, exitReason: 'time' })
  assert.equal(pt.paperOutcome(scratch), 'FLAT')
})

test('THE REGRESSION: a trade inside the old 0.05R deadband is now counted identically everywhere', () => {
  // +0.02R with a genuinely positive percent. Under the old code this was a WIN
  // to paperByStrategy/validation and a FLAT to paperStats — in one response.
  const notional = 100 * 1
  const marginal = pos({
    strategyId: 'crossover', exitReason: 'target', rMultiple: 0.02,
    pnlUsd: (0.2 / 100) * notional, outcome: 'WIN', closedAt: 1 * DAY,
  })
  const closed = [marginal]

  const byStrategy = paperByStrategy(closed)[0]
  const outcomes = byOutcome(closed)
  const shared = pt.paperOutcome(marginal)

  assert.equal(shared, 'WIN')
  assert.equal(byStrategy.wins, 1, 'per-strategy metrics must see a win')
  assert.equal(byStrategy.winRate, 1)
  assert.equal(outcomes.find((b) => b.key === 'win')?.taken, 1, 'the validation breakdown must see the same win')
  // The old paperStats rule (rMultiple > 0.05) would have called this flat.
  assert.equal((marginal.rMultiple ?? 0) > 0.05, false, 'this trade is inside the old deadband — the point of the test')
})

test('the three reporting paths agree on a mixed book, trade for trade', () => {
  const n = (pct: number) => (pct / 100) * 100 // notional = entry 100 × qty 1
  const closed: PaperPosition[] = [
    pos({ strategyId: 's', exitReason: 'target', rMultiple: 2.0, pnlUsd: n(2), outcome: 'WIN', closedAt: 1 * DAY }),
    pos({ strategyId: 's', exitReason: 'target', rMultiple: 0.02, pnlUsd: n(0.2), outcome: 'WIN', closedAt: 2 * DAY }),   // inside the old deadband
    pos({ strategyId: 's', exitReason: 'stop', rMultiple: -0.02, pnlUsd: n(-0.2), outcome: 'LOSS', closedAt: 3 * DAY }), // inside the old deadband
    pos({ strategyId: 's', exitReason: 'stop', rMultiple: -1.0, pnlUsd: n(-1), outcome: 'LOSS', closedAt: 4 * DAY }),
    pos({ strategyId: 's', exitReason: 'time', rMultiple: 0, pnlUsd: 0, outcome: 'FLAT', closedAt: 5 * DAY }),
    pos({ strategyId: 's', exitReason: 'missed', rMultiple: 0, note: 'Kill switch', closedAt: 6 * DAY }),
  ]

  const shared = closed.map((p) => pt.paperOutcome(p))
  assert.deepEqual(shared, ['WIN', 'WIN', 'LOSS', 'LOSS', 'FLAT', 'MISSED'])

  const m = paperByStrategy(closed)[0]
  assert.equal(m.wins, 2)
  assert.equal(m.losses, 2)
  assert.equal(m.flat, 1)
  assert.equal(m.missed, 1)
  assert.equal(m.winRate, 0.5)

  const buckets = byOutcome(closed)
  assert.equal(buckets.find((b) => b.key === 'win')?.taken, 2, 'validation must agree with per-strategy metrics')
  assert.equal(buckets.find((b) => b.key === 'loss')?.taken, 2)
  assert.equal(buckets.find((b) => b.key === 'flat')?.taken, 1)
})

test('no reporting module re-introduces a local win/loss threshold', async () => {
  const { readFileSync } = await import('node:fs')
  const suspects = ['src/paperTrader.ts', 'src/paper/metrics.ts', 'src/paper/validation.ts']
  for (const f of suspects) {
    const body = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
    // A bare numeric comparison against rMultiple is exactly how this drifted before.
    const offenders = [...body.matchAll(/rMultiple[^\n]*[<>]=?\s*-?0\.\d+/g)].map((m) => m[0])
    assert.deepEqual(offenders, [], `${f} compares rMultiple against a local threshold: ${offenders.join(' | ')}`)
  }
})

test('cleanup', () => { tmp.cleanup() })
