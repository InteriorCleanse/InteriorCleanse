/**
 * The market feed — the one thing the rest of the bot asks "what is the
 * market doing right now?"
 *
 * It owns the live stream (when enabled), keeps the latest price, book
 * ticker, trade and forming candle in memory, writes every closed candle
 * to the candle store, and runs a REST heartbeat that catches anything
 * the stream missed. If the stream is off or down, the heartbeat is the
 * feed, exactly like the old five-minute poll — and it says so.
 *
 * Nothing in here fakes a reading. A closed candle is announced exactly
 * once, whichever path delivered it first.
 */

import { config, dataSources, flowSources } from '../../config.ts'
import { INTERVAL_MS, fetchMarketJson } from '../market.ts'
import { bus } from './bus.ts'
import { BinanceStream } from './binanceStream.ts'
import type { DepthSnapshot } from './binanceStream.ts'
import { getCandles, lastClosedOpenTime, lastStoredCandle, recordClosedCandle } from './candleStore.ts'
import type { Book, BookTicker, FeedCandle, StreamHealth, Trade } from './types.ts'

export type FeedMode = 'stream' | 'rest' | 'off'

export type FeedHealth = {
  mode: FeedMode
  stream: StreamHealth | null
  /** Open time of the last closed candle the feed announced, and when. */
  lastClosed: { openTime: number; announcedAt: number; via: 'stream' | 'rest' } | null
  /** When the REST heartbeat last ran and what it found. */
  heartbeat: { at: number; filled: number } | null
  price: number | null
  priceAt: number | null
}

export class MarketFeed {
  private stream: BinanceStream | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private unsubscribe: Array<() => void> = []
  private started = false
  private lastClosed: FeedHealth['lastClosed'] = null
  private heartbeat: FeedHealth['heartbeat'] = null
  private announced = new Set<number>()
  latestTrade: Trade | null = null
  latestTicker: BookTicker | null = null
  latestBook: Book | null = null
  forming: FeedCandle | null = null

  get symbol(): string { return config.symbol }
  get interval(): string { return config.interval }

  start(opts: { stream?: boolean; heartbeatMs?: number } = {}): void {
    if (this.started) return
    this.started = true
    const useStream = opts.stream ?? (config.data.stream && process.env.MRCASH_STREAM !== '0')
    if (useStream) {
      const hosts = process.env.MRCASH_STREAM_URL ? [process.env.MRCASH_STREAM_URL] : config.data.streamHosts
      this.stream = new BinanceStream({
        hosts, symbol: this.symbol, interval: this.interval, bus,
        depthSnapshot: () => fetchMarketJson(flowSources.orderBook, { symbol: this.symbol, limit: String(Math.min(1000, config.data.bookLevels)) }) as Promise<DepthSnapshot>,
        reconnectMinMs: config.data.reconnectMinMs, reconnectMaxMs: config.data.reconnectMaxMs, staleAfterMs: config.data.staleAfterMs, bookLevels: config.data.bookLevels,
      })
      this.unsubscribe.push(
        bus.on('trade', (t) => { this.latestTrade = t }),
        bus.on('bookTicker', (b) => { this.latestTicker = b }),
        bus.on('book', (b) => { this.latestBook = b }),
        bus.on('candle:update', (c) => { this.forming = c }),
      )
      this.stream.start()
    }
    // Every close — from the stream or from the REST heartbeat — passes through
    // here once. Listener order: this one is registered BEFORE server/watch
    // subscribe, so the store is written before anyone reacts.
    this.unsubscribe.push(bus.on('candle:closed', (c) => this.onClosed(c, c.source === 'rest' ? 'rest' : 'stream')))
    const every = opts.heartbeatMs ?? Math.max(15_000, Math.min(INTERVAL_MS[this.interval] ?? 300_000, config.app.watchEveryMinutes * 60_000))
    this.heartbeatTimer = setInterval(() => void this.runHeartbeat(), every)
    // The app and the watch loop hold the process open themselves; a timer alone must not.
    this.heartbeatTimer.unref()
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    for (const u of this.unsubscribe) u()
    this.unsubscribe = []
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null }
    this.stream?.stop()
    this.stream = null
  }

  private onClosed(c: FeedCandle, via: 'stream' | 'rest'): void {
    if (c.source === 'stream') recordClosedCandle(this.symbol, this.interval, c)
    this.announced.add(c.openTime)
    if (this.announced.size > 2000) this.announced = new Set([...this.announced].slice(-1000))
    this.lastClosed = { openTime: c.openTime, announcedAt: Date.now(), via }
    this.forming = null
  }

  /**
   * The REST heartbeat: if the store is behind the exchange clock and the
   * stream did not deliver the candle, fetch it and announce it. This is
   * the whole fallback — the same code path whether the stream is off,
   * down, or simply late.
   */
  async runHeartbeat(now = Date.now()): Promise<number> {
    const expected = lastClosedOpenTime(this.interval, now)
    const last = lastStoredCandle(this.symbol, this.interval)
    // Give the stream a grace period after the close before REST steps in.
    const grace = 15_000
    if (last && last.openTime >= expected) { this.heartbeat = { at: now, filled: 0 }; return 0 }
    if (this.stream?.health().connected && now - (expected + (INTERVAL_MS[this.interval] ?? 300_000)) < grace) { this.heartbeat = { at: now, filled: 0 }; return 0 }
    let filled = 0
    try {
      const before = last?.openTime ?? -1
      const candles = await getCandles(this.symbol, this.interval, Math.min(1000, Math.max(3, last ? Math.ceil((expected - last.openTime) / (INTERVAL_MS[this.interval] ?? 300_000)) + 1 : 3)), now)
      for (const c of candles) {
        if (c.openTime <= before || this.announced.has(c.openTime)) continue
        filled++
        const fc: FeedCandle = { ...c, complete: true, receivedAt: now, source: 'rest' }
        bus.emit('candle:closed', fc) // the feed's own listener records and dedupes it
      }
      if (filled > 0 && this.stream) bus.emit('stream:gap', `The stream missed ${filled} candle close(s); REST filled them in.`, now)
    } catch (err) {
      bus.emit('stream:gap', `REST heartbeat failed: ${err instanceof Error ? err.message : String(err)}`, now)
    }
    this.heartbeat = { at: now, filled }
    return filled
  }

  health(): FeedHealth {
    const s = this.stream?.health() ?? null
    const mode: FeedMode = !this.started ? 'off' : s?.connected ? 'stream' : 'rest'
    const price = this.latestTicker ? (this.latestTicker.bid + this.latestTicker.ask) / 2 : this.latestTrade?.price ?? this.forming?.close ?? null
    const priceAt = this.latestTicker?.receivedAt ?? this.latestTrade?.receivedAt ?? this.forming?.receivedAt ?? null
    return { mode, stream: s ? { ...s, fallbackActive: (this.heartbeat?.filled ?? 0) > 0 } : null, lastClosed: this.lastClosed, heartbeat: this.heartbeat, price, priceAt }
  }

  /** Where prices are coming from, for banners. */
  describe(): string {
    const h = this.health()
    if (h.mode === 'stream') return `live stream (${h.stream?.host ?? '?'})`
    if (h.mode === 'rest') return this.stream ? `REST polling — the stream is ${h.stream?.reconnects ? 'reconnecting' : 'connecting'}` : 'REST polling (stream off in config.ts)'
    return 'not started'
  }
}

/** The process-wide feed. Started by the app; the CLI commands read REST directly. */
export const marketFeed = new MarketFeed()

export { dataSources }
