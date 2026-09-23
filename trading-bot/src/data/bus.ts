/**
 * The market-data bus — one place every live reading is announced.
 *
 * Producers (the stream, the REST fallback) emit; consumers (the watch
 * loop, the dashboard stream, the order-flow features) subscribe. Nobody
 * polls anybody. The bus is typed so a consumer cannot subscribe to an
 * event that does not exist.
 */

import { EventEmitter } from 'node:events'
import type { Book, BookTicker, FeedCandle, StreamHealth, Trade } from './types.ts'
import type { Snapshot } from '../bot.ts'

/** Emitted by the watch loop after a cycle has finished and positions are final. Observers only; the loop never reads a reply. */
export type WatchCycle = { at: number; snap: Snapshot }

export type BusEvents = {
  /** A trade hit the tape. */
  trade: (t: Trade) => void
  /** The best bid/ask moved. */
  bookTicker: (b: BookTicker) => void
  /** The synchronised order book changed. */
  book: (b: Book) => void
  /** The forming candle changed (every trade, or every stream tick). */
  'candle:update': (c: FeedCandle) => void
  /** A candle closed. The one event the strategy acts on. */
  'candle:closed': (c: FeedCandle) => void
  /** The stream came up. */
  'stream:up': (h: StreamHealth) => void
  /** The stream went down; the REST fallback takes over. */
  'stream:down': (h: StreamHealth, reason: string) => void
  /** Something was missed and back-filled, or could not be. */
  'stream:gap': (what: string, at: number) => void
  'watch:cycle': (c: WatchCycle) => void
}

export class MarketBus {
  private readonly emitter = new EventEmitter()

  constructor() {
    this.emitter.setMaxListeners(50)
  }

  on<K extends keyof BusEvents>(event: K, listener: BusEvents[K]): () => void {
    this.emitter.on(event, listener as (...args: unknown[]) => void)
    return () => this.emitter.off(event, listener as (...args: unknown[]) => void)
  }

  once<K extends keyof BusEvents>(event: K, listener: BusEvents[K]): void {
    this.emitter.once(event, listener as (...args: unknown[]) => void)
  }

  emit<K extends keyof BusEvents>(event: K, ...args: Parameters<BusEvents[K]>): void {
    this.emitter.emit(event, ...args)
  }

  listenerCount(event: keyof BusEvents): number {
    return this.emitter.listenerCount(event)
  }

  removeAll(): void {
    this.emitter.removeAllListeners()
  }
}

/** The process-wide bus. */
export const bus = new MarketBus()
