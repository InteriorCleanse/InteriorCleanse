/**
 * Order flow: where the big orders are sitting, and what is actually
 * trading right now.
 *
 * Two public, keyless feeds:
 *   - the ORDER BOOK — resting bids and asks. Clusters of them are
 *     "walls". Walls show intent, and intent can be withdrawn in a
 *     millisecond, so they are read as hints, not facts.
 *   - the TAPE — the last thousand trades that actually happened.
 *     Those are facts. Buyer-initiated vs seller-initiated, how many,
 *     how big, and the net dollar pressure.
 *
 * Every snapshot is logged to data/orderflow.csv so you can see how the
 * book and the tape changed through the day.
 */

import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config, flowSources } from '../config.ts'
import { fetchMarketJson } from './market.ts'
import { DATA_DIR, ensureDataDir } from './memory.ts'
import { store } from './store.ts'
import type { BigTrade, BookSnapshot, FlowReport, TapeSnapshot, Wall } from './types.ts'

export const FLOW_LOG = join(DATA_DIR, 'orderflow.csv')
const FLOW_HEADER = 'timestamp,price,bidUsd1pct,askUsd1pct,imbalance,walls,trades,tradesPerMinute,buyShare,deltaUsd,bigBuys,bigSells'

/** One raw aggregated trade as the exchange sends it. `m` = the buyer was the maker, i.e. a seller hit the bid. */
export type RawAggTrade = { a: number; p: string; q: string; T: number; m: boolean }

const usd = (n: number) => '$' + (Math.abs(n) >= 1_000_000 ? (n / 1_000_000).toFixed(2) + 'M' : Math.abs(n) >= 1000 ? (n / 1000).toFixed(0) + 'k' : n.toFixed(0))

/** Pure: turns raw bids/asks into a readable snapshot. */
export function analyzeBook(bids: Array<[string, string]>, asks: Array<[string, string]>, now = Date.now()): BookSnapshot {
  const b = bids.map(([p, q]) => [Number(p), Number(q)] as [number, number]).filter((x) => x[1] > 0 && x[0] > 0)
  const a = asks.map(([p, q]) => [Number(p), Number(q)] as [number, number]).filter((x) => x[1] > 0 && x[0] > 0)
  if (!b.length || !a.length) throw new Error('empty order book')

  const bestBid = Math.max(...b.map((x) => x[0]))
  const bestAsk = Math.min(...a.map((x) => x[0]))
  const price = (bestBid + bestAsk) / 2
  const spreadPct = ((bestAsk - bestBid) / price) * 100

  const within = (rows: Array<[number, number]>, lo: number, hi: number) =>
    rows.filter(([p]) => p >= lo && p <= hi).reduce((s, [p, q]) => s + p * q, 0)
  const bidUsd1pct = within(b, price * 0.99, price)
  const askUsd1pct = within(a, price, price * 1.01)
  const imbalance = bidUsd1pct + askUsd1pct > 0 ? bidUsd1pct / (bidUsd1pct + askUsd1pct) : 0.5

  // Group the book into price buckets so a wall spread over a few ticks still shows up.
  const bucket = price * (config.orderflow.bucketPercent / 100)
  const bucketize = (rows: Array<[number, number]>, side: Wall['side']) => {
    const m = new Map<number, { qty: number; usd: number }>()
    for (const [p, q] of rows) {
      const k = Math.round(p / bucket)
      const cur = m.get(k) ?? { qty: 0, usd: 0 }
      cur.qty += q
      cur.usd += p * q
      m.set(k, cur)
    }
    return [...m.entries()].map(([k, v]) => ({ side, price: k * bucket, qty: v.qty, usd: v.usd }))
  }
  const all = [...bucketize(b, 'bid'), ...bucketize(a, 'ask')]
  const sorted = all.map((x) => x.usd).sort((x, y) => x - y)
  const median = sorted[Math.floor(sorted.length / 2)] || 1
  const walls: Wall[] = all
    .filter((x) => x.usd >= median * config.orderflow.wallMultiple)
    .map((x) => ({ ...x, multiple: x.usd / median, distancePct: ((x.price - price) / price) * 100 }))
    .sort((x, y) => y.usd - x.usd)
    .slice(0, 8)

  return { time: now, price, bestBid, bestAsk, spreadPct, bidUsd1pct, askUsd1pct, imbalance, walls, levelsRead: b.length + a.length }
}

