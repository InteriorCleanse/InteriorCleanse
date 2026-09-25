/**
 * MARKET WATCH — the service. READ-ONLY.
 *
 * Watches every market on the list around the clock: one bounded refresh every
 * few minutes (unref'd, so it never keeps the process alive), each source
 * isolated so one feed failing cannot blank the others, and each new
 * observation raised once in the app's bell.
 *
 * It does not trade and cannot: there is no order path in src/markets, the
 * engine's own BTCUSDT loop is untouched, and nothing here feeds a strategy,
 * the risk engine or the paper record. It is the "watch, scan, alert" half of
 * the loop; analysing, planning, risk and the journal stay with you and with
 * the engine's paper desk.
 */
import type { Candle } from '../types.ts'
import { fetchCrypto, fetchForex, fetchStocks, parseWatchlist, sourceOverrides, type FetchResult, type MarketKind, type SourceId, type WatchItem } from './sources.ts'
import { scanMarket, type MarketScan } from './scan.ts'

export type MarketRow = WatchItem & {
  scan: MarketScan
  /** Where the numbers came from, spelled out for the page. */
  provenance: 'LIVE DATA' | 'DELAYED FEED' | 'OVERRIDE' | 'NOT CONNECTED' | 'UNAVAILABLE'
  feed: string
  error: string | null
  checkedAt: number
}

export type MarketsSnapshot = {
  kind: 'MARKET WATCH'
  execution: 'READ-ONLY'
  asOf: number
  everyMinutes: number
  rows: MarketRow[]
  groups: Array<{ kind: MarketKind; label: string; rows: number; live: number; signals: number; setups: number; top: string | null }>
  /** The scan overview: markets watched, observations on the board, alerts raised in 24h, markets where 4+ of 5 checks line up. */
  overview: { markets: number; signals: number; alerts24h: number; setups: number }
  note: string
}

type Fetchers = {
  crypto: (symbol: string) => Promise<FetchResult>
  forex: (symbol: string) => Promise<FetchResult>
  stocks: (symbols: string[], now: number) => Promise<Record<string, FetchResult>>
}

const GROUP_LABEL: Record<MarketKind, string> = { crypto: 'Crypto', stock: 'Stocks', forex: 'Forex', index: 'Indexes & funds' }
const FEED: Record<SourceId, string> = {
  binance: 'Binance public candles',
  kraken: "Kraken's public FX book (a crypto venue's rate, not interbank)",
  alpaca: 'Alpaca IEX feed (one exchange, a small slice of volume)',
}

export class MarketWatch {
  private rows: MarketRow[] = []
  /** The last closed candles per market, kept in memory for the pattern scanner; never sent in the snapshot. */
  private candleCache = new Map<string, Candle[]>()
  private asOf = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private running: Promise<MarketsSnapshot> | null = null
  private raised = new Set<string>()
  private primed = false
  private alertTimes: number[] = []
  readonly list: WatchItem[]

  private readonly opts: {
    everyMinutes?: number
    alert?: (title: string, body: string) => void
    fetchers?: Partial<Fetchers>
    watchlist?: WatchItem[]
    now?: () => number
  }

  constructor(opts: MarketWatch['opts'] = {}) {
    this.opts = opts
    this.list = opts.watchlist ?? parseWatchlist()
  }

  get everyMinutes(): number { return this.opts.everyMinutes ?? 5 }
  private now(): number { return (this.opts.now ?? Date.now)() }

