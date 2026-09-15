/**
 * "What is the current state of my system?" — answered from disk and
 * from the last watch cycle, in one document, with no guessing.
 *
 * Every freshness figure carries the time it was measured and a plain
 * verdict (fresh / stale / never), so a screen or a person can see at a
 * glance whether the numbers on the dashboard can be trusted.
 */

import { accessSync, constants } from 'node:fs'
import { config } from '../config.ts'
import { INTERVAL_MS } from './market.ts'
import { DATA_DIR, DB_PATH, store } from './store.ts'
import { runtimeMode, describeMode } from './mode.ts'
import { stopState } from './killswitch.ts'
import { readPlan } from './plan.ts'
import { readPositions, todaysPaperStats } from './paperTrader.ts'
import { getSettings, overrides } from './settings.ts'
import { tradingDayKey } from './sessions.ts'
import { VERSION } from './version.ts'
import type { WatchState } from './watch.ts'
import type { FeedHealth } from './data/feed.ts'

export type Freshness = { verdict: 'fresh' | 'stale' | 'never'; asOf: number | null; ageSec: number | null; detail: string }

export type SystemState = {
  version: string
  now: number
  mode: string
  modeLabel: string
  killSwitch: ReturnType<typeof stopState>
  settings: ReturnType<typeof getSettings>
  settingsOverrides: Partial<ReturnType<typeof getSettings>>
  data: {
    dir: string
    dbPath: string
    dbSizeBytes: number
    integrity: string
    writable: boolean
    counts: ReturnType<typeof store>['counts'] extends () => infer R ? R : never
    migratedAt: string | null
  }
  feeds: { candles: Freshness; news: Freshness; orderFlow: Freshness; livePrice: Freshness }
  /** Where prices come from right now: the live stream, REST polling, or nothing yet. */
  marketData: FeedHealth | null
  trading: {
    dayKey: string
    openPaperPositions: number
    tradesToday: number
    lossesTodayR: number
    maxTradesPerDay: number
    dailyLossLimitR: number
    plan: ReturnType<typeof readPlan>
  }
  lastWatchAt: number | null
  lastError: { time: number; message: string } | null
  uptimeSec: number
  /** One line a person can read first. */
  summary: string
}

function freshness(asOf: number | null, maxAgeMs: number, now: number, what: string): Freshness {
  if (asOf === null) return { verdict: 'never', asOf: null, ageSec: null, detail: `${what}: never read` }
  const age = now - asOf
  const verdict = age <= maxAgeMs ? 'fresh' : 'stale'
  return { verdict, asOf, ageSec: Math.round(age / 1000), detail: `${what}: ${Math.round(age / 1000)}s old (${verdict})` }
}

export type SystemInputs = { lastWatch: WatchState | null; lastError: { time: number; message: string } | null; startedAt: number; now?: number; feed?: FeedHealth | null }

export function systemState(input: SystemInputs): SystemState {
  const now = input.now ?? Date.now()
  const s = store()
  let writable = true
  try { accessSync(DATA_DIR, constants.W_OK) } catch { writable = false }
  const intervalMs = INTERVAL_MS[config.interval] ?? 300_000
  const snap = input.lastWatch?.snap ?? null
  const feed = input.feed ?? null
  const snapLast = snap?.candles[snap.candles.length - 1]?.closeTime ?? null
  const feedLast = feed?.lastClosed ? feed.lastClosed.openTime + intervalMs - 1 : null
  const lastCandle = Math.max(snapLast ?? -1, feedLast ?? -1) >= 0 ? Math.max(snapLast ?? -1, feedLast ?? -1) : null
  const candles = freshness(lastCandle, intervalMs * 2 + 60_000, now, 'candles')
  const livePrice = freshness(feed?.priceAt ?? null, config.data.staleAfterMs, now, 'live price')
  const news = freshness(snap?.news?.fetchedAt ?? null, config.news.cacheMinutes * 60_000 * 3, now, 'news')
  const flowTime = snap?.flow?.book?.time ?? snap?.flow?.tape?.time ?? null
  const flow = freshness(flowTime, intervalMs * 2 + 60_000, now, 'order flow')
  const dayKey = tradingDayKey(now)
  const today = todaysPaperStats(dayKey)
  const kill = stopState()
  const integrity = s.integrity()
  const problems: string[] = []
  if (!writable) problems.push('data folder not writable')
  if (integrity !== 'ok') problems.push(`store integrity: ${integrity}`)
  if (candles.verdict !== 'fresh') problems.push(`candles ${candles.verdict}`)
  if (feed && feed.mode === 'rest' && config.data.stream) problems.push('live stream down, polling instead')
  if (kill.stopped) problems.push('kill switch on')
  const source = feed ? (feed.mode === 'stream' ? 'live stream' : feed.mode === 'rest' ? 'REST polling' : 'no feed') : 'no feed'
  const summary = problems.length ? `ATTENTION — ${problems.join('; ')}.` : `Healthy — ${runtimeMode()} mode, candles fresh via ${source}, ${today.trades}/${config.ict.maxTradesPerDay} trades today, store ok.`

  return {
    version: VERSION, now, mode: runtimeMode(), modeLabel: describeMode(), killSwitch: kill,
    settings: getSettings(), settingsOverrides: overrides(),
    data: { dir: DATA_DIR, dbPath: DB_PATH, dbSizeBytes: s.sizeBytes(), integrity, writable, counts: s.counts(), migratedAt: s.migration()?.at ?? null },
    feeds: { candles, news, orderFlow: flow, livePrice },
    marketData: feed,
    trading: { dayKey, openPaperPositions: readPositions().open.length, tradesToday: today.trades, lossesTodayR: today.lossesR, maxTradesPerDay: config.ict.maxTradesPerDay, dailyLossLimitR: config.ict.dailyLossLimitR, plan: readPlan() },
    lastWatchAt: input.lastWatch?.at ?? null,
    lastError: input.lastError,
    uptimeSec: Math.round((now - input.startedAt) / 1000),
    summary,
  }
}