/** Pure: turns raw trades into who was hitting whom. */
export function analyzeTape(trades: RawAggTrade[], now = Date.now()): TapeSnapshot {
  if (!trades.length) throw new Error('no trades returned')
  let buys = 0, sells = 0, buyUsd = 0, sellUsd = 0
  let from = Infinity, to = -Infinity
  const big: BigTrade[] = []
  for (const t of trades) {
    const p = Number(t.p), q = Number(t.q), value = p * q
    const side: BigTrade['side'] = t.m ? 'sell' : 'buy'
    if (side === 'buy') { buys++; buyUsd += value } else { sells++; sellUsd += value }
    if (t.T < from) from = t.T
    if (t.T > to) to = t.T
    if (value >= config.orderflow.bigTradeUsd) big.push({ time: t.T, side, usd: value, price: p, qty: q })
  }
  const minutes = Math.max(1 / 60, (to - from) / 60_000)
  big.sort((x, y) => y.usd - x.usd)
  return {
    time: now, from, to,
    trades: trades.length, buys, sells, buyUsd, sellUsd,
    deltaUsd: buyUsd - sellUsd,
    buyShare: buys / trades.length,
    tradesPerMinute: trades.length / minutes,
    bigTrades: big.slice(0, 20),
    bigBuys: big.filter((x) => x.side === 'buy').length,
    bigSells: big.filter((x) => x.side === 'sell').length,
  }
}

/** Plain English, always with the caveat that the book is intent and the tape is fact. */
export function describeFlow(book: BookSnapshot | null, tape: TapeSnapshot | null): string[] {
  const L: string[] = []
  if (book) {
    const lean = book.imbalance > 0.6 ? 'buyers have the deeper book — support under price, for now' : book.imbalance < 0.4 ? 'sellers have the deeper book — supply overhead, for now' : 'the book is roughly balanced'
    L.push(`Order book: ${usd(book.bidUsd1pct)} resting within 1% below price vs ${usd(book.askUsd1pct)} above — ${Math.round(book.imbalance * 100)}% of nearby orders are bids, so ${lean}.`)
    if (book.walls.length) {
      L.push('Biggest walls: ' + book.walls.slice(0, 4).map((w) => `${w.side.toUpperCase()} ${usd(w.usd)} at $${w.price.toFixed(0)} (${w.multiple.toFixed(0)}× typical, ${Math.abs(w.distancePct).toFixed(2)}% ${w.distancePct < 0 ? 'below' : 'above'})`).join('; ') + '.')
    } else {
      L.push('No unusually large walls near price right now.')
    }
  }
  if (tape) {
    const mins = Math.max(1, Math.round((tape.to - tape.from) / 60_000))
    L.push(`Tape: ${tape.trades.toLocaleString()} trades in the last ${mins} min (${tape.tradesPerMinute.toFixed(0)}/min), ${Math.round(tape.buyShare * 100)}% buyer-initiated. Buyers ${usd(tape.buyUsd)} vs sellers ${usd(tape.sellUsd)} — net ${tape.deltaUsd >= 0 ? '+' : '-'}${usd(Math.abs(tape.deltaUsd))} ${tape.deltaUsd >= 0 ? 'buying' : 'selling'} pressure.`)
    if (tape.bigTrades.length) {
      const top = tape.bigTrades[0]
      L.push(`${tape.bigTrades.length} print(s) over ${usd(config.orderflow.bigTradeUsd)}: ${tape.bigBuys} buy(s), ${tape.bigSells} sell(s). Largest was a ${top.side} of ${top.qty.toFixed(3)} at $${top.price.toFixed(0)} (${usd(top.usd)}).`)
    } else {
      L.push(`No single trade over ${usd(config.orderflow.bigTradeUsd)} in that window — retail-sized flow.`)
    }
  }
  if (book || tape) L.push('Walls get pulled; treat the book as a hint. What the tape did already happened, so trust it more.')
  return L
}

