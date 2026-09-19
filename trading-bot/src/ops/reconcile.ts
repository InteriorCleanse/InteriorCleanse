/**
 * TRADE RECONCILIATION — does every stored paper trade agree with itself?
 *
 * For each closed paper trade the report checks, from the stored record, the
 * ledger and the stored candles, and never from the engine:
 *
 *   - exactly one open and one close (a fill time, a close time, in order)
 *   - the entry and the exit match what the fill model says they may be
 *     (a target fills at the target; a stop fills at or through the stop)
 *   - R, PnL and fees recomputed with `closeMetrics` equal the stored values
 *   - MAE / MFE recomputed from the candles equal the stored reconciliation
 *   - the decision snapshot, the engine and feature versions, the session,
 *     the regime and the trading day were preserved on the record
 *   - the ledger holds exactly one row for the close
 *
 * The verdict per trade is CONSISTENT, MISMATCH (a stored figure differs from
 * the recomputation) or INCOMPLETE (a field the check needs is missing, which
 * is legitimate for records written before that field existed and is reported
 * as such, not as a fault). Nothing here modifies a record: reconciliation
 * reads; `paper/reconcile.ts` is the only writer of the excursion fields.
 */

import { config } from '../../config.ts'
import { excursions } from '../analyst/records.ts'
import { closeMetrics, readPositions } from '../paperTrader.ts'
import type { PaperPosition } from '../paperTrader.ts'
import { tradingDayKey } from '../sessions.ts'
import { classifyOutcome } from '../sim/trades.ts'
import { store } from '../store.ts'
import type { LedgerRow } from '../types.ts'

export type ReconcileCheck = { name: string; ok: boolean; expected: string; actual: string; note: string }
export type TradeVerdict = 'CONSISTENT' | 'MISMATCH' | 'INCOMPLETE'
export type TradeReconciliation = { id: string; closedAt: number | null; verdict: TradeVerdict; checks: ReconcileCheck[]; incomplete: string[] }

export type ReconciliationReport = {
  at: number
  total: number
  consistent: number
  mismatched: number
  incomplete: number
  byCheck: Record<string, { ok: number; failed: number; skipped: number }>
  /** The trades that did not reconcile, in full; consistent trades are counted only. */
  problems: TradeReconciliation[]
  ledger: { closes: number; rowsForCloses: number; missedRows: number }
  note: string
}

const KEY = 'ops:reconciliation'
const EPS = 1e-6
const near = (a: number, b: number, eps = EPS) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b))
const fmt = (x: number | null | undefined) => (x === null || x === undefined ? '—' : Number.isInteger(x) ? String(x) : x.toFixed(6))

type CandleReader = (symbol: string, interval: string, from: number, to: number) => Array<{ openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volume: number }>

