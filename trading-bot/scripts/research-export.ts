/**
 * `npm run research:export -- --symbol BTCUSDT --interval 5m`
 *
 * Copies the candles Mr. Cash has already stored into a CSV for the Python
 * research tools in research/ (vectorbt, hftbacktest). The database is opened
 * READ-ONLY, so it is safe to run while the bot is running, and it never
 * fetches anything: what is exported is exactly what the bot recorded.
 *
 * Output: research/data/<SYMBOL>_<interval>.csv with a header row
 *   open_time_ms,open,high,low,close,volume,source
 */
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DB_PATH } from '../src/store.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function parseArgs(argv: string[]): { symbol: string; interval: string; out: string | null; db: string } {
  const get = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined }
  const symbol = String(get('--symbol') ?? 'BTCUSDT').toUpperCase()
  const interval = String(get('--interval') ?? '5m')
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) throw new Error(`Not a symbol: ${symbol}`)
  if (!/^\d+[mhdw]$/.test(interval)) throw new Error(`Not an interval: ${interval} (use 1m, 5m, 1h, 1d …)`)
  return { symbol, interval, out: get('--out') ?? null, db: get('--db') ?? DB_PATH }
}

export function toCsv(rows: Array<{ openTime: number; open: number; high: number; low: number; close: number; volume: number; source: string }>): string {
  return ['open_time_ms,open,high,low,close,volume,source', ...rows.map((r) => [r.openTime, r.open, r.high, r.low, r.close, r.volume, String(r.source).replace(/[,\r\n]/g, ' ')].join(','))].join('\n') + '\n'
}

function main(): void {
  const a = parseArgs(process.argv.slice(2))
  if (!existsSync(a.db)) { console.error(`No database at ${a.db}. Run the bot once first (it stores candles as it watches), or pass --db.`); process.exit(1) }
  const db = new DatabaseSync(a.db, { readOnly: true })
  try {
    const rows = db.prepare('SELECT open_time AS openTime, open, high, low, close, volume, source FROM candles WHERE symbol = ? AND interval = ? ORDER BY open_time').all(a.symbol, a.interval) as unknown as Parameters<typeof toCsv>[0]
    if (!rows.length) { console.error(`No ${a.symbol} ${a.interval} candles stored yet. Let the bot run for a while first.`); process.exit(1) }
    const out = a.out ?? join(ROOT, 'research', 'data', `${a.symbol}_${a.interval}.csv`)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, toCsv(rows))
    const sources = [...new Set(rows.map((r) => r.source))].join(', ')
    console.log(`Exported ${rows.length} ${a.symbol} ${a.interval} candles (${new Date(rows[0].openTime).toISOString()} to ${new Date(rows[rows.length - 1].openTime).toISOString()}) to ${out}. Source: ${sources}.`)
  } finally { db.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
