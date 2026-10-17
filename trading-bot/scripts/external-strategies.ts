/**
 * `npm run research:external -- --dir <folder of BTCUSDT kline CSVs> [--json out.json]`
 *
 * Tests strategies published elsewhere against Kestrel's own bar. Each one is
 * written as a Strategy Builder rule set (src/research/builder.ts) and run on
 * real candles twice:
 *
 *   AS PUBLISHED   no fees, no spread, no slippage (how they were shown)
 *   KESTREL COSTS  the paper engine's fill model: fees, spread, slippage,
 *                  entry on the next candle's open, a stop gapped through
 *                  fills at the open
 *
 * The first 70% of the candles is in-sample and the last 30% out-of-sample;
 * the out-of-sample part is the one that counts. RESEARCH ONLY: this reads
 * CSV files and prints a report. It never touches the store, the engine or an
 * order, and it changes nothing about how Kestrel trades.
 *
 * CSV files: Binance's public kline archive (data.binance.vision, no header;
 * newer files carry microsecond timestamps) or Kestrel's own export
 * (`npm run research:export`, header `open_time_ms,open,…`). File names must
 * carry the interval, e.g. BTCUSDT-15m-2026-09.csv or BTCUSDT_15m.csv.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { backtestSpec } from '../src/research/builder.ts'
import type { BuilderReport, Spec } from '../src/research/builder.ts'
import { defaultAssumptions } from '../src/sim/fills.ts'
import type { ExecutionAssumptions } from '../src/sim/fills.ts'
import type { Candle } from '../src/types.ts'

export type ExternalStrategy = {
  id: string
  name: string
  source: string
  interval: '1m' | '5m' | '15m'
  rules: string
  spec: Spec
  /** What the source showed, as published. */
  published: string
  /** Where this test necessarily differs from the original. */
  differences: string[]
}

const ASTRAL = 'https://heyastral.ai/u/lucas_lalk'

/**
 * The five rule sets on @lucas_lalk's Astral profile that trade Bitcoin and
 * whose rules are public (copied 2026-10-17). His other 27 strategies are
 * source-locked, and five trade stocks or other coins only.
 */
