/**
 * Measured paper trading (Phase 18). The paper record must be honest about the
 * real spread it saw, must count missed signals with their reason, and must
 * line realised paper expectancy up against the out-of-sample number — flagging
 * a sample that is too thin to trust.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import { paperByStrategy, comparePaperToOos, sampleSufficient, strategyOf } from '../../src/paper/metrics.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'
import type { Passport } from '../../src/vault/passport.ts'
import type { Signal } from '../../src/types.ts'

// A throwaway data dir so the store writes never touch the repo. Set BEFORE the
// paper trader (and its store) are loaded.
const tmp = tempDataDir('mrcash-paper18-')
process.env.MRCASH_DATA_DIR = tmp.dir
const pt = await import('../../src/paperTrader.ts')
after(() => tmp.cleanup())

const DAY = 86_400_000
function pos(o: Partial<PaperPosition>): PaperPosition {
  return {
    id: Math.random().toString(36).slice(2), openedAt: 0, dayKey: '2026-01-01', session: '', setupKey: 'BTCUSDT|5m|crossover|BUY',
    direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 1, riskUsd: 1, quality: 80, reason: 'x', atr: 1,
    status: 'closed', ...o,
  } as PaperPosition
}
function sig(setupKey: string, time: number): Signal {
  return { action: 'BUY', direction: 'long', price: 100, time, setupKey, reason: 'test', quality: 82, plan: { direction: 'long', entry: 100, stop: 99, takeProfit: 102, rr: 2, entryLabel: '', stopLabel: '', targetLabel: '' } } as unknown as Signal
}

test('a paper trade records the observed spread from the book at decision time', () => {
  const p = pt.openPosition(sig('BTCUSDT|5m|crossover|BUY', 1000), { quantity: 1, riskUsd: 1 } as never, 'London', 1, { bid: 99.98, ask: 100.02, strategyId: 'crossover' })
  assert.equal(p.strategyId, 'crossover')
  assert.equal(p.observedBid, 99.98)
  assert.equal(p.observedAsk, 100.02)
  assert.ok(p.observedSpreadPct && Math.abs(p.observedSpreadPct - 0.04) < 1e-6, `spread ${p.observedSpreadPct}`)
  assert.equal(typeof p.assumedSlippageBps, 'number')
})

test('a signal missed for a real reason is recorded as missed WITH the reason', () => {
  const m = pt.recordMissedSignal(sig('BTCUSDT|5m|session-ifvg|BUY', 2000), 'Kill switch: no new positions', { bid: 99.9, ask: 100.1, strategyId: 'session-ifvg' })
  assert.equal(m.exitReason, 'missed')
  assert.match(m.note ?? '', /Kill switch/)
  assert.equal(m.strategyId, 'session-ifvg')
})

test('per-strategy metrics separate taken from missed and bucket the miss reasons', () => {
  const closed: PaperPosition[] = [
    pos({ strategyId: 'crossover', exitReason: 'target', rMultiple: 2, pnlUsd: 20, closedAt: 1 * DAY, observedSpreadPct: 0.02, latencyMs: 3000 }),
    pos({ strategyId: 'crossover', exitReason: 'stop', rMultiple: -1, pnlUsd: -10, closedAt: 2 * DAY, observedSpreadPct: 0.04, latencyMs: 5000 }),
    pos({ strategyId: 'crossover', exitReason: 'missed', rMultiple: 0, note: 'Kill switch: off', closedAt: 3 * DAY }),
    pos({ strategyId: 'crossover', exitReason: 'missed', rMultiple: 0, note: 'Fresh data: stale feed', closedAt: 4 * DAY }),
  ]
  const [m] = paperByStrategy(closed)
  assert.equal(m.strategyId, 'crossover')
  assert.equal(m.taken, 2)
  assert.equal(m.missed, 2)
  assert.equal(m.wins, 1)
  assert.equal(m.losses, 1)
  assert.equal(m.totalR, 1)
  assert.equal(m.avgR, 0.5)
  assert.ok(Math.abs((m.avgObservedSpreadPct ?? 0) - 0.03) < 1e-9)
  assert.equal(m.avgLatencyMs, 4000)
  assert.equal(m.missedByReason['kill switch'], 1)
  assert.equal(m.missedByReason['stale data'], 1)
})

test('strategyOf falls back to the setup key when no id is recorded', () => {
  assert.equal(strategyOf(pos({ strategyId: undefined, setupKey: 'BTCUSDT|5m|breakout|BUY' })), 'breakout')
})

test('the sample-sufficiency gate needs both enough trades and enough weeks', () => {
  const thin = paperByStrategy([pos({ strategyId: 'x', exitReason: 'target', rMultiple: 1, closedAt: 1 * DAY })])[0]
  assert.equal(sampleSufficient(thin, 20, 4), false)
  const burst = paperByStrategy(Array.from({ length: 25 }, (_, i) => pos({ strategyId: 'x', exitReason: 'target', rMultiple: 1, closedAt: 1 * DAY + i * 1000 })))[0]
  assert.equal(sampleSufficient(burst, 20, 4), false)
  const spread = paperByStrategy(Array.from({ length: 25 }, (_, i) => pos({ strategyId: 'x', exitReason: 'target', rMultiple: 1, closedAt: i * 1.5 * DAY })))[0]
  assert.equal(sampleSufficient(spread, 20, 4), true)
})

test('paper is compared to the strategy OOS, and a thin sample is flagged not-enough', () => {
  const closed = Array.from({ length: 25 }, (_, i) => pos({ strategyId: 'crossover', exitReason: i % 3 ? 'target' : 'stop', rMultiple: i % 3 ? 1 : -1, closedAt: i * 1.5 * DAY }))
  const passports: Passport[] = [{
    id: 'p1', strategyId: 'crossover', genome: { strategyId: 'crossover', params: {} }, createdAt: 0, origin: 't', status: 'paper',
    oos: { trades: 30, avgR: 0.4, totalR: 12, sharpeR: 0.5, maxDrawdownR: 2, walkForward: null, monteCarlo: null }, oosLowerAvgR: 0.1,
    regimeFit: [], results: [], events: [], decay: { decaying: false, reason: '', rollingExpectancy: null, cusumLow: 0, trades: 0 }, reason: 't',
  }]
  const [c] = comparePaperToOos(paperByStrategy(closed), passports)
  assert.equal(c.oosAvgR, 0.4)
  assert.ok(c.paperAvgR !== null && c.delta !== null)
  assert.equal(c.enoughSample, true)
  const thin = comparePaperToOos(paperByStrategy([pos({ strategyId: 'crossover', exitReason: 'target', rMultiple: 1, closedAt: DAY })]), passports)
  assert.equal(thin[0].enoughSample, false)
  assert.match(thin[0].note, /under the/)
})
