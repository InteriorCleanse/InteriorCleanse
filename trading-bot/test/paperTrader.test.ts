import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { tempDataDir } from './helpers.ts'
import { mk, STEP } from './fixtures/candles.ts'
import type { Signal, RiskDecision } from '../src/types.ts'

const tmp = tempDataDir('mrcash-paper-')
process.env.MRCASH_DATA_DIR = tmp.dir
const pt = await import('../src/paperTrader.ts')
const mem = await import('../src/memory.ts')
const jr = await import('../src/journal.ts')
const { config } = await import('../config.ts')
after(() => tmp.cleanup())

const T0 = Date.UTC(2026, 0, 15, 14, 0) // the signal candle's close
const sigAt = (t: number): Signal => ({
  action: 'BUY', reason: 'test', price: 100, time: t, setupKey: 'BTCUSDT|5m|ICT|london|long|asia-low|IFVG', evidence: [], quality: 70,
  plan: { direction: 'long', entry: 100, stop: 99, takeProfit: 102, rr: 2, entryLabel: '', stopLabel: '', targetLabel: '' },
})
const risk: RiskDecision = { approved: true, finalAction: 'BUY', reason: 'ok', quantity: 0.2, positionValueUsd: 20, riskUsd: 0.2 }
const signalCandle = (t: number) => mk(t - STEP + 1, 99.8, 100.3, 99.5, 100)
const nextCandle = (t: number, open = 100.05) => mk(t + 1, open, open + 0.55, open - 0.15, open + 0.35)
const entryCostBps = config.execution.spreadBps / 2 + config.execution.slippageBps

test('a new paper order is queued, counts toward today, and touches nothing else', () => {
  const p = pt.openPosition(sigAt(T0), risk, 'London', 1)
  assert.equal(p.status, 'pending')
  assert.equal(p.intendedEntry, 100)
  assert.equal(pt.readPositions().open.length, 1)
  assert.equal(pt.equity(), 25)
  assert.equal(mem.readLedger().length, 0, 'no ledger row until something happens')
  assert.equal(pt.todaysPaperStats(p.dayKey).trades, 1)
})

test('it stays queued until the next candle exists, then fills at that open plus costs and is re-sized from the fill', () => {
  assert.deepEqual(pt.managePositions([signalCandle(T0)]), [], 'no next candle yet')
  const changed = pt.managePositions([signalCandle(T0), nextCandle(T0)])
  assert.equal(changed.length, 1)
  const p = changed[0]
  assert.equal(p.status, 'open')
  assert.ok(Math.abs(p.entry - 100.05 * (1 + entryCostBps / 10_000)) < 1e-9)
  assert.equal(p.filledAt, T0 + 1)
  assert.ok((p.entryCostUsd ?? 0) > 0)
  assert.ok(Math.abs(p.riskUsd - Math.min(config.accountSizeUsd * config.riskPerTradePercent / 100, p.quantity * (p.entry - p.stop))) < 1e-9)
  assert.equal(pt.readPositions().open[0].status, 'open')
})

test('a candle that trades through the target closes it, records the ledger, equity, lesson check and a journal entry', () => {
  const toTarget = mk(T0 + 1 + STEP, 100.4, 102.5, 100.3, 102.1)
  const changed = pt.managePositions([signalCandle(T0), nextCandle(T0), toTarget])
  assert.equal(changed.length, 1)
  const c = changed[0]
  assert.equal(c.status, 'closed')
  assert.equal(c.exitReason, 'target')
  assert.equal(c.exit, 102)
  assert.ok((c.rMultiple ?? 0) > 1.5 && (c.rMultiple ?? 0) < 1.9, `R after costs from a slipped fill: ${c.rMultiple}`)
  assert.ok((c.feesUsd ?? 0) > 0)
  assert.equal(pt.readPositions().open.length, 0)
  assert.equal(pt.readPositions().closed.length, 1)
  const rows = mem.readLedger()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].mode, 'live-paper')
  assert.equal(rows[0].outcome, 'WIN')
  assert.ok(Math.abs(rows[0].price - c.entry) < 1e-9, 'the ledger records the FILL price')
  assert.equal(existsSync(pt.EQUITY_PATH), true)
  assert.match(readFileSync(pt.EQUITY_PATH, 'utf8'), /timestamp,equity/)
  assert.equal(jr.readJournal().length, 1)
  assert.match(jr.readJournal()[0].notes, /Intended entry \$100\.00, filled at/)
  assert.ok(pt.equity() > 25)
})