export const ASTRAL_LUCAS_LALK: ExternalStrategy[] = [
  {
    id: 'vwap-5m', name: 'BTCUSD 5m VWAP mean-reversion scalper', source: ASTRAL, interval: '5m',
    rules: 'Buy when price is more than 1.5 volume-weighted deviations below the 20-candle VWAP and trend efficiency(14) is below 25. Sell when price closes back above the VWAP, at +0.5%, or at -0.3%.',
    spec: { direction: 'long', entry: [{ kind: 'vwap-z', bars: 20, op: '<', value: -1.5 }, { kind: 'efficiency', period: 14, op: '<', value: 25 }], exit: [{ kind: 'price-vwap', bars: 20, op: 'above' }], stop: { kind: 'pct', value: 0.3 }, target: { kind: 'pct', value: 0.5 }, maxBars: 288 },
    published: 'BACKTEST, 17 days (2026-09-27 to 2026-10-14), 169 trades, +6.5%, 70.4% wins, 0 bps fees and slippage',
    differences: ['No time limit in the original; here one day (288 candles), rarely reached.'],
  },
  {
    id: 'rsi30-15m', name: 'High Win-Rate RSI Mean Reversion BTC 15m', source: ASTRAL, interval: '15m',
    rules: 'Buy when RSI(14) is below 30. Take profit at +1%, stop at -4%.',
    spec: { direction: 'long', entry: [{ kind: 'rsi', period: 14, op: '<', value: 30 }], exit: [], stop: { kind: 'pct', value: 4 }, target: { kind: 'pct', value: 1 }, maxBars: 2000 },
    published: 'BACKTEST, 90 days (2026-06-19 to 2026-09-17), 32 trades, +9.5%, 93.8% wins, 0 bps fees and slippage',
    differences: ['The original adds 50% of equity on every oversold candle (pyramiding); this holds one position at a time.', 'No time limit in the original; here 2000 candles (about 21 days).'],
  },
  {
    id: 'ema-5-50-15m', name: 'BTCUSD 5/50 EMA Trend Strategy', source: ASTRAL, interval: '15m',
    rules: 'Buy when the 5 EMA crosses above the 50 EMA and price is above the 200 EMA. Sell when the 5 EMA crosses below the 50 EMA.',
    spec: { direction: 'long', entry: [{ kind: 'ma-cross', ma: 'ema', fast: 5, slow: 50, op: 'crossAbove' }, { kind: 'price-ma', ma: 'ema', period: 200, op: 'above' }], exit: [{ kind: 'ma-cross', ma: 'ema', fast: 5, slow: 50, op: 'crossBelow' }], stop: { kind: 'pct', value: 10 }, target: null, maxBars: 2000 },
    published: 'BACKTEST, 50 days (2026-08-04 to 2026-09-23), 51 trades, +38.5%, 33.3% wins, 0 bps fees and slippage',
    differences: ['No stop in the original; here a 10% disaster stop that a 15-minute trend trade rarely reaches.'],
  },
  {
    id: 'red-candle-1m', name: 'BTCUSD 1m Red Candle Mean Reversion (BTC leg)', source: ASTRAL, interval: '1m',
    rules: 'Buy at the open after every red 1-minute candle; sell one candle later.',
    spec: { direction: 'long', entry: [{ kind: 'streak', color: 'red', count: 1 }], exit: [], stop: { kind: 'pct', value: 2 }, target: null, maxBars: 1 },
    published: 'BACKTEST, 3 days (2026-09-18 to 2026-09-21), 13,073 trades across 7 coins, +8.4%; the author notes "crazy returns if no fees or slippage"',
    differences: ['The original trades seven coins at 14% of equity each; this tests the BTC leg.', 'No stop in the original; here a 2% disaster stop that a one-minute hold almost never reaches.'],
  },
  {
    id: 'rsi25-15m', name: 'RSI-MR v23-D4 Universe9 (BTC leg)', source: ASTRAL, interval: '15m',
    rules: 'Buy when RSI(14) is below 25. Take profit at +6%, stop at -1%.',
    spec: { direction: 'long', entry: [{ kind: 'rsi', period: 14, op: '<', value: 25 }], exit: [], stop: { kind: 'pct', value: 1 }, target: { kind: 'pct', value: 6 }, maxBars: 2000 },
    published: 'BACKTEST, 51 days (2026-08-01 to 2026-09-21), 109 trades across 9 coins, +24.9%, 42.2% wins, 0 bps fees and slippage',
    differences: ['The original trades nine coins and adds on repeat signals; this tests the BTC leg one position at a time.', 'No time limit in the original; here 2000 candles (about 21 days).'],
  },
]

const MS: Record<string, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000 }

/** One CSV text → candles. Skips a header row; microsecond timestamps become milliseconds. */
export function parseKlines(text: string, interval: string): Candle[] {
  const step = MS[interval] ?? 0
  const out: Candle[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!/^\d/.test(line)) continue
    const f = line.split(',')
    const ms = (v: number) => (v > 1e14 ? Math.floor(v / 1000) : v)
    const openTime = ms(Number(f[0]))
    const open = Number(f[1]), high = Number(f[2]), low = Number(f[3]), close = Number(f[4]), volume = Number(f[5])
    const ct = Number(f[6])
    const closeTime = Number.isFinite(ct) && ct > 1e11 ? ms(ct) : openTime + step - 1
    if (![openTime, open, high, low, close, volume].every(Number.isFinite) || !(high >= low) || !(open > 0)) continue
    out.push({ openTime, closeTime, open, high, low, close, volume })
  }
  return out
}

/** Every CSV in a folder whose name carries the interval, merged, de-duplicated and in time order. */
export function loadCandles(dir: string, interval: string): Candle[] {
  const tag = new RegExp(`(?:^|[-_])${interval}(?:[-_.])`)
  const byTime = new Map<number, Candle>()
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.csv') && tag.test(n)).sort()) {
    for (const c of parseKlines(readFileSync(join(dir, f), 'utf8'), interval)) byTime.set(c.openTime, c)
  }
  return [...byTime.values()].sort((a, b) => a.openTime - b.openTime)
}

/** The same fills with every cost removed: how the strategies were published. Entry is still on the next candle's open. */
export function asPublished(): ExecutionAssumptions {
  return { ...defaultAssumptions(), spreadBps: 0, slippageBps: 0, targetTouchBps: 0, takerFeePercent: 0, makerFeePercent: 0 }
}