/** Reconcile one closed, filled paper trade. Pure over the readers given. */
export function reconcileTrade(p: PaperPosition, opts: { ledger?: LedgerRow[]; candlesBetween?: CandleReader } = {}): TradeReconciliation {
  const checks: ReconcileCheck[] = []
  const incomplete: string[] = []
  const add = (name: string, ok: boolean, expected: string, actual: string, note = '') => { checks.push({ name, ok, expected, actual, note }) }
  const skip = (name: string, why: string) => { incomplete.push(`${name}: ${why}`) }

  // 1. One open, one close.
  const filledAt = p.filledAt ?? null
  const closedAt = p.closedAt ?? null
  if (filledAt === null) skip('one open, one close', 'no fill time on the record')
  else if (closedAt === null) skip('one open, one close', 'no close time on the record')
  else add('one open, one close', closedAt > filledAt && p.status === 'closed', 'fill before close, status closed', `filled ${new Date(filledAt).toISOString()}, closed ${new Date(closedAt).toISOString()}, status ${p.status}`)
  const reason = p.exitReason
  add('exit reason', reason === 'target' || reason === 'stop' || reason === 'time' || reason === 'manual', 'target | stop | time | manual', String(reason ?? 'missing'))

  // 2. Entry and exit against the fill model's rules.
  const exit = p.exit ?? null
  if (exit === null) skip('exit price', 'no exit on the record')
  else {
    const long = p.direction === 'long'
    if (reason === 'target') add('exit matches the fill model', near(exit, p.target), `target ${fmt(p.target)} (a resting limit fills at its price)`, fmt(exit))
    else if (reason === 'stop') add('exit matches the fill model', long ? exit <= p.stop + EPS * Math.max(1, p.stop) : exit >= p.stop - EPS * Math.max(1, p.stop), `${long ? 'at or below' : 'at or above'} stop ${fmt(p.stop)} (a stop is a market order and pays spread and slippage)`, fmt(exit))
    else add('exit matches the fill model', Number.isFinite(exit) && exit > 0, 'a positive price', fmt(exit), `${reason} exits fill at the candle close plus costs; the record cannot be checked against a level.`)
  }
  add('entry is a positive price and the stop is on the correct side', Number.isFinite(p.entry) && p.entry > 0 && (p.direction === 'long' ? p.stop < p.entry : p.stop > p.entry), `${p.direction}: stop ${p.direction === 'long' ? 'below' : 'above'} entry`, `entry ${fmt(p.entry)}, stop ${fmt(p.stop)}`)

  // 3. R, PnL, fees and outcome recomputed.
  if (exit !== null && reason && reason !== 'missed') {
    const m = closeMetrics(p, exit, reason)
    if (p.rMultiple === undefined) skip('R recomputed', 'no R on the record')
    else add('R recomputed', near(m.rMultiple, p.rMultiple, 1e-4), fmt(m.rMultiple), fmt(p.rMultiple), 'closeMetrics over the stored entry, stop, exit and quantity, with the current execution assumptions.')
    if (p.pnlUsd === undefined) skip('PnL recomputed', 'no PnL on the record')
    else add('PnL recomputed', near(m.pnlUsd, p.pnlUsd, 1e-4), fmt(m.pnlUsd), fmt(p.pnlUsd), 'A difference here with R consistent means the fee assumptions changed after the trade; the record keeps the fees it paid.')
    if (p.feesUsd === undefined) skip('fees recomputed', 'no fees on the record')
    else add('fees recomputed', near(m.feesUsd, p.feesUsd, 1e-4), fmt(m.feesUsd), fmt(p.feesUsd))
    if (p.outcome === undefined) skip('outcome', 'no outcome on the record (written before the field existed)')
    else add('outcome matches the canonical rule', classifyOutcome(m.pnlPercent) === p.outcome, classifyOutcome(m.pnlPercent), p.outcome)
  }

  // 4. MAE / MFE against a fresh walk of the candles.
  if (p.reconciledAt === undefined) skip('MAE/MFE', 'not yet reconciled (the observer reconciles closed trades on its next cycle)')
  else if (filledAt !== null && closedAt !== null) {
    const read = opts.candlesBetween ?? ((s, i, from, to) => store().candlesBetween(s, i, from, to))
    const candles = read(config.symbol, config.interval, filledAt - 300_000, closedAt)
    const ex = excursions({ direction: p.direction, entry: p.entry, stop: p.stop, filledAt, closedAt, missed: false }, candles)
    const same = (a: number | null | undefined, b: number | null) => (a ?? null) === null ? b === null : b !== null && near(a as number, b, 1e-6)
    add('MAE/MFE recomputed from stored candles', same(p.mae, ex.mae.r) && same(p.mfe, ex.mfe.r), `MAE ${fmt(ex.mae.r)} MFE ${fmt(ex.mfe.r)} (${ex.mae.status})`, `MAE ${fmt(p.mae)} MFE ${fmt(p.mfe)}`, ex.mae.status === 'OBSERVED' ? `Walked over ${candles.length} candle(s).` : ex.mae.note)
  }

  // 5. Preserved context.
  if (!p.snapshot) skip('decision snapshot preserved', 'no snapshot on the record (written before the field existed)')
  else {
    add('decision snapshot preserved', typeof p.snapshot.signalId === 'string' && p.snapshot.signalId.length > 0 && typeof p.snapshot.engineVersion === 'string' && typeof p.snapshot.featureVersion === 'number', 'signalId, engineVersion, featureVersion', `${p.snapshot.signalId || '—'}, ${p.snapshot.engineVersion || '—'}, ${p.snapshot.featureVersion}`)
    add('snapshot carries no outcome', !('outcome' in p.snapshot) && !('rMultiple' in p.snapshot) && !('exit' in p.snapshot), 'no outcome, R or exit inside the decision-time snapshot', 'none', 'Future information must not leak into what the engine could see when it decided.')
  }
  add('session preserved', typeof p.session === 'string' && p.session.length > 0, 'a session name', p.session || '—')
  if (p.regime === undefined) skip('regime preserved', 'not recorded: the tape was not trusted enough to classify at the decision, or the record predates the field')
  else add('regime preserved', typeof p.regime === 'string' && p.regime.length > 0, 'a regime label', p.regime)
  add('trading day matches the decision time', p.dayKey === tradingDayKey(p.openedAt), tradingDayKey(p.openedAt), p.dayKey)
  if (p.strategyId === undefined) skip('strategy preserved', 'no strategy id on the record')
  else add('strategy preserved', p.strategyId.length > 0, 'a strategy id', p.strategyId)

  // 6. Exactly one ledger row for the close.
  if (closedAt !== null) {
    const rows = (opts.ledger ?? store().readLedger()).filter((r) => r.mode === 'live-paper' && r.action !== 'SKIP' && r.timestamp === new Date(closedAt).toISOString() && near(r.price, p.entry, 1e-9) && near(r.quantity, p.quantity, 1e-9))
    add('one ledger row for the close', rows.length === 1, '1', String(rows.length), rows.length === 0 ? 'The ledger has no row for this close (records migrated from files may predate the store).' : rows.length > 1 ? 'Duplicate ledger rows for one close.' : `${rows[0].action} ${rows[0].outcome}`)
  }

  const failed = checks.filter((c) => !c.ok)
  const verdict: TradeVerdict = failed.length ? 'MISMATCH' : incomplete.length ? 'INCOMPLETE' : 'CONSISTENT'
  return { id: p.id, closedAt, verdict, checks, incomplete }
}