test('an order is MISSED when the next candle opens too far away; it is logged but is not a trade', () => {
  const t = T0 + 10 * STEP
  const p = pt.openPosition(sigAt(t), risk, 'London', 1)
  const changed = pt.managePositions([signalCandle(t), nextCandle(t, 100.7)])
  assert.equal(changed.length, 1)
  assert.equal(changed[0].exitReason, 'missed')
  assert.equal(changed[0].status, 'closed')
  assert.match(changed[0].note ?? '', /0\.70 ATR/)
  assert.equal(pt.readPositions().open.length, 0)
  assert.equal(pt.todaysPaperStats(p.dayKey).trades, 1, 'the missed order does not count as a trade')
  assert.equal(mem.readLedger().filter((r) => r.outcome === 'MISSED').length, 1)
})

test('a queued order can be cancelled; a filled position can be closed by hand at a price', () => {
  const t = T0 + 20 * STEP
  const queued = pt.openPosition(sigAt(t), risk, 'London', 1)
  const cancelled = pt.closeManually(queued.id, 100)
  assert.equal(cancelled?.exitReason, 'missed')
  assert.match(cancelled?.note ?? '', /cancelled by you/)
  const t2 = T0 + 30 * STEP
  const p = pt.openPosition(sigAt(t2), risk, 'London', 1)
  pt.managePositions([signalCandle(t2), nextCandle(t2)])
  const c = pt.closeManually(p.id, 99.5)
  assert.ok(c)
  assert.equal(c!.exitReason, 'manual')
  assert.ok((c!.rMultiple ?? 0) < 0)
  assert.equal(pt.closeManually('does-not-exist', 100), null)
})

test('paperStats separates trades from missed orders and reports costs', () => {
  const s = pt.paperStats(101)
  assert.equal(s.trades, 2)
  assert.equal(s.missed, 2)
  assert.equal(s.wins, 1)
  assert.equal(s.losses, 1)
  assert.equal(s.winRate, 0.5)
  assert.equal(s.curve.length, 2)
  assert.ok(s.costsUsd > 0)
  assert.equal(s.open.length, 0)
  assert.ok(Math.abs(s.equityUsd - s.curve[1].equity) < 1e-9)
})

test('a losing streak on one setup key writes a lesson, exactly once', () => {
  for (let i = 0; i < 3; i++) {
    const t = T0 + (40 + i * 5) * STEP
    const p = pt.openPosition(sigAt(t), risk, 'London', 1)
    pt.managePositions([signalCandle(t), nextCandle(t)])
    pt.closeManually(p.id, 98)
  }
  const lessons = mem.lessonLines()
  assert.equal(lessons.length, 1, 'one lesson, written the moment the rule was first met and never duplicated')
  assert.match(lessons[0], /lost 3 of 4 times/)
  assert.equal(pt.learnFromLedger(sigAt(T0).setupKey), false, 'already on file')
})

/**
 * THE FILL MUST RESPECT THE VENUE'S FILTERS, NOT JUST THE APPROVAL.
 *
 * `assess` rounds the approved size to a whole number of the venue's steps, but
 * `fillPosition` re-sizes from the actual fill price — and used to store that
 * re-derived size raw, throwing the rounding away. With Binance BTCUSDT's real
 * values the risk engine approves 0.00083 and the position was recorded as
 * 0.000833017619655484: not a multiple of the 0.00001 step, not placeable.
 * `filters.ts` states the intent plainly — "Even on paper, sizing that ignores
 * these is a lie about what could actually be filled."
 *
 * Every filter ships at 0, so this is dormant today; it wakes up exactly when
 * Phase 20 sets the venue's real values, on the way to risking money.
 */
const VENUE = { tickSize: 0.01, stepSize: 0.00001, minNotionalUsd: 5 }

function withFilters<T>(f: { tickSize: number; stepSize: number; minNotionalUsd: number }, run: () => T): T {
  const risk = config.risk as { filters: typeof f }
  const before = risk.filters
  risk.filters = f
  try { return run() } finally { risk.filters = before }
}