export type RunSummary = {
  trades: number
  oosTrades: number
  oosWinRate: number | null
  oosExpectancyR: number | null
  /** Mean net result per out-of-sample trade, % of entry, after the run's costs. */
  oosAvgPct: number | null
  /** All out-of-sample trades compounded at full size, %. */
  oosCompoundPct: number | null
  holdOosPct: number | null
  verdict: BuilderReport['verdict']
  deflated: string | null
  stable: BuilderReport['stable']
}

export function summarise(r: BuilderReport): RunSummary {
  const oos = r.trades.filter((t) => t.sample === 'OUT-OF-SAMPLE')
  const pct = oos.map((t) => t.pnlUsd / t.entry)
  const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d
  return {
    trades: r.trades.length,
    oosTrades: oos.length,
    oosWinRate: r.outOfSample.winRate === null ? null : round(r.outOfSample.winRate * 100, 1),
    oosExpectancyR: r.outOfSample.expectancyR === null ? null : round(r.outOfSample.expectancyR, 3),
    oosAvgPct: pct.length ? round((pct.reduce((a, b) => a + b, 0) / pct.length) * 100, 3) : null,
    oosCompoundPct: pct.length ? round((pct.reduce((a, b) => a * (1 + b), 1) - 1) * 100, 1) : null,
    holdOosPct: r.holdOosPct,
    verdict: r.verdict,
    deflated: r.deflated ? r.deflated.verdict : null,
    stable: r.stable,
  }
}

export function runAll(dir: string, list: ExternalStrategy[] = ASTRAL_LUCAS_LALK) {
  const cache = new Map<string, Candle[]>()
  const trials = list.length
  return list.map((s) => {
    if (!cache.has(s.interval)) cache.set(s.interval, loadCandles(dir, s.interval))
    const candles = cache.get(s.interval)!
    if (candles.length < 500) return { strategy: s, candles: candles.length, from: null, to: null, published: null, kestrel: null }
    const pub = backtestSpec(s.spec, candles, { a: asPublished(), trials, interval: s.interval })
    const kes = backtestSpec(s.spec, candles, { trials, interval: s.interval })
    return { strategy: s, candles: candles.length, from: candles[0].openTime, to: candles[candles.length - 1].closeTime, published: summarise(pub), kestrel: summarise(kes), line: kes.line }
  })
}

function main(): void {
  const argv = process.argv.slice(2)
  const get = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined }
  const dir = get('--dir')
  if (!dir) { console.error('Usage: npm run research:external -- --dir <folder of BTCUSDT kline CSVs> [--json out.json]'); process.exit(1) }
  const results = runAll(dir)
  const day = (t: number | null) => (t === null ? '—' : new Date(t).toISOString().slice(0, 10))
  const f = (v: number | null, unit = '') => (v === null ? '—' : `${v}${unit}`)
  console.log('BACKTEST · research only · nothing here trades\n')
  for (const r of results) {
    console.log(`${r.strategy.name}  [${r.strategy.interval}]  ${r.candles.toLocaleString()} candles, ${day(r.from)} to ${day(r.to)}`)
    console.log(`  rules      ${r.strategy.rules}`)
    console.log(`  published  ${r.strategy.published}`)
    if (!r.kestrel || !r.published) { console.log('  NOT ENOUGH DATA: fewer than 500 candles for this interval.\n'); continue }
    for (const [label, s] of [['as published', r.published], ['Kestrel costs', r.kestrel]] as const) {
      console.log(`  ${label.padEnd(13)} out-of-sample ${s.oosTrades} trades · wins ${f(s.oosWinRate, '%')} · ${f(s.oosExpectancyR, 'R')} per trade · ${f(s.oosAvgPct, '%')} per trade · compounded ${f(s.oosCompoundPct, '%')} (holding BTC: ${f(s.holdOosPct, '%')}) · ${s.verdict}`)
    }
    console.log(`  verdict    ${r.line}`)
    for (const d of r.strategy.differences) console.log(`  differs    ${d}`)
    console.log('')
  }
  const out = get('--json')
  if (out) { writeFileSync(out, JSON.stringify({ label: 'BACKTEST', generatedAt: new Date().toISOString(), results }, null, 2)); console.log(`Wrote ${out}`) }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
