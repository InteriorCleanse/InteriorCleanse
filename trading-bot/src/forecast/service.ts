/**
 * THE CALL DESK — runs the up-or-down forecast forward in time, on paper.
 *
 * Every half minute it reads the bot's own stored 5-minute candles. When a
 * new window opens (15 minutes by default, aligned to the clock like the
 * short Bitcoin markets), it makes one forecast from the candles closed by
 * the window's start, and only while the window is still open: the outcome
 * is never known when the forecast is written. When the candle that closes
 * the window arrives, the forecast is settled and scored.
 *
 * The record is saved to forecasts.json in the data directory. Nothing here
 * places an order, sizes anything or feeds the engine: it is a scored
 * forecast log, labelled PAPER FORECAST.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from '../store.ts'
import type { Candle } from '../types.ts'
import { backtestWindows, forecastWindow, MODEL_NOTE, settle, tally } from './model.ts'
import type { Forecast, Settled, Tally } from './model.ts'

export type DeskSnapshot = {
  kind: 'PAPER FORECAST'
  execution: 'NONE'
  symbol: string
  windowMinutes: number
  line: number
  asOf: number
  lastCandleAt: number | null
  status: 'LIVE' | 'WAITING FOR CANDLES' | 'STALE CANDLES' | 'STARTING'
  current: (Forecast & { msLeft: number }) | null
  /** When there is no live call: what the model reads from the latest candles, marked stale. Never scored. */
  lastRead: (Forecast & { stale: true }) | null
  log: Settled[]
  tally: Tally
  backtest: { label: 'BACKTEST'; windows: number; tally: Tally; recent: Settled[] } | null
  note: string
}

type Opts = {
  symbol: string
  windowMinutes?: number
  line?: number
  dir?: string
  now?: () => number
  /** Closed 5-minute candles, most recent last. */
  candles: (limit: number) => Promise<Candle[]>
}

type Saved = { open: Forecast[]; settled: Settled[] }

export class CallDesk {
  private readonly file: string
  private saved: Saved
  private timer: NodeJS.Timeout | null = null
  private running = false
  private last: DeskSnapshot
  private bt: DeskSnapshot['backtest'] = null
  private btAt = 0
  private read: DeskSnapshot['lastRead'] = null

  private readonly opts: Opts
  constructor(opts: Opts) {
    this.opts = opts
    this.file = join(opts.dir ?? DATA_DIR, 'forecasts.json')
    this.saved = this.load()
    this.last = this.build(null, 'STARTING')
  }

  private get windowMs() { return (this.opts.windowMinutes ?? 15) * 60_000 }
  private get line() { return this.opts.line ?? 0.58 }
  private now() { return (this.opts.now ?? Date.now)() }

  private load(): Saved {
    try {
      if (!existsSync(this.file)) return { open: [], settled: [] }
      const s = JSON.parse(readFileSync(this.file, 'utf8'))
      return { open: Array.isArray(s.open) ? s.open : [], settled: Array.isArray(s.settled) ? s.settled : [] }
    } catch { return { open: [], settled: [] } }
  }

  private save(): void {
    try {
      mkdirSync(join(this.file, '..'), { recursive: true })
      const tmp = this.file + '.tmp'
      writeFileSync(tmp, JSON.stringify({ open: this.saved.open, settled: this.saved.settled.slice(-2000) }), { mode: 0o600 })
      renameSync(tmp, this.file)
    } catch { /* a failed save must not stop the desk */ }
  }

  snapshot(): DeskSnapshot { return this.last }

  start(): void {
    if (this.timer) return
    const first = setTimeout(() => { void this.tick().catch(() => {}) }, 20_000)
    first.unref?.()
    this.timer = setInterval(() => { void this.tick().catch(() => {}) }, 30_000)
    this.timer.unref?.()
  }

  stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null } }

  /** One pass: settle what can be settled, forecast the open window if it has no forecast yet. */
  async tick(): Promise<DeskSnapshot> {
    if (this.running) return this.last
    this.running = true
    try {
      const now = this.now(), W = this.windowMs
      let candles: Candle[] = []
      try { candles = await this.opts.candles(1000) } catch { /* fall through to WAITING */ }
      if (!candles.length) { this.last = this.build(null, 'WAITING FOR CANDLES'); return this.last }
      const closeAt = new Map(candles.map((k) => [k.closeTime + 1, k.close]))
      const lastEnd = candles[candles.length - 1].closeTime + 1
      let changed = false

      // Settle every open forecast whose closing candle has arrived.
      const still: Forecast[] = []
      for (const f of this.saved.open) {
        const close = closeAt.get(f.windowEnd)
        if (close !== undefined) { this.saved.settled.push(settle(f, close)); changed = true }
        else if (now - f.windowEnd > 6 * 3_600_000) changed = true // the candle never came; drop it rather than guess
        else still.push(f)
      }
      this.saved.open = still

      // Forecast the window that is open right now, once, from candles closed by its start.
      const start = Math.floor(now / W) * W
      const have = this.saved.open.some((f) => f.windowStart === start) || this.saved.settled.some((f) => f.windowStart === start)
      let status: DeskSnapshot['status'] = 'LIVE'
      if (!have) {
        if (lastEnd >= start && closeAt.has(start)) {
          const f = forecastWindow(candles, start, W, this.line)
          if (f) { this.saved.open.push(f); changed = true }
        } else status = now - lastEnd > 2 * W ? 'STALE CANDLES' : 'WAITING FOR CANDLES'
      }
      if (changed) this.save()
      if (!this.bt || now - this.btAt > 30 * 60_000) { this.bt = this.backtest(candles); this.btAt = now }
      const cur = this.saved.open.find((f) => f.windowStart === start) ?? null
      if (!cur) { const r = forecastWindow(candles, lastEnd, W, this.line); this.read = r ? { ...r, stale: true } : null } else this.read = null
      this.last = this.build(cur ? { ...cur, msLeft: Math.max(0, cur.windowEnd - now) } : null, status, lastEnd)
      return this.last
    } finally { this.running = false }
  }

  private backtest(candles: Candle[]): DeskSnapshot['backtest'] {
    const rows = backtestWindows(candles, this.windowMs, this.line)
    return rows.length ? { label: 'BACKTEST', windows: rows.length, tally: tally(rows), recent: rows.slice(-12).reverse() } : null
  }

  private build(current: DeskSnapshot['current'], status: DeskSnapshot['status'], lastCandleAt: number | null = null): DeskSnapshot {
    return {
      kind: 'PAPER FORECAST', execution: 'NONE', symbol: this.opts.symbol, windowMinutes: this.opts.windowMinutes ?? 15, line: this.line,
      asOf: this.now(), lastCandleAt, status, current, lastRead: this.read,
      log: this.saved.settled.slice(-40).reverse(), tally: tally(this.saved.settled), backtest: this.bt,
      note: `PAPER FORECAST: a call on whether ${this.opts.symbol} ends each ${this.opts.windowMinutes ?? 15}-minute window higher, scored against the real close. No orders, no money, nothing sent to the engine. ${MODEL_NOTE}`,
    }
  }
}