export function logFlow(book: BookSnapshot | null, tape: TapeSnapshot | null): void {
  if (!book && !tape) return
  const now = Date.now()
  store().appendFlow({
    time: now, price: book?.price ?? null, bidUsd: book?.bidUsd1pct ?? null, askUsd: book?.askUsd1pct ?? null, imbalance: book?.imbalance ?? null,
    walls: book ? book.walls.map((w) => `${w.side[0]}${w.price.toFixed(0)}:${w.usd.toFixed(0)}`).join('|') : '',
    trades: tape?.trades ?? null, tpm: tape?.tradesPerMinute ?? null, buyShare: tape?.buyShare ?? null, deltaUsd: tape?.deltaUsd ?? null, bigBuys: tape?.bigBuys ?? null, bigSells: tape?.bigSells ?? null,
  })
  ensureDataDir()
  if (!existsSync(FLOW_LOG)) writeFileSync(FLOW_LOG, FLOW_HEADER + '\n')
  const row = [
    new Date(now).toISOString(),
    book?.price.toFixed(2) ?? '', book?.bidUsd1pct.toFixed(0) ?? '', book?.askUsd1pct.toFixed(0) ?? '', book?.imbalance.toFixed(3) ?? '',
    book ? book.walls.map((w) => `${w.side[0]}${w.price.toFixed(0)}:${w.usd.toFixed(0)}`).join('|') : '',
    tape?.trades ?? '', tape?.tradesPerMinute.toFixed(1) ?? '', tape?.buyShare.toFixed(3) ?? '', tape?.deltaUsd.toFixed(0) ?? '', tape?.bigBuys ?? '', tape?.bigSells ?? '',
  ].join(',')
  appendFileSync(FLOW_LOG, row + '\n')
}

export type FlowLogRow = { time: number; price: number; imbalance: number; deltaUsd: number; tradesPerMinute: number; bigBuys: number; bigSells: number }

export function readFlowLog(limit = 288): FlowLogRow[] {
  return store().flowLog(limit)
}

/** Reads both feeds, survives either failing, logs what it got. */
export async function getFlow(): Promise<FlowReport> {
  const errors: string[] = []
  let book: BookSnapshot | null = null
  let tape: TapeSnapshot | null = null
  if (!config.orderflow.enabled) return { book, tape, errors: ['Order flow is switched off in config.ts.'], lines: [] }

  await Promise.all([
    (async () => {
      try {
        const raw = (await fetchMarketJson(flowSources.orderBook, { symbol: config.symbol, limit: String(Math.min(5000, config.orderflow.depthLevels)) })) as { bids: Array<[string, string]>; asks: Array<[string, string]> }
        book = analyzeBook(raw.bids, raw.asks)
      } catch (err) {
        errors.push(`Order book: ${err instanceof Error ? err.message : String(err)}`)
      }
    })(),
    (async () => {
      try {
        const raw = (await fetchMarketJson(flowSources.trades, { symbol: config.symbol, limit: String(Math.min(1000, config.orderflow.tradesLimit)) })) as RawAggTrade[]
        tape = analyzeTape(raw)
      } catch (err) {
        errors.push(`Recent trades: ${err instanceof Error ? err.message : String(err)}`)
      }
    })(),
  ])
  logFlow(book, tape)
  return { book, tape, errors, lines: describeFlow(book, tape) }
}
