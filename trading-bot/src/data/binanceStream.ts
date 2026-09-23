/**
 * The live connection to the exchange's public market-data stream.
 *
 * One socket carries four streams for the symbol:
 *   kline_<interval>  every tick of the forming candle, and the close
 *   aggTrade          every trade, with which side crossed the spread
 *   bookTicker        the best bid and ask whenever they change
 *   depth@100ms       order-book changes, ten times a second
 *
 * What this class promises:
 *   - It reconnects on its own, with back-off, rotating through the hosts.
 *   - It notices silence (no message for `staleAfterMs`) and reconnects.
 *   - The order book is stitched together the way the exchange documents:
 *     buffer the deltas, take a REST snapshot, drop the deltas the snapshot
 *     already contains, apply the rest in sequence, and RESYNC the moment
 *     a sequence number is skipped. Until that is done, the book is marked
 *     not synced and no one downstream should trust it.
 *   - Every reading it emits carries `receivedAt` and `source: 'stream'`.
 *
 * It uses Node's built-in WebSocket client. No package, no key, no account.
 * Everything it parses is public data.
 */

import type { MarketBus } from './bus.ts'
import type { Book, BookLevel, BookTicker, FeedCandle, StreamHealth, StreamName, Trade } from './types.ts'

export type DepthSnapshot = { lastUpdateId: number; bids: Array<[string, string]>; asks: Array<[string, string]> }

export type StreamOptions = {
  hosts: string[]
  symbol: string
  interval: string
  bus: MarketBus
  /** Fetches a REST depth snapshot; the stream cannot build a book without one. */
  depthSnapshot: () => Promise<DepthSnapshot>
  reconnectMinMs?: number
  reconnectMaxMs?: number
  staleAfterMs?: number
  bookLevels?: number
  now?: () => number
  /** Test hook: build the socket. Defaults to the global WebSocket. */
  connect?: (url: string) => WebSocket
}

type DepthEvent = { U: number; u: number; b: Array<[string, string]>; a: Array<[string, string]>; E: number }

export function streamUrl(host: string, symbol: string, interval: string): string {
  const s = symbol.toLowerCase()
  return `${host.replace(/\/$/, '')}/stream?streams=${s}@kline_${interval}/${s}@aggTrade/${s}@bookTicker/${s}@depth@100ms`
}

export class BinanceStream {
  private readonly o: Required<Pick<StreamOptions, 'reconnectMinMs' | 'reconnectMaxMs' | 'staleAfterMs' | 'bookLevels' | 'now' | 'connect'>> & StreamOptions
  private ws: WebSocket | null = null
  private hostIndex = 0
  private attempt = 0
  private stopped = true
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private watchdog: ReturnType<typeof setInterval> | null = null
  private readonly last: Record<StreamName, number | null> = { kline: null, aggTrade: null, bookTicker: null, depth: null }
  private lastAnyAt: number | null = null
  private reconnects = 0
  private lastGap: StreamHealth['lastGap'] = null
  private connectedHost: string | null = null

  // Order book state
  private bids = new Map<number, number>()
  private asks = new Map<number, number>()
  private bookUpdateId = 0
  private synced = false
  private syncing = false
  private buffer: DepthEvent[] = []

  constructor(opts: StreamOptions) {
    this.o = {
      reconnectMinMs: 1000, reconnectMaxMs: 30_000, staleAfterMs: 90_000, bookLevels: 200, now: () => Date.now(),
      connect: (url: string) => new WebSocket(url),
      ...opts,
    }
  }

