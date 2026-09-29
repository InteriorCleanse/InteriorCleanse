/**
 * THE STOCK DESK, RUNNING — the owner's momentum / relative-strength strategy on
 * its own clock, with its own PAPER account.
 *
 *   8:15 CT          premarket scan: the market check, catalyst days, a watch list
 *   8:30-3:00 CT     every 15 minutes: stops first, then positions, then new buys
 *   otherwise        sleep in about-an-hour steps that land on the next 8:15 scan
 *
 * PAPER ONLY. Fills are simulated at the last 15-minute close with a small
 * slippage cost; there is no broker, no Robinhood connection and no order path.
 * The engine that paper-trades Bitcoin is untouched by anything here.
 */
import { store } from '../store.ts'
import type { Candle, Headline } from '../types.ts'
import { ALL_SYMBOLS, MARKET_CHECK, STOCK_OF, THEME_ETF, THEME_LABEL, UNIVERSE } from './universe.ts'
import type { Theme } from './universe.ts'
import { catalystDay, dailyStats, evaluate, intraday, manage, nextWake, phase, regime, themeBoard } from './rules.ts'
import type { CatalystDay, Evaluation, Phase, Position, Quote, Regime, Report, ThemeRow } from './rules.ts'

type Fetch = (symbols: string[], timeframe: '1Day' | '15Min', start: number) => Promise<{ ok: true; feed: 'sip' | 'iex'; bars: Record<string, Candle[]> } | { ok: false; reason: string }>

export type StockDeskDeps = {
  fetchBars: Fetch
  headlines: () => Promise<Headline[] | null>
  alert?: (title: string, body: string) => void
  now?: () => number
  bankroll?: number
}

export type Fill = { at: number; symbol: string; side: 'BUY' | 'SELL'; qty: number; price: number; why: string; pnl?: number }
export type Cycle = { at: number; phase: Phase; regime: string; lines: string[] }

type State = {
  startEquity: number
  cash: number
  positions: Position[]
  fills: Fill[]
  cycles: Cycle[]
  reports: Array<Report & { at: number }>
  equity: Array<{ t: number; v: number }>
  marks: Record<string, number>
  lastCheck: number
  nextWake: number
  paused: boolean
  scan: { at: number; phase: Phase; feed: string; regime: Regime; board: ThemeRow[]; catalyst: CatalystDay | null; evaluations: Evaluation[]; dataNote: string } | null
}

const KEY = 'stocks:state'
const SLIP = 0.0005 // 5 basis points each way
const DAY = 86_400_000

export class StockDesk {
  private readonly deps: StockDeskDeps
  private state: State
  private running = false
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(deps: StockDeskDeps) {
    this.deps = deps
    const bank = deps.bankroll && deps.bankroll > 0 ? deps.bankroll : 10_000
    const s = store().getJson<Partial<State>>(KEY) ?? {}
    this.state = {
      startEquity: s.startEquity ?? bank, cash: s.cash ?? bank, positions: s.positions ?? [], fills: s.fills ?? [], cycles: s.cycles ?? [],
      reports: s.reports ?? [], equity: s.equity ?? [], marks: s.marks ?? {}, lastCheck: s.lastCheck ?? 0, nextWake: s.nextWake ?? 0,
      paused: s.paused ?? false, scan: s.scan ?? null,
    }
  }

  private now(): number { return this.deps.now ? this.deps.now() : Date.now() }
  private save(): void { try { store().setJson(KEY, this.state) } catch { /* kept in memory until the store answers */ } }
  private log(ph: Phase, reg: string, lines: string[]): void {
    this.state.cycles = [...this.state.cycles, { at: this.now(), phase: ph, regime: reg, lines }].slice(-300)
  }

  equityNow(): number {
    return this.state.cash + this.state.positions.reduce((a, p) => a + p.qty * (this.state.marks[p.symbol] ?? p.entry), 0)
  }

