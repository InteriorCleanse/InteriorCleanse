/**
 * The canonical shapes every market-data reading is normalised into.
 * Each carries where it came from and when it was received, so nothing
 * downstream has to guess whether a number is fresh.
 */

export type Source = 'stream' | 'rest' | 'store'

/** One trade as it hit the tape. `side` is the aggressor: who crossed the spread. */
export type Trade = {
  id: number
  time: number
  price: number
  qty: number
  /** 'buy' = a buyer lifted the offer; 'sell' = a seller hit the bid. */
  side: 'buy' | 'sell'
  receivedAt: number
  source: Source
}

export type BookLevel = { price: number; qty: number }

/** The best bid and ask, the cheapest reading of "where the market is". */
export type BookTicker = {
  bid: number
  bidQty: number
  ask: number
  askQty: number
  time: number
  receivedAt: number
  source: Source
}

/** A synchronised slice of the order book, best prices first. */
export type Book = {
  bids: BookLevel[]
  asks: BookLevel[]
  lastUpdateId: number
  time: number
  receivedAt: number
  source: Source
  /** False while the snapshot and the stream have not been stitched together yet. */
  synced: boolean
}

/** A candle from the feed: the store's shape plus provenance. */
export type FeedCandle = {
  openTime: number
  closeTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  /** True once the exchange has closed the candle. A forming candle is never stored. */
  complete: boolean
  receivedAt: number
  source: Source
}

export type StreamName = 'kline' | 'aggTrade' | 'bookTicker' | 'depth'

export type StreamHealth = {
  /** Whether the socket is open right now. */
  connected: boolean
  host: string | null
  /** Per stream: the last message time, or null if none since connect. */
  lastMessageAt: Record<StreamName, number | null>
  reconnects: number
  /** The most recent gap the feed noticed (a missed candle or a broken depth sequence). */
  lastGap: { at: number; what: string } | null
  /** Whether the REST fallback filled in for the stream recently. */
  fallbackActive: boolean
}