test('a filled position is a whole number of the venue step size', () => {
  const t = T0 + 40 * STEP
  withFilters(VENUE, () => {
    pt.openPosition(sigAt(t), risk, 'London', 1)
    const changed = pt.managePositions([signalCandle(t), nextCandle(t)])
    const filled = changed.find((p) => p.status === 'open' || p.exitReason !== 'missed')
    assert.ok(filled, 'the order should have filled')
    const steps = filled!.quantity / VENUE.stepSize
    assert.ok(
      Math.abs(steps - Math.round(steps)) < 1e-6,
      `quantity ${filled!.quantity} is not a whole number of ${VENUE.stepSize} steps — the venue would reject it`,
    )
    // And the risk recorded must follow the size that could actually be placed.
    const expectedRisk = filled!.quantity * Math.abs(filled!.entry - filled!.stop)
    assert.ok(Math.abs((filled!.riskUsd ?? 0) - expectedRisk) < 1e-9, `riskUsd ${filled!.riskUsd} does not match the filled size`)
  })
})

test('an order the venue would reject at the fill price is missed, not invented', () => {
  const t = T0 + 60 * STEP
  // A minimum notional far above anything this account can size into: the venue
  // would refuse the order, so there is no fill to record.
  withFilters({ ...VENUE, minNotionalUsd: 1_000_000 }, () => {
    pt.openPosition(sigAt(t), risk, 'London', 1)
    const changed = pt.managePositions([signalCandle(t), nextCandle(t)])
    const p = changed[changed.length - 1]
    assert.equal(p.status, 'closed')
    assert.equal(p.exitReason, 'missed')
    assert.match(p.note ?? '', /venue would have rejected/)
    assert.equal(p.pnlUsd, 0, 'a rejected order cannot have made or lost anything')
  })
})

// ---------------------------------------------------------------
// THE DECISION-TIME SNAPSHOT
// ---------------------------------------------------------------

const SNAP = {
  signalId: 'k@1', symbol: 'BTCUSDT', interval: '5m', engineVersion: '2.3.0', featureVersion: 1,
  volatility: 'wild' as const, fusedScore: 72, fusedAction: 'LONG', confirms: ['Structure agrees.'], invalidates: [],
  contributors: [{ id: 'silver-bullet', action: 'BUY', confidence: 80 }],
  evidence: [{ step: 'Sweep of the session low', passed: true, detail: 'took 99.4' }],
  riskChecks: [{ rule: 'Kill switch', passed: true, detail: 'off' }], riskVetoedBy: null,
  newsMinutes: 95, inBlackout: false,
}

/**
 * OBSERVABILITY, NOT BEHAVIOUR.
 *
 * The snapshot exists so the analyst layer never has to recover the engine's
 * view after the outcome is known. It must not be able to change what the
 * engine does: a position opened with a snapshot and one opened without are
 * the same position in every field the engine reads.
 */
test('a position opened with a snapshot is identical to one opened without, in every engine field', () => {
  const t = T0 + 70 * STEP
  const bare = pt.openPosition(sigAt(t), risk, 'London', 1, { bid: 99.99, ask: 100.01, strategyId: 'session-ifvg', regime: 'ranging' })
  const withSnap = pt.openPosition(sigAt(t), risk, 'London', 1, { bid: 99.99, ask: 100.01, strategyId: 'session-ifvg', regime: 'ranging', snapshot: SNAP })
  const strip = (p: Record<string, unknown>) => { const { id: _id, snapshot: _s, ...rest } = p; return rest }
  assert.deepEqual(strip(withSnap as never), strip(bare as never))
  assert.equal(bare.snapshot, undefined)
  assert.deepEqual(withSnap.snapshot, SNAP)
  pt.closeManually(bare.id, 100); pt.closeManually(withSnap.id, 100)
})

test('the snapshot is written before the outcome exists and survives fill and close unchanged', () => {
  const t = T0 + 80 * STEP
  const queued = pt.openPosition(sigAt(t), risk, 'London', 1, { snapshot: SNAP })
  assert.equal(queued.status, 'pending')
  assert.deepEqual(queued.snapshot, SNAP, 'captured at queue time, when nothing about the outcome is knowable')
  pt.managePositions([signalCandle(t), nextCandle(t)])
  const open = pt.readPositions().open.find((p) => p.id === queued.id)!
  assert.equal(open.status, 'open')
  assert.deepEqual(open.snapshot, SNAP)
  const closed = pt.closeManually(queued.id, 101.5)!
  assert.equal(closed.status, 'closed')
  assert.deepEqual(closed.snapshot, SNAP, 'the close must not touch the decision-time record')
})

/**
 * ADVERSARIAL: NOTHING FROM THE FUTURE CAN RIDE IN ON THE SNAPSHOT.
 *
 * A caller — or a bug — that stuffs an exit price, an R or a close time into
 * the observation must not be able to get it stored as decision-time state.
 * The sanitiser copies only the declared fields, so the smuggled keys vanish
 * whatever they are called.
 */
