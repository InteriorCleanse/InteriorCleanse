/**
 * PERFORMANCE PROFILE — how long the ops reads take at a realistic size, how
 * long a research tick takes with a 140-trade record, how the database grows
 * across repeated ticks, and that the in-memory ops structures stay bounded.
 * The numbers are printed so the final report can quote them; the bounds are
 * generous on purpose (CI machines are slow) — the point is a ceiling, not a
 * benchmark.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir, syntheticKlines } from '../helpers.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'
import type { FeedHealth } from '../../src/data/feed.ts'
import type { StreamHealth } from '../../src/data/types.ts'

const tmp = tempDataDir('mrcash-ops25p-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const { store } = await import('../../src/store.ts')
const ops = await import('../../src/learning/ops.ts')
const I = await import('../../src/ops/integrity.ts')
const M = await import('../../src/ops/monitor.ts')
const HB = await import('../../src/ops/heartbeat.ts')
const R = await import('../../src/ops/reconcile.ts')
const L = await import('../../src/ops/log.ts')
const { tradingDayKey } = await import('../../src/sessions.ts')
after(() => tmp.cleanup())

L.resetOpsLog({ logger: { debug() {}, info() {}, warn() {}, error() {}, path: 'fake' } })

const NOW = Date.UTC(2026, 0, 20, 15, 0)
const DAY = 86_400_000
const HOUR = 3_600_000
const STEP = 300_000
const ms = (t0: number) => Math.round(performance.now() - t0)
const profile: Record<string, number> = {}

function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
function pos(i: number, closedAt: number, over: Partial<PaperPosition> = {}): PaperPosition {
  const openedAt = closedAt - 1_800_000
  return { id: `pf${i}`, openedAt, dayKey: tradingDayKey(openedAt), session: 'London', setupKey: 'BTCUSDT|5m|silver-bullet|long', direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 0.01, riskUsd: 1, quality: 85, reason: 'test', atr: 0.5, status: 'closed', filledAt: openedAt + 300_000, strategyId: 'silver-bullet', regime: 'trending-up', closedAt, exit: 102, exitReason: 'target', rMultiple: 1, pnlUsd: 1, feesUsd: 0.01, outcome: 'WIN', candlesHeld: 5, ...over }
}
const g = rng(31)
const closed: PaperPosition[] = Array.from({ length: 140 }, (_, i) => { const london = i % 2 === 0; const rm = (london ? 0.5 : -0.2) + (g() - 0.5) * 1.4; return pos(i, NOW - 70 * DAY + i * 12 * HOUR, { session: london ? 'London' : 'Asia', rMultiple: rm, exit: 100 + rm, outcome: rm > 0 ? 'WIN' : 'LOSS', exitReason: rm > 0 ? 'target' : 'stop' }) })
for (const p of closed) store().savePosition(p)

function feedAt(t: number): FeedHealth {
  const stream: StreamHealth = { connected: true, host: 'ws', lastMessageAt: { kline: t } as StreamHealth['lastMessageAt'], reconnects: 0, lastGap: null, fallbackActive: false }
  return { mode: 'stream', stream, lastClosed: { openTime: t - STEP, announcedAt: t, via: 'stream' }, heartbeat: { at: t, filled: 0 }, price: 1, priceAt: t }
}

test('40 days of candles (11,520 rows) load and the daily integrity read stays under 3 s', () => {
  const rows = syntheticKlines(40, 5, NOW).map((k) => ({ openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5], closeTime: k[6] }))
  let t0 = performance.now()
  store().upsertCandles(config.symbol, config.interval, rows, 'rest')
  profile.candleLoadMs = ms(t0)
  t0 = performance.now()
  const rep = I.dataIntegrityReport(NOW)
  profile.integrityMs = ms(t0)
  assert.equal(rep.candles.counts.total, rows.length)
  assert.ok(profile.integrityMs < 3000, `integrity took ${profile.integrityMs} ms`)
})

test('the heartbeat, the health document and the reconciliation of 140 trades each stay under 1.5 s', () => {
  let t0 = performance.now()
  HB.heartbeat({ feed: feedAt(NOW), now: NOW, probe: true })
  profile.heartbeatMs = ms(t0)
  t0 = performance.now()
  const h = M.opsHealth({ feed: feedAt(NOW), now: NOW, probe: false })
  profile.opsHealthMs = ms(t0)
  assert.ok(h.heartbeat && h.feed && h.soak)
  t0 = performance.now()
  const rec = R.reconciliationReport({ now: NOW })
  profile.reconcile140Ms = ms(t0)
  assert.equal(rec.total, 140)
  assert.ok(profile.heartbeatMs < 1500 && profile.opsHealthMs < 1500 && profile.reconcile140Ms < 1500, JSON.stringify(profile))
})

test('a research tick over the 140-trade record completes, and four more ticks on the same data add no experiments and little database', async () => {
  const size0 = store().sizeBytes()
  let t0 = performance.now()
  const r1 = await ops.researchTick({ closed: () => closed, now: NOW })
  profile.researchTickFirstMs = ms(t0)
  assert.ok(r1.steps.every((s) => s.ok), r1.steps.filter((s) => !s.ok).map((s) => `${s.name}: ${s.detail}`).join(' | '))
  const exps1 = store().keysWithPrefix('experiment:').length
  const times: number[] = []
  for (let i = 1; i <= 4; i++) {
    t0 = performance.now()
    const r = await ops.researchTick({ closed: () => closed, now: NOW + i * 16 * 60_000 })
    times.push(ms(t0))
    assert.ok(r.steps.every((s) => s.ok))
  }
  profile.researchTickRepeatMaxMs = Math.max(...times)
  const exps5 = store().keysWithPrefix('experiment:').length
  assert.ok(exps5 <= exps1 + 4, `experiments grew from ${exps1} to ${exps5} across four repeated ticks`)
  store().db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  profile.dbGrowthKBOver5Ticks = Math.round((store().sizeBytes() - size0) / 1024)
  assert.ok(profile.dbGrowthKBOver5Ticks < 4096, `db grew ${profile.dbGrowthKBOver5Ticks} KB`)
  assert.ok(profile.researchTickFirstMs < 60_000, `first tick ${profile.researchTickFirstMs} ms`)
})

test('the ops log keeps a bounded ring and a bounded repeat table under a flood of distinct lines', () => {
  const t0 = performance.now()
  for (let i = 0; i < 3000; i++) L.ops.info('ops', 'flood', `line ${i}`, { now: NOW + i })
  profile.log3000LinesMs = ms(t0)
  assert.equal(L.recentOps(10_000).length, 500)
  assert.ok(L.suppressedRepeats().length <= 50)
  assert.ok(profile.log3000LinesMs < 2000)
})

test('profile', () => {
  console.log(`PERFORMANCE PROFILE ${JSON.stringify(profile)}`)
  assert.ok(Object.keys(profile).length >= 8)
})
