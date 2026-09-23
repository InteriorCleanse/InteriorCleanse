/**
 * Scoring a genome is just running the Phase 13 backtester with that genome's
 * parameters in force. The out-of-sample section is the whole point — an
 * evaluation carries the full report so selection can read the number the
 * genome never got to fit on.
 *
 * The backtest function is injectable so the factory's logic can be tested
 * without a month of candles: a test passes a stub that returns a report it
 * built by hand, and the campaign and selection behave identically.
 */

import { runBacktest } from '../backtest/runner.ts'
import type { BacktestReport } from '../backtest/report.ts'
import { genomeId } from './genome.ts'
import type { Genome } from './genome.ts'

export type GenomeEvaluation = {
  id: string
  genome: Genome
  report: BacktestReport
}

/** How a genome gets scored. The real one runs the backtester; tests inject their own. */
export type BacktestFn = (strategyId: string, params: Record<string, number>) => Promise<BacktestReport>

/** The production scorer: a real backtest with the genome's parameters applied. */
export const realBacktest: BacktestFn = (strategyId, params) => runBacktest(strategyId, { params })

/** Score one genome. */
export async function evaluateGenome(genome: Genome, backtest: BacktestFn = realBacktest): Promise<GenomeEvaluation> {
  const report = await backtest(genome.strategyId, genome.params)
  return { id: genomeId(genome), genome, report }
}