  private fill(symbol: string, side: 'BUY' | 'SELL', qty: number, price: number, why: string, pnl?: number): Fill {
    const f: Fill = { at: this.now(), symbol, side, qty: Math.round(qty * 1000) / 1000, price: Math.round(price * 100) / 100, why, pnl: pnl === undefined ? undefined : Math.round(pnl * 100) / 100 }
    this.state.fills = [...this.state.fills, f].slice(-500)
    return f
  }

  /** Build the quotes: daily history for the trend, 15-minute bars for today. */
  private async quotes(now: number): Promise<{ q: Record<string, Quote>; feed: 'sip' | 'iex'; note: string } | { error: string }> {
    const [daily, intra] = await Promise.all([
      this.deps.fetchBars(ALL_SYMBOLS, '1Day', now - 110 * DAY),
      this.deps.fetchBars(ALL_SYMBOLS, '15Min', now - 4 * DAY),
    ])
    if (!daily.ok) return { error: daily.reason }
    const q: Record<string, Quote> = {}
    for (const s of ALL_SYMBOLS) {
      const d = dailyStats(daily.bars[s] ?? [])
      const i = d && intra.ok ? intraday(intra.bars[s] ?? [], d.prevClose, now) : null
      q[s] = { symbol: s, d, i }
      if (i) this.state.marks[s] = i.last
      else if (d && this.state.marks[s] === undefined) this.state.marks[s] = d.prevClose
    }
    const note = intra.ok ? `daily bars from ${daily.feed.toUpperCase()}, 15-minute bars from ${intra.feed.toUpperCase()}` : `daily bars only (${intra.reason})`
    return { q, feed: daily.feed, note }
  }

