/**
 * MARKET DATA HEALTH — is the market the desk shows the market that exists?
 *
 * Counted from what the bus delivers (candle closes, stream up/down/gap) and
 * read from the feed's own health object and the candle store:
 *
 *   REST availability, WebSocket availability, candle freshness, missing
 *   candles in the recent window, gap events, reconnect count, stale-feed
 *   duration, timestamp anomalies, duplicate closes.
 *
 * Verdicts: OK · DATA DEGRADED · STALE · OFF. When the data is stale the
 * system says DATA DEGRADED or STALE and never pretends the market is
 * current.
 *
 * Known limitation: a malformed stream frame is dropped by the parser in
 * `binanceStream.ts` before it reaches the bus, so it is not counted here.
 * Everything that reaches the bus is.
 */

import { config } from '../../config.ts'
import { bus } from '../data/bus.ts'
import { findGaps, lastClosedOpenTime } from '../data/candleStore.ts'
import type { FeedHealth } from '../data/feed.ts'
import { INTERVAL_MS } from '../market.ts'
import { store } from '../store.ts'
import { ops } from './log.ts'

export type FeedVerdict = 'OK' | 'DATA DEGRADED' | 'STALE' | 'OFF'

export type FeedCounters = {
  closes: number
  duplicateCloses: number
  timestampAnomalies: number
  gapEvents: number
  streamUps: number
  streamDowns: number
  lastDownReason: string | null
  lastDownAt: number | null
  lastUpAt: number | null
  /** Reconnects seen on the bus since the monitor started (the stream's own counter is authoritative across its lifetime). */
  reconnectsSeen: number
  /** Reconnect timestamps in the last hour, for the "repeated reconnects" alert. */
  recentReconnects: number[]
}

export type FeedHealthReport = {
  at: number
  verdict: FeedVerdict
  mode: FeedHealth['mode'] | 'not reported'
  rest: { available: boolean | null; lastHeartbeatAt: number | null; lastFilled: number | null; detail: string }
  websocket: { configured: boolean; connected: boolean | null; host: string | null; reconnects: number; lastMessageAt: number | null; detail: string }
  freshness: { lastCloseOpenTime: number | null; expectedOpenTime: number; behindBy: number; ageSec: number | null; detail: string }
  missing: { window: string; expected: number; present: number; missingCandles: number; gaps: Array<{ from: number; to: number }>; knownGaps: number }
  staleForSec: number | null
  counters: FeedCounters
  thresholds: { degradedBehind: number; staleBehind: number }
  note: string
}

const counters: FeedCounters = { closes: 0, duplicateCloses: 0, timestampAnomalies: 0, gapEvents: 0, streamUps: 0, streamDowns: 0, lastDownReason: null, lastDownAt: null, lastUpAt: null, reconnectsSeen: 0, recentReconnects: [] }
const seenOpenTimes = new Set<number>()
let staleSince: number | null = null
let subscribed: Array<() => void> = []

/** For tests. */
export function resetFeedCounters(): void {
  Object.assign(counters, { closes: 0, duplicateCloses: 0, timestampAnomalies: 0, gapEvents: 0, streamUps: 0, streamDowns: 0, lastDownReason: null, lastDownAt: null, lastUpAt: null, reconnectsSeen: 0, recentReconnects: [] })
  seenOpenTimes.clear()
  staleSince = null
}

/** Subscribe the counters to the bus. Idempotent; returns the unsubscribe. */
export function watchFeed(): () => void {
  if (subscribed.length) return () => { for (const u of subscribed) u(); subscribed = [] }
  const step = INTERVAL_MS[config.interval] ?? 300_000
  subscribed = [
    bus.on('candle:closed', (c) => {
      counters.closes++
      const now = Date.now()
      if (seenOpenTimes.has(c.openTime)) { counters.duplicateCloses++; ops.warn('feed', 'duplicate-close', `candle ${new Date(c.openTime).toISOString()} announced twice`, { symbol: config.symbol }) }
      seenOpenTimes.add(c.openTime)
      if (seenOpenTimes.size > 5000) { const keep = [...seenOpenTimes].slice(-2500); seenOpenTimes.clear(); for (const t of keep) seenOpenTimes.add(t) }
      const misaligned = c.openTime % step !== 0
      const badClose = c.closeTime <= c.openTime || c.closeTime - c.openTime > step
      const future = c.openTime > now + step
      if (misaligned || badClose || future) { counters.timestampAnomalies++; ops.warn('feed', 'timestamp-anomaly', `candle open ${c.openTime} close ${c.closeTime}: ${[misaligned && 'open not aligned to the interval', badClose && 'close not one interval after open', future && 'open is in the future'].filter(Boolean).join(', ')}`, { symbol: config.symbol }) }
    }),
    bus.on('stream:up', (h) => { counters.streamUps++; counters.lastUpAt = Date.now(); ops.info('feed', 'stream-up', `stream connected to ${h.host ?? '?'}`) }),
    bus.on('stream:down', (h, reason) => { const now = Date.now(); counters.streamDowns++; counters.lastDownReason = reason; counters.lastDownAt = now; counters.reconnectsSeen++; counters.recentReconnects.push(now); counters.recentReconnects = counters.recentReconnects.filter((t) => now - t <= 3_600_000); ops.warn('feed', 'stream-down', `${reason} (reconnect #${h.reconnects})`) }),
    bus.on('stream:gap', (what) => { counters.gapEvents++; ops.warn('feed', 'gap', what) }),
  ]
  return () => { for (const u of subscribed) u(); subscribed = [] }
}

