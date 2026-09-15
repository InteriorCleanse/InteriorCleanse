/**
 * The backtest runner: produce a trade list for a strategy (or the fused
 * decision) over the stored candles, then hand it to the report builder for
 * the in-sample / out-of-sample / walk-forward / Monte-Carlo split.
 *
 * The trades come from the same honest simulator the look-back test uses, so
 * a backtest is a replay looked at through the lens of "what did it do on the
 * part it never saw?".
 */

import { config } from '../../config.ts'
import { runStrategyReplay, runFusedReplay } from '../replay.ts'
import { strategyIds, metaById } from '../strategies/registry.ts'
import { buildReport } from './report.ts'
import type { BacktestOptions, BacktestReport } from './report.ts'

/** `id` is a strategy id or the pseudo-id `fused`. */
export async function runBacktest(id: string, opts: BacktestOptions = {}): Promise<BacktestReport> {
  if (id !== 'fused' && !strategyIds().includes(id)) throw new Error(`Unknown strategy "${id}". Known: ${strategyIds().join(', ')}, fused`)

  // Order-flow strategies read the live trade tape, which historical candles
  // cannot reconstruct. Rather than backtest them on a candle approximation and
  // quote a number that never happened, we say so plainly and score nothing.
  if (id !== 'fused' && metaById().get(id)?.needsTape) {
    return buildReport(id, [], {
      notBacktestable: 'This is an order-flow strategy — it can only vote with the live trade tape, and historical candles cannot reconstruct it. It is not backtestable outside a recorded tape window, so no out-of-sample number is quoted here (a candle approximation would be a number that never happened).',
    })
  }

  const result = id === 'fused' ? await runFusedReplay({ useMemory: false, writeMemory: false }) : await runStrategyReplay(id, { useMemory: false, writeMemory: false })
  return buildReport(id, result.trades, {
    trainPct: config.backtest.trainPct,
    validationPct: config.backtest.validationPct,
    walkForward: config.backtest.walkForward,
    monteCarloSamples: config.backtest.monteCarloSamples,
    ...opts,
  })
}

/** Every enabled strategy plus the fused decision, backtested over the same window. */
export async function backtestAll(opts: BacktestOptions = {}): Promise<BacktestReport[]> {
  const ids = [...strategyIds(), 'fused']
  const out: BacktestReport[] = []
  for (const id of ids) out.push(await runBacktest(id, opts))
  return out
}