  /**
   * One wake. `manual` runs a scan outside the schedule, never a trade outside hours.
   * Paused means no new buys; stops and exits are enforced whether paused or not.
   */
  async cycle(manual = false): Promise<Cycle> {
    if (this.running) return { at: this.now(), phase: phase(this.now()), regime: '', lines: ['already running'] }
    this.running = true
    const now = this.now()
    const ph = phase(now)
    try {
      const got = await this.quotes(now)
      if ('error' in got) {
        this.log(ph, 'UNKNOWN', [`No stock data: ${got.error}. Nothing bought or sold.`])
        return this.state.cycles[this.state.cycles.length - 1]
      }
      const { q, feed, note } = got
      const uq = UNIVERSE.map((u) => q[u.symbol]).filter(Boolean)
      const reg = regime(q, uq)
      const board = themeBoard(q)
      const headlines = (await this.deps.headlines().catch(() => null)) ?? []
      const cat = catalystDay(q, headlines, now)
      const lines: string[] = []
      if (!headlines.length) lines.push('News feed unavailable: only the highest-quality setups with strong sector confirmation qualify.')
      if (cat) lines.push(`Catalyst day in ${cat.label}: ${cat.gappers.map((g) => `${g.symbol} +${g.gapPct.toFixed(1)}%`).join(', ')}${cat.headline ? ` on "${cat.headline}"` : ''}. Second-order names to watch: ${cat.secondOrder.slice(0, 5).map((s) => `${s.symbol}${s.ownNews ? ' (own news)' : ''}`).join(', ') || 'none clean'}.`)
      if (board.length >= 2) lines.push(`Rotation: ${board[0].label} leads, ${board[board.length - 1].label} lags.`)

      let evaluations: Evaluation[] = []
      if (ph === 'regular') {
        // 1. stops first, then every open position
        for (const p of [...this.state.positions]) {
          const a = manage(p, q[p.symbol], q[THEME_ETF[p.theme]], reg, this.state.lastCheck || p.openedAt)
          if (a.type === 'EXIT') {
            const px = a.price * (1 - SLIP)
            const pnl = (px - p.entry) * p.qty
            this.state.cash += p.qty * px
            this.state.positions = this.state.positions.filter((x) => x !== p)
            this.fill(p.symbol, 'SELL', p.qty, px, a.why, pnl)
            lines.push(`Sold ${p.symbol}: ${a.why} (${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}).`)
            this.deps.alert?.(`Stock desk: sold ${p.symbol}`, `${a.why}. PAPER.`)
          } else if (a.type === 'TRIM') {
            const qty = p.qty * a.fraction, px = a.price * (1 - SLIP)
            const pnl = (px - p.entry) * qty
            this.state.cash += qty * px
            p.qty -= qty; p.trimmed = true; p.stop = Math.max(p.stop, p.entry)
            this.fill(p.symbol, 'SELL', qty, px, a.why, pnl)
            lines.push(`Trimmed ${p.symbol}: ${a.why}.`)
          } else lines.push(`Holding ${p.symbol}: ${a.why}.`)
        }
        // 2. then look for new buys, best first, never forced (not while paused)
        const acct = () => ({ equity: this.equityNow(), cash: this.state.cash, positions: this.state.positions.map((p) => ({ symbol: p.symbol, theme: p.theme })) })
        const ctx = { q, reg, board, cat, headlines, now, feed }
        evaluations = UNIVERSE.map((u) => evaluate(u, ctx, acct()))
        const buys = evaluations.filter((e) => e.verdict === 'BUY').sort((a, b) => (b.report?.confidence ?? 0) - (a.report?.confidence ?? 0))
        let bought = 0
        for (const b of buys) {
          if (bought >= 2 || this.state.paused) break
          const fresh = evaluate(STOCK_OF[b.symbol], ctx, acct()) // re-check against the account after any earlier buy
          if (fresh.verdict !== 'BUY' || !fresh.setup || !fresh.report || !fresh.dollars) continue
          const px = fresh.setup.entry * (1 + SLIP)
          const qty = fresh.dollars / px
          this.state.cash -= qty * px
          this.state.positions.push({ symbol: b.symbol, theme: b.theme, qty, entry: px, stop: fresh.setup.stop, initialStop: fresh.setup.stop, target: fresh.report.target, openedAt: now, thesisLevel: fresh.thesisLevel ?? null, trimmed: false, setup: fresh.report.setup })
          this.fill(b.symbol, 'BUY', qty, px, `${fresh.report.setup} Confidence ${fresh.report.confidence}.`)
          this.state.reports = [...this.state.reports, { ...fresh.report, at: now }].slice(-40)
          this.state.marks[b.symbol] = fresh.setup.entry
          lines.push(`Bought ${b.symbol} (${THEME_LABEL[b.theme]}): $${Math.round(qty * px).toLocaleString('en-US')} at ${px.toFixed(2)}, stop ${fresh.setup.stop.toFixed(2)}, target ${fresh.report.target.toFixed(2)}.`)
          this.deps.alert?.(`Stock desk: bought ${b.symbol}`, `${fresh.report.setup} Stop ${fresh.setup.stop.toFixed(2)}. PAPER.`)
          bought++
        }
        if (this.state.paused) lines.push('Paused by you: no new buys. Stops and exits are still enforced.')
        else if (!bought) {
          const near = evaluations.filter((e) => e.report).sort((a, b) => (b.report?.confidence ?? 0) - (a.report?.confidence ?? 0))[0]
          lines.push(reg.aggression === 0 ? `No new buys: the market check is ${reg.state}. Cash is a position.` : near ? `No trade. Closest: ${near.symbol}, ${near.reason}` : 'No trade: nothing has a clean setup with support behind it. Cash is a position.')
        }
        this.state.lastCheck = now
      } else if (ph === 'premarket') {
        const watch = UNIVERSE.map((u) => q[u.symbol]).filter((x) => x?.d?.uptrend && (x.i?.premarketPct ?? 0) < 3)
          .sort((a, b) => ((b.d?.ret20 ?? 0) - (a.d?.ret20 ?? 0))).slice(0, 8).map((x) => x.symbol)
        lines.unshift(`Premarket scan. Market check: ${reg.state}. Leaders in an uptrend without a big gap: ${watch.join(', ') || 'none'}. No entries until the opening range has formed (after 9:00 CT).`)
      } else {
        lines.unshift(`Market closed. ${this.state.positions.length ? `Holding ${this.state.positions.length} position${this.state.positions.length === 1 ? '' : 's'}; stops resume at the open.` : 'All cash.'} Next premarket scan at 8:15 CT.`)
      }
      this.state.scan = { at: now, phase: ph, feed, regime: reg, board, catalyst: cat, evaluations: evaluations.filter((e) => e.verdict !== 'SKIP').sort((a, b) => (b.report?.confidence ?? -1) - (a.report?.confidence ?? -1)).slice(0, 14), dataNote: note }
      this.state.equity = [...this.state.equity, { t: now, v: Math.round(this.equityNow() * 100) / 100 }].slice(-3000)
      this.log(ph, reg.state, lines)
      return this.state.cycles[this.state.cycles.length - 1]
    } finally {
      this.running = false
      this.state.nextWake = nextWake(this.now()).at
      this.save()
    }
  }

