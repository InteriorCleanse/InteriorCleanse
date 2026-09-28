/**
 * The watchlist and PAPER bids — Gavel's practice ledger, kept as two small
 * JSON files in the data directory.
 *
 * A paper bid is a bid you write down instead of placing. Nothing is sent to
 * any auction. It exists so a beginner can practise picking a max bid, watch
 * how the auction ends, record whether they would have won, and learn what
 * these cars really sell for before spending a dollar.
 */
import { randomUUID } from 'node:crypto'
import type { Listing, PaperBid, WatchItem } from './types.ts'
import { readJson, userFile, writeJson } from './store.ts'

const WATCH_FILE = 'watchlist.json'
const PAPER_FILE = 'paper-bids.json'

function readWatch(): WatchItem[] {
  const v = readJson<unknown>(userFile(WATCH_FILE), [])
  return Array.isArray(v) ? (v as WatchItem[]) : []
}

function readPaper(): PaperBid[] {
  const v = readJson<unknown>(userFile(PAPER_FILE), [])
  return Array.isArray(v) ? (v as PaperBid[]) : []
}

/** Every car being watched, newest first. */
export function listWatch(): WatchItem[] {
  return readWatch().sort((a, b) => b.addedAt - a.addedAt)
}

/** Watch a car. Watching the same car twice changes nothing. */
export function addWatch(l: Listing): WatchItem[] {
  const items = readWatch()
  if (items.some((w) => w.listingId === l.id)) return listWatch()
  items.push({ listingId: l.id, title: l.title, url: l.url, addedAt: Date.now(), snapshot: l })
  writeJson(userFile(WATCH_FILE), items)
  return listWatch()
}

/** Stop watching a car. Removing one that is not there changes nothing. */
export function removeWatch(listingId: string): WatchItem[] {
  const items = readWatch()
  const kept = items.filter((w) => w.listingId !== listingId)
  if (kept.length !== items.length) writeJson(userFile(WATCH_FILE), kept)
  return listWatch()
}

/** Every paper bid, newest first. */
export function listPaper(): PaperBid[] {
  return readPaper().sort((a, b) => b.placedAt - a.placedAt)
}

/**
 * Write down a PAPER bid. `maxBidUsd` must be a positive, finite number of
 * dollars; anything else throws a plain-English Error. Nothing is sent anywhere.
 */
export function placePaperBid(l: Listing, maxBidUsd: number, note?: string): PaperBid {
  if (typeof maxBidUsd !== 'number' || !Number.isFinite(maxBidUsd) || maxBidUsd <= 0) {
    throw new Error('The max bid must be a positive number of dollars, for example 12500.')
  }
  const bid: PaperBid = {
    id: randomUUID(),
    listingId: l.id,
    title: l.title,
    url: l.url,
    maxBidUsd: Math.round(maxBidUsd * 100) / 100,
    placedAt: Date.now(),
    mode: 'PAPER',
    outcome: 'open',
  }
  const trimmed = (note ?? '').trim()
  if (trimmed) bid.note = trimmed.slice(0, 500)
  const bids = readPaper()
  bids.push(bid)
  writeJson(userFile(PAPER_FILE), bids)
  return bid
}

/** Record how the auction ended for a paper bid. Returns undefined when the id is unknown. */
export function setOutcome(id: string, outcome: 'won' | 'lost' | 'withdrawn'): PaperBid | undefined {
  if (outcome !== 'won' && outcome !== 'lost' && outcome !== 'withdrawn') return undefined
  const bids = readPaper()
  const bid = bids.find((b) => b.id === id)
  if (!bid) return undefined
  bid.outcome = outcome
  writeJson(userFile(PAPER_FILE), bids)
  return bid
}

/** The practice scoreboard. `totalMaxUsd` adds up every paper bid's max, whatever its outcome. */
export function paperSummary(): { open: number; won: number; lost: number; withdrawn: number; totalMaxUsd: number } {
  const s = { open: 0, won: 0, lost: 0, withdrawn: 0, totalMaxUsd: 0 }
  for (const b of readPaper()) {
    const o = b.outcome ?? 'open'
    if (o in s) s[o] += 1
    s.totalMaxUsd += Number.isFinite(b.maxBidUsd) ? b.maxBidUsd : 0
  }
  s.totalMaxUsd = Math.round(s.totalMaxUsd * 100) / 100
  return s
}