  // ---- lifecycle ----------------------------------------------------

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.attempt = 0
    this.open()
    this.watchdog = setInterval(() => this.checkStale(), Math.max(100, Math.floor(this.o.staleAfterMs / 3)))
    this.watchdog.unref() // the app holds the process open; a timer alone must not
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null }
    const ws = this.ws
    this.ws = null
    if (ws) { try { ws.close() } catch { /* already closed */ } }
    this.connectedHost = null
  }

  health(): StreamHealth {
    return {
      connected: this.ws !== null && this.ws.readyState === 1,
      host: this.connectedHost,
      lastMessageAt: { ...this.last },
      reconnects: this.reconnects,
      lastGap: this.lastGap,
      fallbackActive: false,
    }
  }

  /** The synchronised book, best prices first. Empty and unsynced until the snapshot is stitched in. */
  book(): Book {
    const top = (m: Map<number, number>, desc: boolean): BookLevel[] =>
      [...m.entries()].sort((a, b) => (desc ? b[0] - a[0] : a[0] - b[0])).slice(0, this.o.bookLevels).map(([price, qty]) => ({ price, qty }))
    return { bids: top(this.bids, true), asks: top(this.asks, false), lastUpdateId: this.bookUpdateId, time: this.last.depth ?? 0, receivedAt: this.o.now(), source: 'stream', synced: this.synced }
  }

  private open(): void {
    if (this.stopped) return
    const host = this.o.hosts[this.hostIndex % this.o.hosts.length]
    const url = streamUrl(host, this.o.symbol, this.o.interval)
    let ws: WebSocket
    try {
      ws = this.o.connect(url)
    } catch (err) {
      this.scheduleReconnect(`could not open ${host}: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    this.ws = ws
    ws.addEventListener('open', () => {
      if (this.ws !== ws) return
      this.connectedHost = host
      this.attempt = 0
      this.lastAnyAt = this.o.now()
      this.resetBook()
      void this.syncBook()
      this.o.bus.emit('stream:up', this.health())
    })
    ws.addEventListener('message', (ev) => {
      if (this.ws !== ws) return
      this.handleMessage(typeof ev.data === 'string' ? ev.data : String(ev.data))
    })
    ws.addEventListener('close', (ev) => {
      if (this.ws !== ws) return
      this.ws = null
      this.connectedHost = null
      this.scheduleReconnect(`socket closed (${(ev as CloseEvent).code ?? '?'})`)
    })
    ws.addEventListener('error', () => {
      if (this.ws !== ws) return
      // A socket that failed to CONNECT fires 'error' and then nothing: no
      // 'close' ever comes and readyState stays 0. Treat that as a drop.
      if (ws.readyState === 0) {
        this.ws = null
        this.connectedHost = null
        try { ws.close() } catch { /* ignore */ }
        this.scheduleReconnect(`could not connect to ${host}`)
      }
      // For an open socket, 'close' follows and handles the reconnect.
    })
  }

  private scheduleReconnect(reason: string): void {
    if (this.stopped || this.reconnectTimer) return
    this.synced = false
    this.o.bus.emit('stream:down', this.health(), reason)
    const delay = Math.min(this.o.reconnectMaxMs, this.o.reconnectMinMs * 2 ** this.attempt)
    this.attempt++
    this.hostIndex++
    this.reconnects++
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.open() }, delay)
    this.reconnectTimer.unref()
  }

  private checkStale(): void {
    if (this.stopped || !this.ws) return
    const now = this.o.now()
    if (this.lastAnyAt !== null && now - this.lastAnyAt > this.o.staleAfterMs) {
      const ws = this.ws
      this.ws = null
      this.connectedHost = null
      try { ws.close() } catch { /* ignore */ }
      this.scheduleReconnect(`no message for ${Math.round((now - this.lastAnyAt) / 1000)}s`)
    }
  }

  // ---- messages ------------------------------------------------------

  /** Parses one raw message from the combined stream. Public so tests can feed recorded lines. */
  handleMessage(raw: string): void {
    let msg: { stream?: string; data?: Record<string, unknown> }
    try { msg = JSON.parse(raw) as { stream?: string; data?: Record<string, unknown> } } catch { return }
    const stream = msg.stream ?? ''
    const d = msg.data
    if (!d) return
    const now = this.o.now()
    this.lastAnyAt = now
    if (stream.includes('@kline')) this.onKline(d, now)
    else if (stream.includes('@aggTrade')) this.onTrade(d, now)
    else if (stream.includes('@bookTicker')) this.onBookTicker(d, now)
    else if (stream.includes('@depth')) this.onDepth(d as unknown as DepthEvent, now)
  }

  private onKline(d: Record<string, unknown>, now: number): void {
    const k = d.k as Record<string, unknown>
    if (!k) return
    this.last.kline = now
    const c: FeedCandle = {
      openTime: Number(k.t), closeTime: Number(k.T), open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v),
      complete: Boolean(k.x), receivedAt: now, source: 'stream',
    }
    this.o.bus.emit(c.complete ? 'candle:closed' : 'candle:update', c)
  }

  private onTrade(d: Record<string, unknown>, now: number): void {
    this.last.aggTrade = now
    const t: Trade = { id: Number(d.a), time: Number(d.T), price: Number(d.p), qty: Number(d.q), side: d.m ? 'sell' : 'buy', receivedAt: now, source: 'stream' }
    this.o.bus.emit('trade', t)
  }

  private onBookTicker(d: Record<string, unknown>, now: number): void {
    this.last.bookTicker = now
    const b: BookTicker = { bid: Number(d.b), bidQty: Number(d.B), ask: Number(d.a), askQty: Number(d.A), time: Number(d.E ?? now), receivedAt: now, source: 'stream' }
    this.o.bus.emit('bookTicker', b)
  }

  // ---- the order book -----------------------------------------------------

  private resetBook(): void {
    this.bids.clear(); this.asks.clear()
    this.bookUpdateId = 0
    this.synced = false
    this.buffer = []
  }

  private onDepth(e: DepthEvent, now: number): void {
    this.last.depth = now
    if (!this.synced) {
      this.buffer.push(e)
      if (this.buffer.length > 5000) this.buffer.shift()
      return
    }
    if (e.U !== this.bookUpdateId + 1) {
      // A sequence number was skipped: the book can no longer be trusted. Rebuild it.
      this.lastGap = { at: now, what: `depth sequence broke (expected ${this.bookUpdateId + 1}, got ${e.U})` }
      this.o.bus.emit('stream:gap', this.lastGap.what, now)
      this.resetBook()
      this.buffer.push(e)
      void this.syncBook()
      return
    }
    this.applyDepth(e)
    this.o.bus.emit('book', this.book())
  }

  private applyDepth(e: DepthEvent): void {
    const apply = (m: Map<number, number>, levels: Array<[string, string]>) => {
      for (const [p, q] of levels) {
        const price = Number(p), qty = Number(q)
        if (qty === 0) m.delete(price)
        else m.set(price, qty)
      }
    }
    apply(this.bids, e.b)
    apply(this.asks, e.a)
    this.bookUpdateId = e.u
  }

  /** The documented stitch: snapshot, drop stale buffered events, apply the rest in order. */
  async syncBook(): Promise<void> {
    if (this.syncing || this.stopped) return
    this.syncing = true
    try {
      const snap = await this.o.depthSnapshot()
      if (this.stopped) return
      this.bids.clear(); this.asks.clear()
      for (const [p, q] of snap.bids) this.bids.set(Number(p), Number(q))
      for (const [p, q] of snap.asks) this.asks.set(Number(p), Number(q))
      this.bookUpdateId = snap.lastUpdateId
      const pending = this.buffer.filter((e) => e.u > snap.lastUpdateId)
      this.buffer = []
      let ok = true
      for (const e of pending) {
        // The first applied event must straddle the snapshot; every later one must follow on exactly.
        const first = this.bookUpdateId === snap.lastUpdateId
        if (first ? !(e.U <= snap.lastUpdateId + 1 && e.u >= snap.lastUpdateId + 1) : e.U !== this.bookUpdateId + 1) { ok = false; break }
        this.applyDepth(e)
      }
      if (!ok) {
        // The buffer did not line up with the snapshot (an old snapshot, usually). Try again shortly.
        this.syncing = false
        setTimeout(() => void this.syncBook(), 500)
        return
      }
      this.synced = true
      this.o.bus.emit('book', this.book())
    } catch (err) {
      this.lastGap = { at: this.o.now(), what: `depth snapshot failed: ${err instanceof Error ? err.message : String(err)}` }
      setTimeout(() => void this.syncBook(), 2000)
    } finally {
      this.syncing = false
    }
  }
}

/** Opens a socket, waits for the first message, closes it. For the doctor. */
export async function probeStream(hosts: string[], symbol: string, interval: string, timeoutMs = 6000, connect: (url: string) => WebSocket = (u) => new WebSocket(u)): Promise<{ ok: boolean; host: string | null; detail: string }> {
  for (const host of hosts) {
    const result = await new Promise<{ ok: boolean; detail: string }>((resolve) => {
      let ws: WebSocket
      // Settle exactly once. Node's built-in WebSocket re-fires 'error' when close() is called on a
      // socket that never connected, so a handler that closes and does not guard recurses until the
      // stack overflows (seen in `npm run doctor` behind a proxy that blocks WebSockets).
      let settled = false
      const settle = (r: { ok: boolean; detail: string }, close: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (close && ws.readyState !== 0) { try { ws.close() } catch { /* ignore */ } }
        resolve(r)
      }
      const timer = setTimeout(() => settle({ ok: false, detail: `no message within ${timeoutMs / 1000}s` }, true), timeoutMs)
      try {
        ws = connect(streamUrl(host, symbol, interval))
      } catch (err) {
        clearTimeout(timer)
        resolve({ ok: false, detail: err instanceof Error ? err.message : String(err) })
        return
      }
      ws.addEventListener('message', () => settle({ ok: true, detail: 'first message received' }, true))
      ws.addEventListener('error', () => settle({ ok: false, detail: 'connection refused or blocked' }, true))
      ws.addEventListener('close', () => settle({ ok: false, detail: 'closed before any message' }, false))
    })
    if (result.ok) return { ok: true, host, detail: result.detail }
  }
  return { ok: false, host: null, detail: `none of ${hosts.length} host(s) answered` }
}