  /** Sell everything at the last known price. The owner's call; labelled as such. */
  flatten(): number {
    let n = 0
    for (const p of [...this.state.positions]) {
      const px = (this.state.marks[p.symbol] ?? p.entry) * (1 - SLIP)
      this.state.cash += p.qty * px
      this.fill(p.symbol, 'SELL', p.qty, px, 'flattened by you', (px - p.entry) * p.qty)
      n++
    }
    this.state.positions = []
    this.log(phase(this.now()), '', [`Flattened ${n} position${n === 1 ? '' : 's'} at your request.`])
    this.save()
    return n
  }

  setPaused(on: boolean): void {
    this.state.paused = on
    this.log(phase(this.now()), '', [on ? `Paused: no new buys.${this.state.positions.length ? ` ${this.state.positions.length} open position(s) are still managed: stops and exits keep running.` : ''}` : 'Resumed: new buys allowed again.'])
    this.save()
  }

  snapshot() {
    const now = this.now()
    const eq = this.equityNow()
    const nw = nextWake(now)
    return {
      mode: 'PAPER' as const,
      phase: phase(now),
      paused: this.state.paused,
      nextWake: this.state.nextWake || nw.at,
      nextWhy: nw.why,
      account: { startEquity: this.state.startEquity, equity: Math.round(eq * 100) / 100, cash: Math.round(this.state.cash * 100) / 100, changePct: (eq / this.state.startEquity - 1) * 100 },
      positions: this.state.positions.map((p) => {
        const last = this.state.marks[p.symbol] ?? p.entry
        return { ...p, last, value: p.qty * last, pnl: (last - p.entry) * p.qty, r: (last - p.entry) / (p.entry - p.initialStop), themeLabel: THEME_LABEL[p.theme] }
      }),
      fills: this.state.fills.slice(-60).reverse(),
      cycles: this.state.cycles.slice(-40).reverse(),
      reports: this.state.reports.slice(-10).reverse(),
      equity: this.state.equity.slice(-400),
      scan: this.state.scan,
      closedTrades: this.state.fills.filter((f) => f.side === 'SELL' && f.pnl !== undefined).length,
      universe: { names: UNIVERSE.length, themes: Object.keys(THEME_LABEL).length, check: [...MARKET_CHECK] },
    }
  }

  /** A short line for Ask and for Home. */
  summary(): string {
    const s = this.snapshot()
    return `Stock desk (PAPER): equity $${s.account.equity.toFixed(2)} (${s.account.changePct >= 0 ? '+' : ''}${s.account.changePct.toFixed(2)}% since start), ${s.positions.length} open (${s.positions.map((p) => `${p.symbol} ${p.r >= 0 ? '+' : ''}${p.r.toFixed(2)}R`).join(', ') || 'all cash'}). Market check: ${s.scan?.regime.state ?? 'not run yet'}. ${s.paused ? 'PAUSED.' : `Next wake ${new Date(s.nextWake).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })} CT.`}`
  }

  start(): void {
    if (this.timer) return
    const tick = () => { if (this.now() >= (this.state.nextWake || 0) && !this.running) void this.cycle(false).catch(() => { /* logged next cycle */ }) }
    tick()
    this.timer = setInterval(tick, 30_000)
    this.timer.unref?.()
  }

  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null }
}

export type { Theme }
