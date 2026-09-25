/**
 * BIG MONEY service: gathers the public record of what large and connected
 * money has disclosed (congress trades, insider Form 4 filings, off-exchange
 * volume) plus the most-traded stocks, a few times a day, and keeps the last
 * result on disk so a restart shows it straight away.
 *
 * Read-only and separate from the engine: nothing here is a signal, and the
 * strategy, risk and execution code never see it.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from '../store.ts'
import type { FetchLike } from '../markets/sources.ts'
import { buildBoard, calendarDay, digest, type CongressTrade, type InsiderTrade, type OffExchange, type TickerBoard } from './parse.ts'
import { fetchCongress, fetchLeaders, fetchOffExchange, fetchQuiverInsiders, fetchSecInsiders, quiverKey, secContact, type Active, type Mover, type SourceState } from './sources.ts'

export const DEFAULT_TICKERS = 'AAPL,NVDA,TSLA,MSFT,AMZN,META,GOOGL,AMD,AVGO,JPM'
const WINDOW_DAYS = 90

export type BigMoneySnapshot = {
  kind: 'BIG MONEY'
  execution: 'READ-ONLY'
  asOf: number
  windowDays: number
  tickers: string[]
  sources: { quiver: SourceState; sec: SourceState; alpaca: SourceState }
  congress: CongressTrade[]
  insiders: InsiderTrade[]
  offExchange: OffExchange[]
  mostActive: Active[]
  gainers: Mover[]
  losers: Mover[]
  board: TickerBoard[]
  digest: string[]
  note: string
}

const NOTE = 'Public disclosures, delayed by law: congress up to 45 days, insiders about two business days, off-exchange volume a day or more. They show what was done, not what will happen, and Mr. Cash does not trade on them.'

export function tickersFromEnv(spec = process.env.MRCASH_BIGMONEY_TICKERS || DEFAULT_TICKERS): string[] {
  return [...new Set(spec.split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)))].slice(0, 25)
}

const within = (d: string | null, since: string) => !!d && d >= since
const overridden = (env: string) => !!process.env[env]

export class BigMoney {
  private snap: BigMoneySnapshot
  private timer: NodeJS.Timeout | null = null
  private running = false
  private seen = new Map<string, InsiderTrade[]>()
  private readonly file: string
  private readonly opts: { everyHours?: number; fetchImpl?: FetchLike; now?: () => number; dir?: string; tickers?: string[]; gapMs?: number }
  constructor(opts: BigMoney['opts'] = {}) {
    this.opts = opts
    this.file = join(opts.dir ?? DATA_DIR, 'bigmoney.json')
    this.snap = this.load() ?? this.empty()
  }

  private now(): number { return (this.opts.now ?? Date.now)() }
  private get tickers(): string[] { return this.opts.tickers ?? tickersFromEnv() }

  private empty(): BigMoneySnapshot {
    const off: SourceState = { status: 'NOT CONNECTED', detail: 'Not checked yet.' }
    return { kind: 'BIG MONEY', execution: 'READ-ONLY', asOf: 0, windowDays: WINDOW_DAYS, tickers: this.tickers, sources: { quiver: off, sec: off, alpaca: off }, congress: [], insiders: [], offExchange: [], mostActive: [], gainers: [], losers: [], board: [], digest: ['Not checked yet.'], note: NOTE }
  }

  private load(): BigMoneySnapshot | null {
    try { if (!existsSync(this.file)) return null; const s = JSON.parse(readFileSync(this.file, 'utf8')); return s?.kind === 'BIG MONEY' ? s : null } catch { return null }
  }

  private save(): void {
    try { mkdirSync(join(this.file, '..'), { recursive: true }); const tmp = this.file + '.tmp'; writeFileSync(tmp, JSON.stringify(this.snap), { mode: 0o600 }); renameSync(tmp, this.file) } catch { /* a failed save must not stop the watch */ }
  }

  snapshot(): BigMoneySnapshot { return this.snap }

  /** Every few hours: filings do not change by the minute. The first run waits a minute so start-up stays quick. */
  start(): void {
    if (this.timer) return
    const every = (this.opts.everyHours ?? 3) * 3_600_000
    const first = setTimeout(() => { void this.refresh().catch(() => {}) }, 60_000)
    first.unref?.()
    this.timer = setInterval(() => { void this.refresh().catch(() => {}) }, every)
    this.timer.unref?.()
  }

  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null } }

  async refresh(): Promise<BigMoneySnapshot> {
    if (this.running) return this.snap
    this.running = true
    try {
      const f = this.opts.fetchImpl
      const now = this.now()
      const since = calendarDay(now - WINDOW_DAYS * 86_400_000)
      const tickers = this.tickers
      const [cg, qi, ox, sec, lead] = await Promise.all([
        fetchCongress(f), fetchQuiverInsiders(f), fetchOffExchange(f),
        fetchSecInsiders(tickers, { days: WINDOW_DAYS, now, seen: this.seen, fetchImpl: f, gapMs: this.opts.gapMs }),
        fetchLeaders(f),
      ])
      const congress = cg.ok ? cg.data.filter((c) => within(c.reported ?? c.traded, since)) : []
      // Prefer SEC's own filings; add Quiver's insider rows only for tickers SEC did not cover.
      const secRows = sec.ok ? sec.data.filter((i) => within(i.date ?? i.filed, since)) : []
      const secTickers = new Set(secRows.map((i) => i.ticker))
      const insiders = [...secRows, ...(qi.ok ? qi.data.filter((i) => !secTickers.has(i.ticker) && within(i.date, since)) : [])]
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      const offExchange = ox.ok ? ox.data : []
      const leaders = lead.ok ? lead.data : { mostActive: [], gainers: [], losers: [], asOf: null }
      const board = buildBoard({ congress, insiders, offExchange, mostActive: leaders.mostActive })
      const q: SourceState = cg.ok || ox.ok || qi.ok
        ? { status: overridden('MRCASH_QUIVER_URL') ? 'OVERRIDE' : 'CONNECTED', detail: `${congress.length} congress trades, ${qi.ok ? qi.data.length : 0} insider rows, ${offExchange.length} off-exchange rows.${cg.ok ? '' : ` Congress: ${cg.state.detail}`}` }
        : cg.state
      this.snap = {
        kind: 'BIG MONEY', execution: 'READ-ONLY', asOf: now, windowDays: WINDOW_DAYS, tickers,
        sources: {
          quiver: quiverKey() ? q : cg.ok ? q : cg.state,
          sec: sec.ok ? { status: overridden('MRCASH_SEC_URL') || overridden('MRCASH_SEC_DATA_URL') ? 'OVERRIDE' : 'CONNECTED', detail: `${secRows.length} Form 4 transactions for ${tickers.length} tickers, as ${secContact()}.` } : sec.state,
          alpaca: lead.ok ? { status: overridden('MRCASH_ALPACA_DATA_URL') ? 'OVERRIDE' : 'CONNECTED', detail: `${leaders.mostActive.length} most-active stocks${leaders.asOf ? `, updated ${leaders.asOf}` : ''}.` } : lead.state,
        },
        congress: congress.sort((a, b) => (b.reported ?? '').localeCompare(a.reported ?? '')).slice(0, 300),
        insiders: insiders.slice(0, 300),
        offExchange: offExchange.slice(0, 200),
        mostActive: leaders.mostActive, gainers: leaders.gainers, losers: leaders.losers,
        board: board.slice(0, 60),
        digest: digest({ congress, insiders, board, days: WINDOW_DAYS }),
        note: NOTE,
      }
      this.save()
      return this.snap
    } finally { this.running = false }
  }
}