test('outcome fields smuggled into the snapshot are dropped, under any name', () => {
  const smuggled = { ...SNAP, exit: 105, rMultiple: 4, closedAt: 1, outcome: 'WIN', pnlUsd: 99, futureCandles: [1, 2, 3], evidence: [...SNAP.evidence, { step: 'x', passed: true, detail: 'y', exitPrice: 105 }] }
  const clean = pt.sanitizeSnapshot(smuggled)!
  for (const k of ['exit', 'rMultiple', 'closedAt', 'outcome', 'pnlUsd', 'futureCandles']) assert.equal(k in clean, false, `"${k}" survived sanitisation`)
  assert.equal('exitPrice' in (clean.evidence[1] as object), false, 'nested extras are dropped too')
  assert.deepEqual(Object.keys(clean).sort(), Object.keys(SNAP).sort())
  // And the stored record carries only the clean shape.
  const t = T0 + 90 * STEP
  const p = pt.openPosition(sigAt(t), risk, 'London', 1, { snapshot: smuggled as never })
  assert.deepEqual(Object.keys(p.snapshot!).sort(), Object.keys(SNAP).sort())
  pt.closeManually(p.id, 100)
})

test('a malformed snapshot is normalised field by field, never trusted', () => {
  const s = pt.sanitizeSnapshot({ signalId: 7, volatility: 'loud', fusedScore: 'high', confirms: 'yes', contributors: [{ id: 'a', confidence: 'b' }], newsMinutes: Number.NaN })!
  assert.equal(s.signalId, '')
  assert.equal(s.volatility, null)
  assert.equal(s.fusedScore, null)
  assert.deepEqual(s.confirms, [])
  assert.deepEqual(s.contributors, [{ id: 'a', action: '', confidence: 0 }])
  assert.equal(s.newsMinutes, null)
  assert.equal(pt.sanitizeSnapshot(null), undefined)
  assert.equal(pt.sanitizeSnapshot('x'), undefined)
})

test('news proximity is the minutes to the next blackout, and null when none is ahead or none is known', () => {
  const at = 1_000_000
  assert.deepEqual(pt.newsProximity(null, at), { newsMinutes: null, inBlackout: null })
  assert.deepEqual(pt.newsProximity([], at), { newsMinutes: null, inBlackout: false })
  assert.deepEqual(pt.newsProximity([{ start: at + 30 * 60_000, end: at + 60 * 60_000 }, { start: at + 5 * 60_000, end: at + 6 * 60_000 }], at), { newsMinutes: 5, inBlackout: false })
  assert.deepEqual(pt.newsProximity([{ start: at - 60_000, end: at + 60_000 }], at), { newsMinutes: null, inBlackout: true })
})

// ---------------------------------------------------------------
// A CLOSED RECORD IS IMMUTABLE
// ---------------------------------------------------------------

test('a closed position cannot be rewritten except in the reconciliation fields', async () => {
  const { store, RECONCILIATION_FIELDS } = await import('../src/store.ts')
  const t = T0 + 100 * STEP
  const p = pt.openPosition(sigAt(t), risk, 'London', 1)
  const closed = pt.closeManually(p.id, 100)!
  assert.equal(closed.status, 'closed')

  // Rewriting the evidence is refused, and the refusal names the fields.
  assert.throws(() => store().savePosition({ ...closed, rMultiple: 9, exit: 200 } as never), /closed and immutable — refusing to rewrite exit, rMultiple/)
  assert.throws(() => store().savePosition({ ...closed, status: 'open' } as never), /refusing to rewrite status/)
  // The stored record is untouched by the refused writes.
  const stored = pt.readPositions().closed.find((x) => x.id === p.id)!
  assert.equal(stored.rMultiple, closed.rMultiple)

  // An identical rewrite is idempotent, and reconciliation fields are allowed.
  store().savePosition(closed as never)
  store().savePosition({ ...closed, mae: -0.4, mfe: 1.2, reconciledAt: 1, reconciliationNote: 'walked from stored candles' } as never)
  const reconciled = pt.readPositions().closed.find((x) => x.id === p.id)!
  assert.equal(reconciled.mae, -0.4)
  assert.equal(reconciled.mfe, 1.2)
  assert.deepEqual([...RECONCILIATION_FIELDS].sort(), ['mae', 'mfe', 'reconciledAt', 'reconciliationNote'])
})
