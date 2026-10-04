/**
 * WATCH ALERTS — the cars a member watches, checked on every Sniper sweep:
 *   ending   an auction with a real end time ends within two hours;
 *   price    the price moved by $100 or 3%, whichever is more, since the last look;
 *   ended    the auction is over (with the final price when the source gives one).
 * Each is sent once per car (the price alert again only on a further move).
 * Fresh prices come only from scans Gavel already ran; nothing extra is fetched,
 * and a date-only close (GSA) never gets a made-up countdown.
 */
import type { Listing, WatchItem } from './types.ts'
import { askingPrice } from './valuation.ts'

export type WatchAlert = { listingId: string; title: string; body: string }
const ENDING_MS = 2 * 3_600_000

function usd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}
function within(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`
}

/** Work out which alerts to send and update each item's snapshot. Pure: the caller writes both. */
export function checkWatch(items: WatchItem[], fresh: (id: string) => Listing | undefined, now: number): { alerts: WatchAlert[]; items: WatchItem[]; changed: boolean } {
  const alerts: WatchAlert[] = []
  let changed = false
  for (const w of items) {
    const f = fresh(w.listingId)
    const l = f ?? w.snapshot
    const a = (w.alerted ??= {})
    // The price last seen, read before the snapshot is replaced by the fresh listing.
    const before = a.lastPriceUsd ?? askingPrice(w.snapshot)
    if (f && f !== w.snapshot) { w.snapshot = f; changed = true }
    const price = askingPrice(l)
    const ended = l.soldUsd !== undefined || (l.endsAt !== undefined && l.endsAt <= now)
    if (ended) {
      if (!a.ended) {
        const final = l.soldUsd ?? (f ? price : undefined)
        alerts.push({ listingId: w.listingId, title: `Ended: ${w.title}`, body: `${final !== undefined ? `It finished at ${usd(final)}${l.soldUsd !== undefined ? '' : ' (the last price Gavel saw; the source may not show the final one)'}. ` : ''}If you placed a paper bid, record how it ended; the sold price makes the next estimate better.` })
        a.ended = true
        changed = true
      }
      continue
    }
    if (l.endsAt !== undefined && !l.endsAtDateOnly && l.endsAt - now <= ENDING_MS && !a.ending) {
      alerts.push({ listingId: w.listingId, title: `Ends in ${within(l.endsAt - now)}: ${w.title}`, body: `${price !== undefined ? `Now ${usd(price)}. ` : ''}Open the plan for your number, and never bid above it.` })
      a.ending = true
      changed = true
    }
    if (f && price !== undefined && before !== undefined && Math.abs(price - before) >= Math.max(100, before * 0.03)) {
      alerts.push({ listingId: w.listingId, title: `Price ${price > before ? 'up' : 'down'} to ${usd(price)}: ${w.title}`, body: `It was ${usd(before)} when Gavel last looked. ${price > before ? 'Check it is still under your number.' : 'It may now have more room under your number.'}` })
      a.lastPriceUsd = price
      changed = true
    } else if (a.lastPriceUsd === undefined && price !== undefined) {
      a.lastPriceUsd = price
      changed = true
    }
  }
  return { alerts, items, changed }
}