/** Reconcile every closed, filled paper trade and store the summary. */
export function reconciliationReport(opts: { now?: number; limit?: number; persist?: boolean } = {}): ReconciliationReport {
  const now = opts.now ?? Date.now()
  const closed = readPositions().closed.filter((p) => p.exitReason !== 'missed')
  const recent = opts.limit ? closed.slice(-opts.limit) : closed
  const ledger = store().readLedger()
  const byCheck: ReconciliationReport['byCheck'] = {}
  const problems: TradeReconciliation[] = []
  let consistent = 0, mismatched = 0, incomplete = 0
  for (const p of recent) {
    const r = reconcileTrade(p, { ledger })
    for (const c of r.checks) { const b = (byCheck[c.name] ??= { ok: 0, failed: 0, skipped: 0 }); if (c.ok) b.ok++; else b.failed++ }
    for (const s of r.incomplete) { const name = s.split(':')[0]; const b = (byCheck[name] ??= { ok: 0, failed: 0, skipped: 0 }); b.skipped++ }
    if (r.verdict === 'CONSISTENT') consistent++
    else { if (r.verdict === 'MISMATCH') mismatched++; else incomplete++; if (problems.length < 50) problems.push(r) }
  }
  const closeRows = ledger.filter((r) => r.mode === 'live-paper' && r.action !== 'SKIP').length
  const missedRows = ledger.filter((r) => r.mode === 'live-paper' && r.action === 'SKIP').length
  const report: ReconciliationReport = {
    at: now, total: recent.length, consistent, mismatched, incomplete, byCheck, problems,
    ledger: { closes: closed.length, rowsForCloses: closeRows, missedRows },
    note: recent.length === 0 ? 'No closed paper trade to reconcile yet.' : mismatched === 0 ? `${consistent} of ${recent.length} closed trade(s) reconcile; ${incomplete} lack a field the check needs (reported, not faulted).` : `${mismatched} of ${recent.length} closed trade(s) disagree with a recomputation — see problems.`,
  }
  if (opts.persist !== false) { try { store().setJson(KEY, report) } catch { /* the report is a reading; the store failing is reported by the health check */ } }
  return report
}

export function lastReconciliation(): ReconciliationReport | null { return store().getJson<ReconciliationReport>(KEY) }
