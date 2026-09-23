/**
 * GROWTH STAGES — ZERO, ONE, 10, 50 and 200 paper trades, in one store that
 * grows through them the way a live desk would. Every layer answers at every
 * stage, states its sample, claims nothing under the bar, and only starts
 * testing when a cohort clears it.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'

const tmp = tempDataDir('mrcash-growth-')
process.env.MRCASH_DATA_DIR = tmp.dir
const { config } = await import('../../config.ts')
const ops = await import('../../src/learning/ops.ts')
const status = await import('../../src/learning/status.ts')
const D = await import('../../src/learning/digest.ts')
const lp = await import('../../src/learning/passport.ts')
const R = await import('../../src/research/recommend.ts')
const X = await import('../../src/research/experiments.ts')
const Q = await import('../../src/research/queue.ts')
const rec = await import('../../src/analyst/records.ts')
const vault = await import('../../src/knowledge/vault.ts')
const { tradingDayKey } = await import('../../src/sessions.ts')
after(() => tmp.cleanup())

const NOW = Date.UTC(2026, 0, 20, 15, 0)
const DAY = 86_400_000
const HOUR = 3_600_000
const CONFIG_BEFORE = JSON.stringify(config)
const BANNED = /\b(proven|guaranteed|fail-?proof)\b|\bPROVEN\b|\bwill (rise|fall|rally|drop|reverse|continue)\b|\bforecast:/i

function rng(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } }
function pos(i: number, closedAt: number, over: Partial<PaperPosition> = {}): PaperPosition {
  const openedAt = closedAt - 1_800_000
  return { id: `gr${i}`, openedAt, dayKey: tradingDayKey(openedAt), session: 'London', setupKey: 'BTCUSDT|5m|silver-bullet|long', direction: 'long', intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 0.01, riskUsd: 1, quality: 85, reason: 'test', atr: 0.5, status: 'closed', filledAt: openedAt + 300_000, strategyId: 'silver-bullet', regime: 'trending-up', closedAt, exit: 102, exitReason: 'target', rMultiple: 1, pnlUsd: 1, feesUsd: 0.01, outcome: 'WIN', candlesHeld: 5, ...over }
}
const g = rng(9)
const all: PaperPosition[] = Array.from({ length: 200 }, (_, i) => { const london = i % 2 === 0; const rm = (london ? 0.5 : -0.2) + (g() - 0.5) * 1.4; return pos(i, NOW - 100 * DAY + i * 12 * HOUR, { session: london ? 'London' : 'Asia', rMultiple: rm, exit: 100 + rm, outcome: rm > 0 ? 'WIN' : 'LOSS', exitReason: rm > 0 ? 'target' : 'stop' }) })
const bands: Record<number, string> = { 0: '0–9', 1: '0–9', 10: '10–49', 50: '50–199', 200: '200+' }

let stage = 0
for (const n of [0, 1, 10, 50, 200]) {
  const now = NOW + stage * HOUR
  stage++
  test(`stage ${n === 0 ? 'ZERO' : n === 1 ? 'ONE' : n}: every layer answers, the band is ${bands[n]}, nothing is claimed under the bar${n < 50 ? ', nothing is tested' : ', a cohort is tested'}`, async () => {
    const closed = all.slice(0, n)
    const tick = await ops.researchTick({ closed: () => closed, now })
    assert.ok(tick.steps.every((s) => s.ok), tick.steps.filter((s) => !s.ok).map((s) => `${s.name}: ${s.detail}`).join(' | '))
    const st = status.systemStatus({ closed, open: 0, now })
    assert.equal(st.paperEngine.growth.band, bands[n])
    assert.equal(st.paperEngine.closed, n)
    const pass = lp.livingPassport('silver-bullet', closed, { now })
    if (n < 10) assert.equal('status' in pass.paper ? pass.paper.status : 'x', 'NOT ENOUGH DATA', 'no reading under the bar')
    else assert.ok('cohort' in pass.paper && pass.paper.cohort.stats.n === n)
    const dig = D.buildDailyDigest(closed, now)
    assert.equal(dig.sections.length, 15)
    const recs = R.recommendations({ paper: rec.paperDataset(closed), now })
    if (n < 10) assert.ok(recs.items.some((x) => x.topic === 'missing evidence'))
    const q = Q.listQueue()
    if (n < 50) {
      assert.equal(tick.experiment, null, 'no cohort clears the 50-trade bar, so nothing is tested')
      assert.ok(q.every((x) => x.status !== 'TESTED' && x.status !== 'UNDER TEST'))
      assert.equal(X.listExperiments().length, 0)
    }
    if (n === 50) assert.ok(q.filter((x) => x.status === 'TESTED' || x.status === 'UNDER TEST').every((x) => x.requiredData.have >= 50), 'at 50 only a cohort that clears the bar (the whole strategy) may be tested')
    if (n === 200) {
      assert.ok(tick.experiment, 'a London cohort of 100 clears the bar and is tested')
      assert.ok(X.listExperiments({ status: 'DONE' }).some((e) => e.strategyId === 'silver-bullet' && e.kind === 'cohort'))
    }
    for (const text of [JSON.stringify(tick), JSON.stringify(st), JSON.stringify(dig), JSON.stringify(recs)]) assert.doesNotMatch(text, BANNED)
    assert.equal(JSON.stringify(config), CONFIG_BEFORE)
    assert.equal(vault.vaultSummary().corrupt, 0)
  })
}

test('after the stages: five runs on record, the queue regenerated in place, and the live gate still off', () => {
  assert.equal(ops.readOps().runs, 5)
  assert.ok(Q.queueSummary().total >= 1)
  assert.equal(config.live.enabled, false)
})