  /** Start the background loop. Safe to call twice. */
  start(): void {
    if (this.timer) return
    void this.refresh().catch(() => {})
    this.timer = setInterval(() => { void this.refresh().catch(() => {}) }, this.everyMinutes * 60_000)
    this.timer.unref?.()
  }

  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null } }

  snapshot(): MarketsSnapshot {
    const groups = (['crypto', 'stock', 'forex', 'index'] as MarketKind[])
      .map((k) => {
        const rs = this.rows.filter((r) => r.kind === k)
        const lined = rs.filter((r) => r.scan.setup && r.scan.setup.aligned >= 4).sort((a, b) => b.scan.setup!.aligned - a.scan.setup!.aligned)
        const newest = rs.flatMap((r) => r.scan.notes.map((x) => ({ x, r }))).sort((a, b) => b.x.at - a.x.at)[0]
        const top = lined[0] ? `${lined[0].label}: ${lined[0].scan.setup!.summary}` : newest ? `${newest.r.label}: ${newest.x.kind.replace('-', ' ')}` : null
        return { kind: k, label: GROUP_LABEL[k], rows: rs.length, live: rs.filter((r) => r.scan.status === 'live').length, signals: rs.reduce((n, r) => n + r.scan.notes.length, 0), setups: lined.length, top }
      })
      .filter((g) => g.rows > 0)
    return {
      kind: 'MARKET WATCH',
      execution: 'READ-ONLY',
      asOf: this.asOf,
      everyMinutes: this.everyMinutes,
      rows: this.rows,
      groups,
      overview: {
        markets: this.rows.length,
        signals: this.rows.reduce((n, r) => n + r.scan.notes.length, 0),
        alerts24h: this.alertTimes.filter((t) => this.now() - t < 24 * 3_600_000).length,
        setups: this.rows.filter((r) => r.scan.setup && r.scan.setup.aligned >= 4).length,
      },
      note: this.asOf
        ? 'Observations, not signals: Mr. Cash watches these markets and tells you what changed. He paper-trades only the engine\'s own market, and nothing here can place an order.'
        : 'First look still running.',
    }
  }

  /** The candles behind one row ("stock:NVDA"), for the pattern scanner. Empty until the first refresh. */
  candles(key: string): Candle[] { return this.candleCache.get(key) ?? [] }

  /** Refresh every market once. Concurrent callers share one run. */
  refresh(): Promise<MarketsSnapshot> {
    if (!this.running) this.running = this.run().finally(() => { this.running = null })
    return this.running
  }

  private async run(): Promise<MarketsSnapshot> {
    const now = this.now()
    const f: Fetchers = {
      crypto: this.opts.fetchers?.crypto ?? ((s) => fetchCrypto(s)),
      forex: this.opts.fetchers?.forex ?? ((s) => fetchForex(s)),
      stocks: this.opts.fetchers?.stocks ?? ((s, t) => fetchStocks(s, t)),
    }
    const overrides = sourceOverrides()
    const stockSyms = this.list.filter((w) => w.source === 'alpaca').map((w) => w.symbol)
    const [stockResults, others] = await Promise.all([
      f.stocks(stockSyms, now).catch((e): Record<string, FetchResult> => Object.fromEntries(stockSyms.map((s) => [s, { ok: false, reason: String(e) }]))),
      Promise.all(this.list.filter((w) => w.source !== 'alpaca').map(async (w) => [w, await (w.source === 'binance' ? f.crypto(w.symbol) : f.forex(w.symbol)).catch((e): FetchResult => ({ ok: false, reason: String(e) }))] as const)),
    ])
    const results = new Map<WatchItem, FetchResult>(others)
    for (const w of this.list) if (w.source === 'alpaca') results.set(w, stockResults[w.symbol] ?? { ok: false, reason: 'no result' })

    this.rows = this.list.map((w) => {
      const r = results.get(w)!
      const candles: Candle[] = r.ok ? r.candles : []
      this.candleCache.set(`${w.kind}:${w.symbol}`, candles)
      const scan = scanMarket(candles, w.kind, w.symbol, now)
      const notConnected = !r.ok && /not connected/i.test(r.reason)
      const provenance: MarketRow['provenance'] = !r.ok ? (notConnected ? 'NOT CONNECTED' : 'UNAVAILABLE')
        : overrides[w.source] ? 'OVERRIDE'
        : w.source === 'alpaca' ? 'DELAYED FEED'
        : 'LIVE DATA'
      return { ...w, scan, provenance, feed: overrides[w.source] ? `${FEED[w.source]} — pointed at an override URL, not the real venue` : FEED[w.source], error: r.ok ? null : r.reason, checkedAt: now }
    })
    this.asOf = now
    this.raiseAlerts(now)
    return this.snapshot()
  }

  /** Each observation reaches the bell once, and only while it is fresh. */
  private raiseAlerts(now: number): void {
    const first = !this.primed
    this.primed = true
    for (const row of this.rows) {
      for (const note of row.scan.notes) {
        if (this.raised.has(note.key)) continue
        this.raised.add(note.key)
        // The first pass after start-up only learns what is already on the board;
        // replaying hours of old observations into the bell would be noise.
        if (first || now - note.at > 3 * 3_600_000) continue
        this.opts.alert?.(`${row.label}: ${note.kind === 'setup' ? 'checks line up' : note.kind.replace('-', ' ')}`, note.text)
        this.alertTimes.push(now)
      }
    }
    if (this.raised.size > 5000) this.raised = new Set([...this.raised].slice(-2000))
    this.alertTimes = this.alertTimes.filter((t) => now - t < 24 * 3_600_000)
  }
}
