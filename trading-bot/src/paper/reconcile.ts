/**
 * RECONCILIATION — the one thing that may be written to a closed paper record
 * after the fact: the excursions walked from stored candles.
 *
 * The store designates `mae`, `mfe`, `reconciledAt` and `reconciliationNote`
 * as the only fields a closed position may gain (`RECONCILIATION_FIELDS`);
 * every other change throws. This module is the producer those fields were
 * waiting for. It measures an outcome (worst and best move during the life of
 * the trade, in R) — it never touches entry, exit, R or the decision snapshot,
 * and it never estimates: with a candle gap inside the trade the excursion is
 * UNAVAILABLE and says why.
 *
 * Idempotent: a record already reconciled with the same result is left alone.
 */

import { config } from '../../config.ts'
import { excursions } from '../analyst/records.ts'
import type { Excursion } from '../analyst/records.ts'
import type { PaperPosition } from '../paperTrader.ts'
import { store } from '../store.ts'

export type ReconciledPosition = PaperPosition

export type ReconcileResult = { id: string; changed: boolean; mae: Excursion; mfe: Excursion; note: string }

/** Walk the candles between fill and exit and stamp the record. Pure over the candle reader; writes only the reconciliation fields. */
export function reconcileExcursions(p: PaperPosition, opts: { now?: number; candlesBetween?: (symbol: string, interval: string, from: number, to: number) => Array<{ openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volume: number }> } = {}): ReconcileResult | null {
  if (p.status !== 'closed') return null
  const now = opts.now ?? Date.now()
  const read = opts.candlesBetween ?? ((s, i, from, to) => store().candlesBetween(s, i, from, to))
  const missed = p.exitReason === 'missed'
  const filledAt = p.filledAt ?? null
  const closedAt = p.closedAt ?? null
  const candles = !missed && filledAt !== null && closedAt !== null ? read(config.symbol, config.interval, filledAt - 300_000, closedAt) : []
  const ex = excursions({ direction: p.direction, entry: p.entry ?? null, stop: p.stop ?? null, filledAt, closedAt, missed }, candles)
  // The position carries the excursions as numbers in R (null = unavailable) plus a note saying why; the
  // analyst layer rebuilds the labelled Excursion from these (records.ts).
  const note = ex.mae.status === 'OBSERVED' ? `OBSERVED: walked from ${candles.length} stored candle(s) at reconciliation.` : `${ex.mae.status}: ${ex.mae.note}`
  const same = p.reconciledAt !== undefined && p.mae === ex.mae.r && p.mfe === ex.mfe.r && p.reconciliationNote === note
  if (same) return { id: p.id, changed: false, mae: ex.mae, mfe: ex.mfe, note: 'Already reconciled with the same result.' }
  const next: ReconciledPosition = { ...p, mae: ex.mae.r, mfe: ex.mfe.r, reconciledAt: now, reconciliationNote: note }
  store().savePosition(next)
  return { id: p.id, changed: true, mae: ex.mae, mfe: ex.mfe, note }
}