export function feedCounters(): FeedCounters { return { ...counters, recentReconnects: [...counters.recentReconnects] } }

export function feedHealthReport(feed: FeedHealth | null, now = Date.now()): FeedHealthReport {
  const step = INTERVAL_MS[config.interval] ?? 300_000
  const expected = lastClosedOpenTime(config.interval, now)
  const last = store().lastCandles(config.symbol, config.interval, 1)[0] ?? null
  const behindBy = last ? Math.max(0, Math.round((expected - last.openTime) / step)) : Number.POSITIVE_INFINITY
  const ageSec = last ? Math.round((now - (last.openTime + step)) / 1000) : null
  const windowFrom = expected - 24 * (3_600_000 / step) * step
  const present = store().candlesBetween(config.symbol, config.interval, windowFrom, expected).map((c) => c.openTime)
  const gaps = findGaps(present, step, windowFrom, expected)
  const knownGaps = (store().getJson<Array<{ from: number; to: number }>>(`candles:known-gaps:${config.symbol}:${config.interval}`) ?? []).length
  const missingCandles = gaps.reduce((n, g) => n + Math.floor((g.to - g.from) / step) + 1, 0)
  const expectedCount = Math.floor((expected - windowFrom) / step) + 1
  const thresholds = { degradedBehind: 2, staleBehind: 6 }
  const restAvailable = feed ? (feed.heartbeat ? now - feed.heartbeat.at <= 3 * step : null) : null
  const wsConnected = feed?.stream ? feed.stream.connected : null
  const wsLastMsg = feed?.stream ? Math.max(...Object.values(feed.stream.lastMessageAt).map((t) => t ?? -1)) : -1
  let verdict: FeedVerdict
  if (!feed || feed.mode === 'off') verdict = 'OFF'
  else if (!last || behindBy > thresholds.staleBehind) verdict = 'STALE'
  else if (behindBy > thresholds.degradedBehind || (config.data.stream && wsConnected === false) || counters.recentReconnects.length >= 5 || counters.timestampAnomalies > 0) verdict = 'DATA DEGRADED'
  else verdict = 'OK'
  if (verdict === 'STALE' || verdict === 'DATA DEGRADED') { if (staleSince === null) staleSince = now } else staleSince = null
  const note = verdict === 'OK' ? `Candles current (behind by ${behindBy} interval${behindBy === 1 ? '' : 's'}); ${missingCandles} missing in the last 24 h${knownGaps ? `, ${knownGaps} known gap(s) the exchange could not fill` : ''}.`
    : verdict === 'OFF' ? 'No feed is running; nothing here is current.'
    : verdict === 'STALE' ? `STALE: the last stored candle is ${behindBy === Number.POSITIVE_INFINITY ? 'absent' : `${behindBy} intervals behind the exchange clock`}. The desk is not showing the current market.`
    : `DATA DEGRADED: ${[behindBy > thresholds.degradedBehind && `${behindBy} intervals behind`, config.data.stream && wsConnected === false && 'stream down, REST polling', counters.recentReconnects.length >= 5 && `${counters.recentReconnects.length} reconnects in the last hour`, counters.timestampAnomalies > 0 && `${counters.timestampAnomalies} timestamp anomaly/ies`].filter(Boolean).join('; ')}.`
  return {
    at: now, verdict, mode: feed?.mode ?? 'not reported',
    rest: { available: restAvailable, lastHeartbeatAt: feed?.heartbeat?.at ?? null, lastFilled: feed?.heartbeat?.filled ?? null, detail: feed?.heartbeat ? `REST heartbeat ${Math.round((now - feed.heartbeat.at) / 1000)}s ago filled ${feed.heartbeat.filled} candle(s).` : 'The REST heartbeat has not run.' },
    websocket: { configured: Boolean(config.data.stream), connected: wsConnected, host: feed?.stream?.host ?? null, reconnects: feed?.stream?.reconnects ?? 0, lastMessageAt: wsLastMsg >= 0 ? wsLastMsg : null, detail: !config.data.stream ? 'Stream off in config; REST polling is the feed.' : wsConnected ? `Connected to ${feed?.stream?.host}.` : `Down${counters.lastDownReason ? `: ${counters.lastDownReason}` : ''}; REST polling until it is back.` },
    freshness: { lastCloseOpenTime: last?.openTime ?? null, expectedOpenTime: expected, behindBy: behindBy === Number.POSITIVE_INFINITY ? -1 : behindBy, ageSec, detail: last ? `Last stored candle opened ${new Date(last.openTime).toISOString()} (${last.source}); the exchange clock expects ${new Date(expected).toISOString()}.` : 'No candle stored.' },
    missing: { window: 'last 24 h', expected: expectedCount, present: present.length, missingCandles, gaps: gaps.slice(0, 20), knownGaps },
    staleForSec: staleSince === null ? null : Math.round((now - staleSince) / 1000),
    counters: feedCounters(), thresholds, note,
  }
}
