/**
 * THE REVIEWS — daily brief, end of day, weekly: every figure labelled, NOT
 * ENOUGH DATA where true, no forecast anywhere, and the weekly review runs the
 * reassessment.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { tempDataDir } from '../helpers.ts'
import type { PaperPosition } from '../../src/paperTrader.ts'

const tmp = tempDataDir('mrcash-reviews-')
process.env.MRCASH_DATA_DIR = tmp.dir
const rv = await import('../../src/learning/reviews.ts')
const vault = await import('../../src/knowledge/vault.ts')
const H = await import('../../src/research/hypotheses.ts')
const { tradingDayKey } = await import('../../src/sessions.ts')
after(() => tmp.cleanup())

const NOW = Date.UTC(2026, 0, 20, 15, 0)
const DAY = 86_400_000

function pos(i: number, closedAt: number, over: Partial<PaperPosition> = {}): PaperPosition {
  const openedAt = closedAt - 1_800_000
  return {
    id: `pp${i}`, openedAt, dayKey: tradingDayKey(openedAt), session: 'London', setupKey: 'BTCUSDT|5m|silver-bullet|long', direction: 'long',
    intendedEntry: 100, entry: 100, stop: 99, target: 102, quantity: 0.01, riskUsd: 1, quality: 85, reason: 'test', atr: 0.5, status: 'closed',
    filledAt: openedAt + 300_000, strategyId: 'silver-bullet', regime: 'trending-up', closedAt, exit: 102, exitReason: 'target', rMultiple: i % 3 === 0 ? -1 : 1.5, pnlUsd: 1, feesUsd: 0.01, outcome: i % 3 === 0 ? 'LOSS' : 'WIN', candlesHeld: 5,
    ...over,
  }
}

test('zero data: every review is produced, labelled INSUFFICIENT DATA where it must be, and forecasts nothing', () => {
  const d = rv.dailyBrief([], NOW)
  assert.equal(d.kind, 'DAILY BRIEF')
  assert.equal(d.record.evidenceLabel, 'INSUFFICIENT DATA')
  assert.equal(d.record.growth.band, '0–9')
  assert.match(d.record.last7Note, /under the 10-trade bar/)
  assert.ok(d.notes.some((n) => /does not say what the market will do/.test(n)))
  const e = rv.endOfDay([], NOW)
  assert.equal(e.trades.evidenceLabel, 'INSUFFICIENT DATA')
  assert.match(e.trades.note, /quiet day is data too/)
  assert.equal(e.trades.totalR, null)
  const w = rv.weeklyReview([], NOW)
  assert.equal(w.record.evidenceLabel, 'INSUFFICIENT DATA')
  assert.match(w.record.note, /no comparison is stated/)
  assert.equal(w.knowledge.trials, 0)
  for (const r of [JSON.stringify(d), JSON.stringify(e), JSON.stringify(w)]) assert.doesNotMatch(r, /\b(will rally|will drop|expect a|forecast:)\b/i)
})

test('with a record: today\'s closes get post-mortems, no-trades are categorised, last-7 stats appear at the bar, and week-on-week is described not trended', () => {
  const closed: PaperPosition[] = []
  let i = 0
  for (let k = 0; k < 6; k++) closed.push(pos(i++, NOW - 2 * 3_600_000 - k * 600_000)) // today
  for (let k = 0; k < 8; k++) closed.push(pos(i++, NOW - 2 * DAY - k * 3_600_000)) // this week
  for (let k = 0; k < 12; k++) closed.push(pos(i++, NOW - 9 * DAY - k * 3_600_000)) // prior week
  closed.push(pos(i++, NOW - 3_600_000, { exitReason: 'missed', rMultiple: undefined, exit: undefined, outcome: undefined, note: 'risk veto: daily loss limit reached' }))
  closed.push(pos(i++, NOW - 3_500_000, { exitReason: 'missed', rMultiple: undefined, exit: undefined, outcome: undefined, note: 'kill switch engaged' }))

  const e = rv.endOfDay(closed, NOW)
  assert.equal(e.trades.closes.length, 6)
  assert.equal(e.trades.evidenceLabel, 'OBSERVED')
  assert.match(e.trades.note, /is a day, not a sample/)
  assert.equal(e.noTrades.rows.length, 2)
  assert.equal(e.noTrades.byCategory['risk-veto'], 1)
  assert.equal(e.noTrades.byCategory['kill-switch'], 1)

  const d = rv.dailyBrief(closed, NOW)
  assert.equal(d.record.closedTrades, 26)
  assert.equal(d.record.growth.band, '10–49')
  assert.equal(d.record.evidenceLabel, 'OBSERVED', 'fourteen closes in the last seven days clears the bar')
  assert.ok(d.record.last7 && d.record.last7.n === 14)

  const w = rv.weeklyReview(closed, NOW)
  assert.equal(w.record.thisWeek.n, 14)
  assert.equal(w.record.priorWeek.n, 12)
  assert.ok(w.record.thisWeek.stats && w.record.priorWeek.stats)
  assert.match(w.record.note, /a week-on-week change is not a trend/)
  assert.equal(w.record.byStrategy[0].strategyId, 'silver-bullet')
  assert.equal(w.record.byStrategy[0].n, 14)
  assert.ok(w.notes.some((n) => /Parameters unchanged by this review/.test(n)))
})

test('the weekly review runs the reassessment, and the daily brief lists what is due', () => {
  const old = vault.addItem({ kind: 'session-observation', title: 'London old', body: 'x', evidenceLabel: 'OBSERVED', provenance: { source: 'PAPER' }, now: NOW - 2 * vault.REVIEW.afterMs })
  let h = H.createHypothesis({ question: 'Old question?', observation: 'o', hypothesis: 'h', nullHypothesis: 'n', direction: 'positive', dataset: { source: 'PAPER', label: 'PAPER' }, cohortFilters: [], method: 'm', now: NOW - 1000 })
  h = H.saveHypothesis(H.flagForReview(h, 'new trades', NOW - 1000))
  const ancient = H.createHypothesis({ question: 'Ancient question?', observation: 'o', hypothesis: 'h', nullHypothesis: 'n', direction: 'positive', dataset: { source: 'PAPER', label: 'PAPER' }, cohortFilters: [], method: 'm', now: NOW - 2 * H.HYPOTHESIS_REVIEW_MS })
  const w = rv.weeklyReview([], NOW)
  assert.ok(w.reassessment.staleItems.includes(old.id))
  assert.ok(w.reassessment.staleHypotheses.includes(ancient.id), 'a hypothesis past its review date expires into STALE')
  assert.equal(vault.getItem(old.id)!.status, 'STALE')
  const d = rv.dailyBrief([], NOW)
  assert.ok(d.due.staleItems >= 1)
  assert.ok(d.due.hypothesesUnderReview >= 1)
  assert.ok(d.due.items.some((x) => /Hypothesis under review: Old question\?/.test(x)))
  assert.equal(d.study.source.includes('engagement only'), true)
})
